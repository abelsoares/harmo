import type { Readable } from 'node:stream';
import { APPLE_TOP_LEVEL_KINDS, type AppleTopLevelKind, type ChildNode, type RawApplePayload } from '@harmo/common';
import sax from 'sax';

const TOP_LEVEL_SET = new Set<string>(APPLE_TOP_LEVEL_KINDS);

type ParserOptions = {
  highWaterMark?: number;
  lowWaterMark?: number;
};

const DEFAULT_HIGH = 256;
const DEFAULT_LOW = 64;

type StackFrame =
  | { kind: 'root' }
  | { kind: 'top'; envelope: RawApplePayload }
  | { kind: 'container'; container: ChildNode }
  | { kind: 'skip' };

type SaxNode = {
  name: string;
  attributes: Record<string, string>;
};

function pickMetadataParent(frame: StackFrame): { metadata: Record<string, string> } | null {
  if (frame.kind === 'top') {
    return frame.envelope;
  }

  if (frame.kind === 'container') {
    return frame.container;
  }

  return null;
}

function pickChildrenParent(frame: StackFrame): { children: ChildNode[] } | null {
  if (frame.kind === 'top') {
    return frame.envelope;
  }

  if (frame.kind === 'container') {
    return frame.container;
  }

  return null;
}

export async function* parseAppleExport(input: Readable, options: ParserOptions = {}): AsyncIterable<RawApplePayload> {
  const highWaterMark = options.highWaterMark ?? DEFAULT_HIGH;
  const lowWaterMark = options.lowWaterMark ?? DEFAULT_LOW;

  const out: RawApplePayload[] = [];
  let waiter: (() => void) | null = null;
  let ended = false;
  let fatal: Error | null = null;

  const wake = () => {
    const w = waiter;
    waiter = null;
    w?.();
  };

  // Strict mode preserves tag case and handles Apple's DTD without errors (verified in US-1a).
  const parser = sax.createStream(true, { trim: true, position: false });
  const stack: StackFrame[] = [];

  parser.on('opentag', (node: SaxNode) => {
    const top = stack[stack.length - 1];

    // Once we're in a skipped subtree, every subsequent opentag is also skipped.
    if (top?.kind === 'skip') {
      stack.push({ kind: 'skip' });

      return;
    }

    // Depth 1 is <HealthData> itself — we don't emit it.
    if (stack.length === 0) {
      stack.push({ kind: 'root' });

      return;
    }

    // Depth 2: any direct child of <HealthData> is a top-level envelope candidate.
    if (stack.length === 1) {
      if (!TOP_LEVEL_SET.has(node.name)) {
        // Unknown top-level element — skip it without emitting; downstream can quarantine if it cares.
        stack.push({ kind: 'skip' });

        return;
      }

      const envelope: RawApplePayload = {
        kind: node.name as AppleTopLevelKind,
        attrs: { ...node.attributes },
        metadata: {},
        children: []
      };

      stack.push({ kind: 'top', envelope });

      return;
    }

    // Depth >= 3: we are inside a top-level envelope.
    const envelopeFrame = stack[1];

    if (envelopeFrame?.kind !== 'top') {
      // Shouldn't happen for valid input; be defensive.
      stack.push({ kind: 'skip' });

      return;
    }

    // MetadataEntry collapses into the parent's metadata map.
    if (node.name === 'MetadataEntry') {
      const parent = pickMetadataParent(top);

      if (parent && node.attributes.key !== undefined) {
        parent.metadata[node.attributes.key] = node.attributes.value ?? '';
      }

      stack.push({ kind: 'skip' });

      return;
    }

    // A Correlation's child Records also appear standalone at top level (per Apple's DTD comment),
    // so we deliberately do not capture them inside the Correlation envelope. US-5 links them
    // post-hoc via (subject_id, source_id, start_time, type).
    if (envelopeFrame.envelope.kind === 'Correlation' && node.name === 'Record') {
      stack.push({ kind: 'skip' });

      return;
    }

    const parent = pickChildrenParent(top);

    if (!parent) {
      stack.push({ kind: 'skip' });

      return;
    }

    const child: ChildNode = {
      name: node.name,
      attrs: { ...node.attributes },
      metadata: {},
      children: []
    };

    parent.children.push(child);
    stack.push({ kind: 'container', container: child });
  });

  parser.on('closetag', () => {
    const popped = stack.pop();

    if (popped?.kind === 'top') {
      out.push(popped.envelope);

      if (out.length >= highWaterMark && !input.isPaused()) {
        input.pause();
      }

      wake();
    }
  });

  parser.on('error', (err: Error) => {
    fatal = err;
    wake();
  });

  parser.on('end', () => {
    ended = true;
    wake();
  });

  input.on('error', (err: Error) => {
    fatal = err;
    wake();
  });

  input.pipe(parser);

  try {
    while (true) {
      if (fatal) {
        throw fatal;
      }

      if (out.length > 0) {
        const envelope = out.shift() as RawApplePayload;

        if (out.length <= lowWaterMark && input.isPaused()) {
          input.resume();
        }

        yield envelope;
        continue;
      }

      if (ended) {
        return;
      }

      await new Promise<void>(resolve => {
        waiter = resolve;
      });
    }
  } finally {
    input.unpipe(parser);

    if (typeof input.destroy === 'function' && !input.destroyed) {
      input.destroy();
    }
  }
}

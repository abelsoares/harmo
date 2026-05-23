import type { Readable } from 'node:stream';
import sax from 'sax';

export type SkimEvent = { kind: string };

type SkimOptions = {
  highWaterMark?: number;
  lowWaterMark?: number;
};

const DEFAULT_HIGH = 256;
const DEFAULT_LOW = 64;

export async function* skimAppleExport(input: Readable, options: SkimOptions = {}): AsyncIterable<SkimEvent> {
  const highWaterMark = options.highWaterMark ?? DEFAULT_HIGH;
  const lowWaterMark = options.lowWaterMark ?? DEFAULT_LOW;

  const queue: SkimEvent[] = [];
  let waiter: (() => void) | null = null;
  let ended = false;
  let fatal: Error | null = null;

  const wake = () => {
    const w = waiter;
    waiter = null;
    w?.();
  };

  // Strict mode preserves tag case and (despite the name) handles Apple's DOCTYPE+inline DTD
  // without errors — verified against the real 512 MB export.
  const parser = sax.createStream(true, { trim: true, position: false });

  parser.on('opentag', (node: { name: string }) => {
    queue.push({ kind: node.name });

    if (queue.length >= highWaterMark && !input.isPaused()) {
      input.pause();
    }

    wake();
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

      if (queue.length > 0) {
        const event = queue.shift() as SkimEvent;

        if (queue.length <= lowWaterMark && input.isPaused()) {
          input.resume();
        }

        yield event;
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

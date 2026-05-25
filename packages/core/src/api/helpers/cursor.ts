// Keyset cursor for paginating timestamp+id ordered resources.
// Encodes the last seen (start_time, id) as base64url JSON so the next page
// can be served via `(start_time, id) > (t, i)` (ASC) without OFFSET scans.

export type Cursor = { t: string; i: string };

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf-8').toString('base64url');
}

export function decodeCursor(input: string): Cursor {
  try {
    const decoded = Buffer.from(input, 'base64url').toString('utf-8');
    const parsed = JSON.parse(decoded) as { t?: unknown; i?: unknown };

    if (typeof parsed.t !== 'string' || typeof parsed.i !== 'string') {
      throw new Error('cursor shape');
    }

    if (Number.isNaN(Date.parse(parsed.t))) {
      throw new Error('cursor timestamp');
    }

    return { t: parsed.t, i: parsed.i };
  } catch {
    throw new ApiError('invalid_cursor', `cursor is not a valid harmo cursor: ${JSON.stringify(input)}`, 400);
  }
}

// Lightweight HTTP error our error-handler middleware translates to a JSON body.
export class ApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
    this.name = 'ApiError';
  }
}

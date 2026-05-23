const APPLE_TIMESTAMP_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/;

export type AppleTimestamp = {
  utc: Date;
  offsetMinutes: number;
};

export function parseAppleTimestamp(input: string): AppleTimestamp {
  const match = APPLE_TIMESTAMP_RE.exec(input);

  if (!match) {
    throw new Error(`invalid apple timestamp: ${JSON.stringify(input)}`);
  }

  const [, y, mo, d, h, mi, s, sign, oh, om] = match;
  const offsetMinutes = (sign === '+' ? 1 : -1) * (Number(oh) * 60 + Number(om));
  const localUtcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  const utcMs = localUtcMs - offsetMinutes * 60_000;

  return { utc: new Date(utcMs), offsetMinutes };
}

import { createHash } from 'node:crypto';
import type { Knex } from 'knex';

export function computeSourceIdentityHash(parts: {
  vendor: string;
  sourceName: string;
  hardwareVersion?: string | null;
  productType?: string | null;
}): string {
  const input = [parts.vendor, parts.sourceName, parts.hardwareVersion ?? '', parts.productType ?? ''].join('|');

  return createHash('sha256').update(input).digest('hex');
}

export async function upsertSource(
  _knex: Knex,
  _input: { subjectId: string; identityHash: string; vendor: string; sourceName: string }
): Promise<bigint> {
  // TODO: cached upsert returning source id (US-6)
  return 0n;
}

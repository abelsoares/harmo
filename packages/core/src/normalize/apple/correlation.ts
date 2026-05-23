import type { RawEnvelope } from '@harmo/common';
import type { Knex } from 'knex';
import type { NormalizeResult } from '../dispatch';

export async function normalizeAppleCorrelation(_knex: Knex, _envelope: RawEnvelope): Promise<NormalizeResult> {
  // TODO: create correlation wrapper, normalize child records (US-5)
  return { kind: 'quarantine', reason: 'not_implemented', context: { handler: 'apple.correlation' } };
}

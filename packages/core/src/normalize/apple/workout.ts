import type { RawEnvelope } from '@harmo/common';
import type { Knex } from 'knex';
import type { NormalizeResult } from '../dispatch';

export async function normalizeAppleWorkout(_knex: Knex, _envelope: RawEnvelope): Promise<NormalizeResult> {
  // TODO: create workout row, return descriptor (US-4)
  return { kind: 'quarantine', reason: 'not_implemented', context: { handler: 'apple.workout' } };
}

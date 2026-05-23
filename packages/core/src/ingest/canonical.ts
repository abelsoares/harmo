import type { CanonicalSample } from '@harmo/common';
import type { Knex } from 'knex';

export async function ingestCanonical(
  _knex: Knex,
  _samples: CanonicalSample[]
): Promise<{ inserted: number; updated: number }> {
  // TODO: batched INSERT ... ON CONFLICT (subject_id, source_id, external_id, start_time) DO UPDATE (US-6)
  return { inserted: 0, updated: 0 };
}

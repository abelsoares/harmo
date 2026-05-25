import type { CanonicalCorrelationSeed } from '@harmo/common';
import type { Knex } from 'knex';

export async function upsertCorrelation(
  knex: Knex,
  sourceId: bigint,
  correlation: CanonicalCorrelationSeed
): Promise<bigint> {
  const result = await knex.raw<{ rows: Array<{ id: string }> }>(
    `INSERT INTO correlations (
       subject_id, source_id, metric, start_time, end_time, external_id, metadata
     )
     VALUES (?, ?, ?, ?, ?, ?, ?::jsonb)
     ON CONFLICT (subject_id, source_id, external_id) DO UPDATE SET
       metric     = EXCLUDED.metric,
       start_time = EXCLUDED.start_time,
       end_time   = EXCLUDED.end_time,
       metadata   = EXCLUDED.metadata
     RETURNING id`,
    [
      correlation.subjectId,
      sourceId.toString(),
      correlation.metric,
      correlation.startTime,
      correlation.endTime,
      correlation.externalId,
      JSON.stringify(correlation.metadata ?? {})
    ]
  );

  return BigInt(result.rows[0].id);
}

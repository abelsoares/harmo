import type { CanonicalSample } from '@harmo/common';
import type { Knex } from 'knex';

type RawBinding = string | number | boolean | Date | null;

const MAX_CHUNK = 500;

const COLUMNS = [
  'subject_id',
  'metric',
  'value_num',
  'value_text',
  'unit',
  'start_time',
  'end_time',
  'start_offset_minutes',
  'source_id',
  'workout_id',
  'correlation_id',
  'external_id',
  'registry_version',
  'metadata'
] as const;

const ROW_PLACEHOLDER = `(${COLUMNS.map(c => (c === 'metadata' ? '?::jsonb' : '?')).join(', ')})`;

function bindingsFor(sample: CanonicalSample): RawBinding[] {
  return [
    sample.subjectId,
    sample.metric,
    sample.valueNum,
    sample.valueText,
    sample.unit,
    sample.startTime,
    sample.endTime,
    sample.startOffsetMinutes,
    sample.sourceId.toString(),
    sample.workoutId !== null ? sample.workoutId.toString() : null,
    sample.correlationId !== null ? sample.correlationId.toString() : null,
    sample.externalId,
    sample.registryVersion,
    JSON.stringify(sample.metadata ?? {})
  ];
}

function dedupeChunk(chunk: CanonicalSample[]): CanonicalSample[] {
  // Within a single INSERT … ON CONFLICT DO UPDATE statement, Postgres refuses to update the
  // same conflict target twice. Apple exports occasionally ship the same logical record more
  // than once (and our synthetic external_id correctly hashes them to the same key), so we
  // collapse same-key entries here. Last-write-wins matches our ON CONFLICT semantics.
  if (chunk.length < 2) {
    return chunk;
  }

  const byKey = new Map<string, CanonicalSample>();

  for (const s of chunk) {
    const key = `${s.subjectId}|${s.sourceId}|${s.metric}|${s.externalId}|${s.startTime.toISOString()}`;

    byKey.set(key, s);
  }

  return [...byKey.values()];
}

// Partitioned tables do not expose system columns (e.g. xmax) through RETURNING, so we can't
// use the classic `(xmax = 0)` trick to distinguish inserts from updates. The caller (worker)
// can compare DB row counts before/after if it needs that distinction.
async function ingestChunk(knex: Knex, rawChunk: CanonicalSample[]): Promise<number> {
  const chunk = dedupeChunk(rawChunk);
  const valuesClause = chunk.map(() => ROW_PLACEHOLDER).join(', ');
  const sql = `
    INSERT INTO samples (${COLUMNS.join(', ')})
    VALUES ${valuesClause}
    ON CONFLICT (subject_id, source_id, metric, external_id, start_time) DO UPDATE SET
      value_num            = EXCLUDED.value_num,
      value_text           = EXCLUDED.value_text,
      unit                 = EXCLUDED.unit,
      end_time             = EXCLUDED.end_time,
      start_offset_minutes = EXCLUDED.start_offset_minutes,
      workout_id           = EXCLUDED.workout_id,
      correlation_id       = EXCLUDED.correlation_id,
      registry_version     = EXCLUDED.registry_version,
      metadata             = EXCLUDED.metadata,
      ingested_at          = now()
  `;
  const bindings = chunk.flatMap(bindingsFor);
  const result = await knex.raw<{ rowCount?: number }>(sql, bindings);

  return result.rowCount ?? chunk.length;
}

export async function ingestCanonical(knex: Knex, samples: CanonicalSample[]): Promise<{ processed: number }> {
  if (samples.length === 0) {
    return { processed: 0 };
  }

  let processed = 0;

  for (let i = 0; i < samples.length; i += MAX_CHUNK) {
    const chunk = samples.slice(i, i + MAX_CHUNK);

    processed += await ingestChunk(knex, chunk);
  }

  return { processed };
}

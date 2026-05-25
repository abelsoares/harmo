import type { Knex } from 'knex';

export type AggregateBucket = 'hour' | 'day' | 'week' | 'month';
export type AggregateFn = 'sum' | 'avg' | 'min' | 'max' | 'latest';

export type AggregateInput = {
  subjectId: string;
  metric: string;
  bucket: AggregateBucket;
  agg?: AggregateFn;
  from: Date;
  to: Date;
  timezone?: string;
};

export type AggregateRow = {
  bucketStart: Date;
  value: number;
  sampleCount: number;
};

type MetricRow = {
  metric: string;
  value_kind: 'quantity' | 'category';
  default_agg: AggregateFn;
  allowed_aggs: AggregateFn[];
  resolve_overlap: boolean;
};

const SQL_AGG: Record<Exclude<AggregateFn, 'latest'>, string> = {
  sum: 'sum',
  avg: 'avg',
  min: 'min',
  max: 'max'
};

// Tunable: how wide is one "overlap window" — the unit at which we pick a single source.
// 1 minute matches Apple Watch + iPhone step-count overlap behavior we see in the export.
const OVERLAP_WINDOW = 'minute';

async function resolveTimezone(knex: Knex, input: AggregateInput): Promise<string> {
  if (input.timezone) {
    return input.timezone;
  }

  const subject = await knex('subjects')
    .where({ id: input.subjectId })
    .first<{ timezone: string } | undefined>('timezone');

  return subject?.timezone ?? 'UTC';
}

async function runSimpleAggregate(
  knex: Knex,
  input: AggregateInput,
  agg: Exclude<AggregateFn, 'latest'>,
  tz: string
): Promise<AggregateRow[]> {
  const result = await knex.raw<{
    rows: Array<{ bucket_start: Date; value: number | null; sample_count: number }>;
  }>(
    `SELECT
       (date_trunc(?, start_time AT TIME ZONE ?) AT TIME ZONE ?) AS bucket_start,
       ${SQL_AGG[agg]}(value_num)::double precision AS value,
       count(*)::int AS sample_count
     FROM samples
     WHERE subject_id = ?
       AND metric = ?
       AND start_time >= ?
       AND start_time <  ?
     GROUP BY 1
     ORDER BY 1`,
    [input.bucket, tz, tz, input.subjectId, input.metric, input.from, input.to]
  );

  return result.rows
    .filter(r => r.value !== null)
    .map(r => ({
      bucketStart: r.bucket_start,
      value: r.value as number,
      sampleCount: Number(r.sample_count)
    }));
}

async function runSimpleAggregateWithOverlap(
  knex: Knex,
  input: AggregateInput,
  agg: Exclude<AggregateFn, 'latest'>,
  tz: string
): Promise<AggregateRow[]> {
  const result = await knex.raw<{
    rows: Array<{ bucket_start: Date; value: number | null; sample_count: number }>;
  }>(
    `WITH ranked AS (
       SELECT
         date_trunc(?, s.start_time AT TIME ZONE ?) AS bucket_local,
         s.value_num,
         ROW_NUMBER() OVER (
           PARTITION BY date_trunc('${OVERLAP_WINDOW}', s.start_time)
           ORDER BY COALESCE(sp.rank, 9999), s.ingested_at DESC, s.source_id
         ) AS rn
       FROM samples s
       LEFT JOIN source_priority sp
         ON sp.subject_id = s.subject_id
        AND sp.source_id  = s.source_id
        AND (sp.metric = s.metric OR sp.metric = '*')
       WHERE s.subject_id = ?
         AND s.metric     = ?
         AND s.start_time >= ?
         AND s.start_time <  ?
     )
     SELECT
       (bucket_local AT TIME ZONE ?) AS bucket_start,
       ${SQL_AGG[agg]}(value_num)::double precision AS value,
       count(*)::int AS sample_count
     FROM ranked
     WHERE rn = 1
     GROUP BY 1
     ORDER BY 1`,
    [input.bucket, tz, input.subjectId, input.metric, input.from, input.to, tz]
  );

  return result.rows
    .filter(r => r.value !== null)
    .map(r => ({
      bucketStart: r.bucket_start,
      value: r.value as number,
      sampleCount: Number(r.sample_count)
    }));
}

async function runLatestWithOverlap(knex: Knex, input: AggregateInput, tz: string): Promise<AggregateRow[]> {
  const result = await knex.raw<{
    rows: Array<{ bucket_start: Date; value: number; sample_count: number }>;
  }>(
    `WITH ranked AS (
       SELECT
         date_trunc(?, s.start_time AT TIME ZONE ?) AS bucket_local,
         s.value_num,
         s.start_time,
         ROW_NUMBER() OVER (
           PARTITION BY date_trunc('${OVERLAP_WINDOW}', s.start_time)
           ORDER BY COALESCE(sp.rank, 9999), s.ingested_at DESC, s.source_id
         ) AS rn
       FROM samples s
       LEFT JOIN source_priority sp
         ON sp.subject_id = s.subject_id
        AND sp.source_id  = s.source_id
        AND (sp.metric = s.metric OR sp.metric = '*')
       WHERE s.subject_id = ?
         AND s.metric     = ?
         AND s.start_time >= ?
         AND s.start_time <  ?
         AND s.value_num IS NOT NULL
     ),
     winners AS (
       SELECT bucket_local, value_num, start_time FROM ranked WHERE rn = 1
     )
     SELECT bucket_start, value, sample_count FROM (
       SELECT
         (bucket_local AT TIME ZONE ?) AS bucket_start,
         value_num::double precision AS value,
         ROW_NUMBER() OVER (PARTITION BY bucket_local ORDER BY start_time DESC) AS rn,
         COUNT(*) OVER (PARTITION BY bucket_local)::int AS sample_count
       FROM winners
     ) latest
     WHERE rn = 1
     ORDER BY bucket_start`,
    [input.bucket, tz, input.subjectId, input.metric, input.from, input.to, tz]
  );

  return result.rows.map(r => ({
    bucketStart: r.bucket_start,
    value: Number(r.value),
    sampleCount: Number(r.sample_count)
  }));
}

async function runLatest(knex: Knex, input: AggregateInput, tz: string): Promise<AggregateRow[]> {
  // For each bucket, take the value_num from the sample with the latest start_time.
  // ROW_NUMBER + COUNT in a single scan keeps this efficient on the partitioned table.
  const result = await knex.raw<{
    rows: Array<{ bucket_start: Date; value: number; sample_count: number }>;
  }>(
    `SELECT bucket_start, value, sample_count FROM (
       SELECT
         (date_trunc(?, start_time AT TIME ZONE ?) AT TIME ZONE ?) AS bucket_start,
         value_num::double precision AS value,
         ROW_NUMBER() OVER (
           PARTITION BY date_trunc(?, start_time AT TIME ZONE ?)
           ORDER BY start_time DESC
         ) AS rn,
         COUNT(*) OVER (PARTITION BY date_trunc(?, start_time AT TIME ZONE ?))::int AS sample_count
       FROM samples
       WHERE subject_id = ?
         AND metric = ?
         AND start_time >= ?
         AND start_time <  ?
         AND value_num IS NOT NULL
     ) ranked
     WHERE rn = 1
     ORDER BY bucket_start`,
    [input.bucket, tz, tz, input.bucket, tz, input.bucket, tz, input.subjectId, input.metric, input.from, input.to]
  );

  return result.rows.map(r => ({
    bucketStart: r.bucket_start,
    value: Number(r.value),
    sampleCount: Number(r.sample_count)
  }));
}

export async function aggregate(knex: Knex, input: AggregateInput): Promise<AggregateRow[]> {
  const metric = await knex('metrics_registry')
    .where({ metric: input.metric })
    .first<MetricRow | undefined>('metric', 'value_kind', 'default_agg', 'allowed_aggs', 'resolve_overlap');

  if (!metric) {
    throw new Error(`unknown metric: ${input.metric}`);
  }

  if (metric.value_kind !== 'quantity') {
    throw new Error(`aggregate() supports quantity metrics only; '${input.metric}' is ${metric.value_kind}`);
  }

  const agg = input.agg ?? metric.default_agg;

  if (!metric.allowed_aggs.includes(agg)) {
    throw new Error(
      `agg '${agg}' not allowed for metric '${input.metric}'; allowed: ${metric.allowed_aggs.join(', ')}`
    );
  }

  const tz = await resolveTimezone(knex, input);

  if (metric.resolve_overlap) {
    return agg === 'latest'
      ? runLatestWithOverlap(knex, input, tz)
      : runSimpleAggregateWithOverlap(knex, input, agg, tz);
  }

  return agg === 'latest' ? runLatest(knex, input, tz) : runSimpleAggregate(knex, input, agg, tz);
}

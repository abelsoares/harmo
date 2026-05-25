import { type AggregateRow, aggregate } from '@src/aggregate';
import type { Knex } from 'knex';

export type ReportOptions = {
  subjectId: string;
  from?: Date;
  to?: Date;
  timezone?: string;
};

export type ReportData = {
  subjectId: string;
  timezone: string;
  range: { from: Date; to: Date };
  totals: {
    samples: number;
    workouts: number;
    correlations: number;
    sources: number;
    quarantine: number;
  };
  perMetric: Array<{ metric: string; sampleCount: number; firstAt: Date | null; lastAt: Date | null }>;
  sources: Array<{ id: string; name: string; vendor: string; sampleCount: number }>;
  workouts: {
    count: number;
    totalDurationSeconds: number;
    byActivity: Array<{ activityType: string; count: number; totalDurationSeconds: number }>;
    recent: Array<{
      activityType: string;
      startTime: Date;
      endTime: Date;
      durationSeconds: number;
      sourceName: string;
    }>;
  };
  hrBucket: 'hour' | 'day' | 'week' | 'month';
  dailySteps: AggregateRow[];
  heartRate: { avg: AggregateRow[]; min: AggregateRow[]; max: AggregateRow[] };
  dailyActiveEnergy: AggregateRow[];
  dailyDistance: AggregateRow[];
  bodyMass: AggregateRow[];
  dailyStandTime: AggregateRow[];
  dailyExerciseTime: AggregateRow[];
  vo2Max: AggregateRow[];
  restingHr: AggregateRow[];
  sleepCategories: Array<{ category: string; samples: number }>;
};

async function resolveRange(knex: Knex, options: ReportOptions): Promise<{ from: Date; to: Date; timezone: string }> {
  const subject = await knex('subjects').where({ id: options.subjectId }).first<{ timezone: string }>('timezone');
  const timezone = options.timezone ?? subject?.timezone ?? 'UTC';

  if (options.from && options.to) {
    return { from: options.from, to: options.to, timezone };
  }

  const bounds = await knex
    .raw<{ rows: Array<{ min: Date | null; max: Date | null }> }>(
      'SELECT min(start_time) AS min, max(start_time) AS max FROM samples WHERE subject_id = ?',
      [options.subjectId]
    )
    .then(r => r.rows[0]);

  const from = options.from ?? bounds.min ?? new Date('1970-01-01T00:00:00Z');
  const to = options.to ?? (bounds.max ? new Date(bounds.max.getTime() + 1) : new Date());

  return { from, to, timezone };
}

export async function collectReport(knex: Knex, options: ReportOptions): Promise<ReportData> {
  const { from, to, timezone } = await resolveRange(knex, options);
  const subjectId = options.subjectId;

  const [counts, perMetric, sources, workoutsByActivity, recentWorkouts, sleepCats] = await Promise.all([
    knex
      .raw<{
        rows: Array<{ samples: string; workouts: string; correlations: string; sources: string; quarantine: string }>;
      }>(
        `SELECT
           (SELECT count(*) FROM samples       WHERE subject_id = ?) AS samples,
           (SELECT count(*) FROM workouts      WHERE subject_id = ?) AS workouts,
           (SELECT count(*) FROM correlations  WHERE subject_id = ?) AS correlations,
           (SELECT count(*) FROM sources       WHERE subject_id = ?) AS sources,
           (SELECT count(*) FROM quarantine    WHERE subject_id = ?) AS quarantine`,
        [subjectId, subjectId, subjectId, subjectId, subjectId]
      )
      .then(r => r.rows[0]),
    knex
      .raw<{ rows: Array<{ metric: string; n: string; first_at: Date | null; last_at: Date | null }> }>(
        `SELECT metric,
                count(*)::text AS n,
                min(start_time) AS first_at,
                max(start_time) AS last_at
         FROM samples WHERE subject_id = ? GROUP BY metric ORDER BY count(*) DESC`,
        [subjectId]
      )
      .then(r => r.rows),
    knex
      .raw<{ rows: Array<{ id: string; source_name: string; vendor: string; n: string }> }>(
        `SELECT s.id, s.source_name, s.vendor, count(sa.*)::text AS n
         FROM sources s LEFT JOIN samples sa ON sa.source_id = s.id
         WHERE s.subject_id = ?
         GROUP BY s.id, s.source_name, s.vendor
         ORDER BY count(sa.*) DESC NULLS LAST`,
        [subjectId]
      )
      .then(r => r.rows),
    knex
      .raw<{ rows: Array<{ activity_type: string; n: string; total_s: string }> }>(
        `SELECT activity_type, count(*)::text AS n, COALESCE(sum(duration_s),0)::text AS total_s
         FROM workouts WHERE subject_id = ?
           AND start_time >= ? AND start_time < ?
         GROUP BY activity_type ORDER BY count(*) DESC`,
        [subjectId, from, to]
      )
      .then(r => r.rows),
    knex('workouts')
      .join('sources', 'sources.id', 'workouts.source_id')
      .where('workouts.subject_id', subjectId)
      .andWhere('workouts.start_time', '>=', from)
      .andWhere('workouts.start_time', '<', to)
      .orderBy('workouts.start_time', 'desc')
      .limit(20)
      .select<
        Array<{
          activity_type: string;
          start_time: Date;
          end_time: Date;
          duration_s: number;
          source_name: string;
        }>
      >(
        'workouts.activity_type as activity_type',
        'workouts.start_time as start_time',
        'workouts.end_time as end_time',
        'workouts.duration_s as duration_s',
        'sources.source_name as source_name'
      ),
    knex
      .raw<{ rows: Array<{ value_text: string; n: string }> }>(
        `SELECT value_text, count(*)::text AS n
         FROM samples
         WHERE subject_id = ? AND metric = 'sleep_analysis'
           AND start_time >= ? AND start_time < ?
         GROUP BY value_text ORDER BY count(*) DESC`,
        [subjectId, from, to]
      )
      .then(r => r.rows)
  ]);

  // Aggregates — wrap each in try/catch since some metrics may not exist in the dataset.
  const safeAggregate = async (
    metric: string,
    bucket: 'day' | 'hour' | 'week' | 'month',
    agg?: 'sum' | 'avg' | 'min' | 'max' | 'latest'
  ) => {
    try {
      return await aggregate(knex, { subjectId, metric, bucket, agg, from, to, timezone });
    } catch {
      return [];
    }
  };

  // Adaptive HR bucket: hourly is too granular for >60-day ranges (5 years ≈ 43k points).
  const rangeDays = (to.getTime() - from.getTime()) / 86_400_000;
  const hrBucket: 'hour' | 'day' | 'week' = rangeDays > 365 ? 'week' : rangeDays > 60 ? 'day' : 'hour';

  const [
    dailySteps,
    hrAvg,
    hrMin,
    hrMax,
    dailyActiveEnergy,
    dailyDistance,
    bodyMass,
    dailyStandTime,
    dailyExerciseTime,
    vo2Max,
    restingHr
  ] = await Promise.all([
    safeAggregate('step_count', 'day'),
    safeAggregate('heart_rate', hrBucket, 'avg'),
    safeAggregate('heart_rate', hrBucket, 'min'),
    safeAggregate('heart_rate', hrBucket, 'max'),
    safeAggregate('active_energy_burned', 'day'),
    safeAggregate('distance_walking_running', 'day'),
    safeAggregate('body_mass', 'day', 'latest'),
    safeAggregate('apple_stand_time', 'day'),
    safeAggregate('apple_exercise_time', 'day'),
    safeAggregate('vo2_max', 'day', 'latest'),
    safeAggregate('resting_heart_rate', 'day', 'avg')
  ]);

  const totalDurationSeconds = workoutsByActivity.reduce((s, w) => s + Number(w.total_s), 0);

  return {
    subjectId,
    timezone,
    range: { from, to },
    totals: {
      samples: Number(counts?.samples ?? 0),
      workouts: Number(counts?.workouts ?? 0),
      correlations: Number(counts?.correlations ?? 0),
      sources: Number(counts?.sources ?? 0),
      quarantine: Number(counts?.quarantine ?? 0)
    },
    perMetric: perMetric.map(m => ({
      metric: m.metric,
      sampleCount: Number(m.n),
      firstAt: m.first_at,
      lastAt: m.last_at
    })),
    sources: sources.map(s => ({
      id: s.id,
      name: s.source_name,
      vendor: s.vendor,
      sampleCount: Number(s.n)
    })),
    workouts: {
      count: workoutsByActivity.reduce((s, w) => s + Number(w.n), 0),
      totalDurationSeconds,
      byActivity: workoutsByActivity.map(w => ({
        activityType: w.activity_type,
        count: Number(w.n),
        totalDurationSeconds: Number(w.total_s)
      })),
      recent: recentWorkouts.map(w => ({
        activityType: w.activity_type,
        startTime: w.start_time,
        endTime: w.end_time,
        durationSeconds: Number(w.duration_s),
        sourceName: w.source_name
      }))
    },
    hrBucket,
    dailySteps,
    heartRate: { avg: hrAvg, min: hrMin, max: hrMax },
    dailyActiveEnergy,
    dailyDistance,
    bodyMass,
    dailyStandTime,
    dailyExerciseTime,
    vo2Max,
    restingHr,
    sleepCategories: sleepCats.map(s => ({ category: s.value_text, samples: Number(s.n) }))
  };
}

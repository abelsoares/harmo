import type { CanonicalWorkoutSeed } from '@harmo/common';
import type { Knex } from 'knex';

export async function upsertWorkout(knex: Knex, sourceId: bigint, workout: CanonicalWorkoutSeed): Promise<bigint> {
  const result = await knex.raw<{ rows: Array<{ id: string }> }>(
    `INSERT INTO workouts (
       subject_id, source_id, activity_type, start_time, end_time,
       duration_s, external_id, metadata
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb)
     ON CONFLICT (subject_id, source_id, external_id) DO UPDATE SET
       activity_type = EXCLUDED.activity_type,
       start_time    = EXCLUDED.start_time,
       end_time      = EXCLUDED.end_time,
       duration_s    = EXCLUDED.duration_s,
       metadata      = EXCLUDED.metadata
     RETURNING id`,
    [
      workout.subjectId,
      sourceId.toString(),
      workout.activityType,
      workout.startTime,
      workout.endTime,
      workout.durationSeconds,
      workout.externalId,
      JSON.stringify(workout.metadata ?? {})
    ]
  );

  return BigInt(result.rows[0].id);
}

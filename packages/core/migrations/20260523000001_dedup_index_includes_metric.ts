// Some sources (Strava, Withings, Lose It!) attach the SAME HKExternalUUID to multiple Records
// belonging to one activity / weigh-in / meal — across different metric types. The original
// dedup index (subject_id, source_id, external_id, start_time) treated those as the same row
// and ON CONFLICT silently overwrote earlier rows of one metric with later rows of another.
// Adding `metric` to the dedup tuple gives each metric its own row identity.
import type { Knex } from 'knex';

export const up = async (knex: Knex): Promise<void> => {
  await knex.raw('DROP INDEX IF EXISTS samples_dedup_idx');
  await knex.raw(
    'CREATE UNIQUE INDEX samples_dedup_idx ON samples (subject_id, source_id, metric, external_id, start_time)'
  );
};

export const down = async (knex: Knex): Promise<void> => {
  await knex.raw('DROP INDEX IF EXISTS samples_dedup_idx');
  await knex.raw(
    'CREATE UNIQUE INDEX samples_dedup_idx ON samples (subject_id, source_id, external_id, start_time)'
  );
};

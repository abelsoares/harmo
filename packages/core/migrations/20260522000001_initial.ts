import type { Knex } from 'knex';

const PARTITION_START_YEAR = 2018;
const PARTITION_END_YEAR_OFFSET = 1;

function monthlyPartitions(): Array<{ name: string; from: string; to: string }> {
  const now = new Date();
  const endYear = now.getUTCFullYear() + PARTITION_END_YEAR_OFFSET;
  const out: Array<{ name: string; from: string; to: string }> = [];

  for (let y = PARTITION_START_YEAR; y <= endYear; y++) {
    for (let m = 0; m < 12; m++) {
      const from = new Date(Date.UTC(y, m, 1));
      const to = new Date(Date.UTC(y, m + 1, 1));
      const yyyymm = `${from.getUTCFullYear()}_${String(from.getUTCMonth() + 1).padStart(2, '0')}`;

      out.push({
        name: `samples_${yyyymm}`,
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10)
      });
    }
  }

  return out;
}

export const up = async (knex: Knex): Promise<void> => {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgmq CASCADE');

  await knex.raw(`
    CREATE OR REPLACE FUNCTION harmo_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      NEW.updated_at := now();
      RETURN NEW;
    END;
    $$;
  `);

  await knex.schema.createTable('subjects', t => {
    t.text('id').primary();
    t.text('timezone').notNullable().defaultTo('UTC');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE TRIGGER subjects_updated_at BEFORE UPDATE ON subjects
    FOR EACH ROW EXECUTE FUNCTION harmo_set_updated_at();
  `);

  await knex('subjects').insert({ id: 'default', timezone: 'Europe/Lisbon' });

  await knex.schema.createTable('sources', t => {
    t.bigIncrements('id').primary();
    t.text('subject_id').notNullable();
    t.text('vendor').notNullable();
    t.text('source_name').notNullable();
    t.text('manufacturer').nullable();
    t.text('hardware_version').nullable();
    t.text('software_version').nullable();
    t.text('product_type').nullable();
    t.text('identity_hash').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['subject_id', 'identity_hash']);
    t.index(['subject_id'], 'sources_subject_idx');
  });

  await knex.raw(`
    CREATE TRIGGER sources_updated_at BEFORE UPDATE ON sources
    FOR EACH ROW EXECUTE FUNCTION harmo_set_updated_at();
  `);

  await knex.schema.createTable('metrics_registry', t => {
    t.text('metric').primary();
    t.text('value_kind').notNullable();
    t.text('temporal_kind').notNullable();
    t.text('canonical_unit').nullable();
    t.text('default_agg').notNullable();
    t.specificType('allowed_aggs', 'text[]').notNullable();
    t.boolean('resolve_overlap').notNullable().defaultTo(false);
    t.integer('registry_version').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('metric_aliases', t => {
    t.text('alias').notNullable();
    t.text('vendor').notNullable();
    t.text('metric').notNullable().references('metric').inTable('metrics_registry');
    t.primary(['vendor', 'alias']);
  });

  await knex.schema.createTable('unit_conversions', t => {
    t.text('from_unit').notNullable();
    t.text('to_unit').notNullable();
    t.specificType('factor', 'numeric').notNullable();
    t.specificType('offset', 'numeric').notNullable().defaultTo(0);
    t.primary(['from_unit', 'to_unit']);
  });

  await knex.schema.createTable('source_priority', t => {
    t.text('subject_id').notNullable();
    t.text('metric').notNullable();
    t.bigInteger('source_id').notNullable().references('id').inTable('sources').onDelete('CASCADE');
    t.integer('rank').notNullable();
    t.primary(['subject_id', 'metric', 'source_id']);
    t.index(['subject_id', 'metric', 'rank'], 'source_priority_lookup');
  });

  await knex.schema.createTable('workouts', t => {
    t.bigIncrements('id').primary();
    t.text('subject_id').notNullable();
    t.bigInteger('source_id').notNullable().references('id').inTable('sources');
    t.text('activity_type').notNullable();
    t.timestamp('start_time', { useTz: true }).notNullable();
    t.timestamp('end_time', { useTz: true }).notNullable();
    t.integer('duration_s').notNullable();
    t.text('external_id').notNullable();
    t.jsonb('metadata').notNullable().defaultTo('{}');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['subject_id', 'source_id', 'external_id']);
    t.index(['subject_id', 'start_time'], 'workouts_subject_time_idx');
  });

  await knex.schema.createTable('correlations', t => {
    t.bigIncrements('id').primary();
    t.text('subject_id').notNullable();
    t.bigInteger('source_id').notNullable().references('id').inTable('sources');
    t.text('metric').notNullable();
    t.timestamp('start_time', { useTz: true }).notNullable();
    t.timestamp('end_time', { useTz: true }).notNullable();
    t.text('external_id').notNullable();
    t.jsonb('metadata').notNullable().defaultTo('{}');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['subject_id', 'source_id', 'external_id']);
  });

  await knex.raw(`
    CREATE TABLE samples (
      id                    bigint GENERATED ALWAYS AS IDENTITY,
      subject_id            text NOT NULL,
      metric                text NOT NULL,
      value_num             double precision,
      value_text            text,
      unit                  text,
      start_time            timestamptz NOT NULL,
      end_time              timestamptz NOT NULL,
      start_offset_minutes  smallint,
      source_id             bigint NOT NULL,
      workout_id            bigint,
      correlation_id        bigint,
      external_id           text NOT NULL,
      registry_version      integer NOT NULL,
      metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
      ingested_at           timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (start_time, id)
    ) PARTITION BY RANGE (start_time);
  `);

  for (const p of monthlyPartitions()) {
    await knex.raw(`CREATE TABLE ?? PARTITION OF samples FOR VALUES FROM ('${p.from}') TO ('${p.to}');`, [p.name]);
  }

  await knex.raw(`CREATE UNIQUE INDEX samples_dedup_idx ON samples (subject_id, source_id, external_id, start_time);`);
  await knex.raw(`CREATE INDEX samples_query_idx ON samples (subject_id, metric, start_time DESC);`);
  await knex.raw(`CREATE INDEX samples_workout_idx ON samples (workout_id) WHERE workout_id IS NOT NULL;`);
  await knex.raw(`CREATE INDEX samples_correlation_idx ON samples (correlation_id) WHERE correlation_id IS NOT NULL;`);

  await knex.schema.createTable('quarantine', t => {
    t.bigIncrements('id').primary();
    t.text('subject_id').notNullable();
    t.text('vendor').notNullable();
    t.text('reason').notNullable();
    t.jsonb('raw').notNullable();
    t.jsonb('context').notNullable().defaultTo('{}');
    t.integer('registry_version').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['subject_id', 'reason', 'created_at'], 'quarantine_reason_idx');
  });

  await knex.schema.createTable('import_runs', t => {
    t.bigIncrements('id').primary();
    t.text('subject_id').notNullable();
    t.text('source_file').notNullable();
    t.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('finished_at', { useTz: true }).nullable();
    t.integer('parsed_count').notNullable().defaultTo(0);
    t.integer('queued_count').notNullable().defaultTo(0);
    t.text('status').notNullable().defaultTo('running');
    t.text('error').nullable();
  });

  await knex.raw(`SELECT pgmq.create('ingest_q')`);
};

export const down = async (knex: Knex): Promise<void> => {
  await knex.raw(`SELECT pgmq.drop_queue('ingest_q')`).catch(() => undefined);
  await knex.schema.dropTableIfExists('import_runs');
  await knex.schema.dropTableIfExists('quarantine');
  await knex.raw('DROP TABLE IF EXISTS samples CASCADE');
  await knex.schema.dropTableIfExists('correlations');
  await knex.schema.dropTableIfExists('workouts');
  await knex.schema.dropTableIfExists('source_priority');
  await knex.schema.dropTableIfExists('unit_conversions');
  await knex.schema.dropTableIfExists('metric_aliases');
  await knex.schema.dropTableIfExists('metrics_registry');
  await knex.schema.dropTableIfExists('sources');
  await knex.schema.dropTableIfExists('subjects');
  await knex.raw('DROP FUNCTION IF EXISTS harmo_set_updated_at()');
};

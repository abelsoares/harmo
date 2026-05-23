import { closeKnex, env, getKnex, logger } from '@src/clients';

async function main() {
  if (env.NODE_ENV === 'production') {
    throw new Error('db:reset is not allowed in production');
  }

  const knex = getKnex();

  logger.warn({ db: env.DB_NAME }, 'dropping all harmo objects');

  await knex.raw(`
    DROP TABLE IF EXISTS samples CASCADE;
    DROP TABLE IF EXISTS import_runs CASCADE;
    DROP TABLE IF EXISTS quarantine CASCADE;
    DROP TABLE IF EXISTS correlations CASCADE;
    DROP TABLE IF EXISTS workouts CASCADE;
    DROP TABLE IF EXISTS source_priority CASCADE;
    DROP TABLE IF EXISTS unit_conversions CASCADE;
    DROP TABLE IF EXISTS metric_aliases CASCADE;
    DROP TABLE IF EXISTS metrics_registry CASCADE;
    DROP TABLE IF EXISTS sources CASCADE;
    DROP TABLE IF EXISTS subjects CASCADE;
    DROP TABLE IF EXISTS knex_migrations CASCADE;
    DROP TABLE IF EXISTS knex_migrations_lock CASCADE;
    DROP FUNCTION IF EXISTS harmo_set_updated_at();
  `);

  await knex.raw(`SELECT pgmq.drop_queue('ingest_q')`).catch(() => undefined);

  logger.info('database wiped — run npm run db:migrate to recreate');
}

main()
  .catch(err => {
    logger.error({ err }, 'db:reset failed');
    process.exitCode = 1;
  })
  .finally(() => closeKnex());

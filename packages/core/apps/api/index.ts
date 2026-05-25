import { closeKnex, env, getKnex, initSentry, logger } from '@src/clients';
import { mapError } from '@src/errors';
import { buildApp } from './app';

async function main() {
  initSentry();

  // Warm the DB pool early so /v1/health is honest from the first request.
  await getKnex().raw('SELECT 1');

  const app = buildApp();

  app.on('error', err => {
    logger.error({ err }, 'koa app error');
  });

  const server = app.listen(env.API_PORT, env.API_HOSTNAME, () => {
    logger.info({ hostname: env.API_HOSTNAME, port: env.API_PORT, env: env.NODE_ENV }, 'harmo api listening');
  });

  let stopping = false;

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      if (stopping) {
        return;
      }

      stopping = true;
      logger.info({ sig }, 'api shutting down');
      server.close(() => {
        closeKnex()
          .catch(err => logger.error({ err }, 'knex close failed'))
          .finally(() => process.exit(0));
      });
    });
  }
}

if (require.main === module) {
  main().catch(err => {
    mapError(err);
    process.exitCode = 1;
  });
}

export { buildApp };

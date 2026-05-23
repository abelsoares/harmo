import { INGEST_QUEUE } from '@harmo/common';
import { closeKnex, env, getKnex, initSentry, logger, read as pgmqRead, runWithContext } from '@src/clients';
import { mapError } from '@src/errors';

let stopping = false;

function installSignalHandlers() {
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      logger.info({ sig }, 'worker received signal, draining');
      stopping = true;
    });
  }
}

async function pollOnce() {
  const knex = getKnex();
  const messages = await pgmqRead(knex, INGEST_QUEUE, env.WORKER_VT_SECONDS, env.WORKER_POLL_BATCH);

  if (messages.length === 0) {
    await new Promise(resolve => setTimeout(resolve, 1000));

    return 0;
  }

  for (const msg of messages) {
    await runWithContext({ messageId: msg.msg_id }, async () => {
      logger.debug({ readCt: msg.read_ct }, 'received message (stub) — would normalize + ingest');
      // TODO: dispatchNormalize → ingestCanonical → pgmq.archive (US-3..US-6)
    });
  }

  return messages.length;
}

async function main() {
  initSentry();
  installSignalHandlers();
  logger.info({ concurrency: env.WORKER_CONCURRENCY }, 'worker starting (stub)');

  while (!stopping) {
    try {
      await pollOnce();
    } catch (err) {
      mapError(err);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  logger.info('worker drained');
}

main()
  .catch(err => {
    mapError(err);
    process.exitCode = 1;
  })
  .finally(() => closeKnex());

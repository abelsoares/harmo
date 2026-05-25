import { INGEST_QUEUE } from '@harmo/common';
import {
  closeKnex,
  env,
  getKnex,
  initSentry,
  logger,
  archive as pgmqArchive,
  read as pgmqRead,
  runWithContext
} from '@src/clients';
import { mapError } from '@src/errors';
import { processPollResult } from '@src/worker/process-message';

let stopping = false;

function installSignalHandlers() {
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      logger.info({ sig }, 'worker received signal, draining');
      stopping = true;
    });
  }
}

async function pollOnce(): Promise<number> {
  const knex = getKnex();
  const messages = await pgmqRead(knex, INGEST_QUEUE, env.WORKER_VT_SECONDS, env.WORKER_POLL_BATCH);

  if (messages.length === 0) {
    await new Promise(resolve => setTimeout(resolve, 1000));

    return 0;
  }

  let processed = 0;

  for (const msg of messages) {
    await runWithContext({ messageId: msg.msg_id }, async () => {
      const outcome = await processPollResult(knex, msg);

      if (outcome.archive) {
        await pgmqArchive(knex, INGEST_QUEUE, msg.msg_id);
      }

      logger.debug({ kind: outcome.kind, reason: outcome.reason }, 'processed message');
      processed += 1;
    });
  }

  return processed;
}

async function main() {
  initSentry();
  installSignalHandlers();
  logger.info({ concurrency: env.WORKER_CONCURRENCY }, 'worker starting');

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

if (require.main === module) {
  main()
    .catch(err => {
      mapError(err);
      process.exitCode = 1;
    })
    .finally(() => closeKnex());
}

export { pollOnce };

import { DEFAULT_SUBJECT_ID, RawEnvelopeSchema } from '@harmo/common';
import { logger } from '@src/clients/logger';
import type { PgmqMessage } from '@src/clients/pgmq';
import { ingestCanonical } from '@src/ingest/canonical';
import { upsertCorrelation } from '@src/ingest/correlation';
import { upsertSource } from '@src/ingest/source-cache';
import { upsertWorkout } from '@src/ingest/workout';
import { dispatchNormalize } from '@src/normalize/dispatch';
import { storeQuarantine } from '@src/quarantine';
import type { Knex } from 'knex';

export const MAX_RETRIES = 5;

export type ProcessOutcome = {
  archive: boolean;
  kind: 'sample' | 'workout' | 'correlation' | 'quarantine' | 'dlq' | 'retry';
  reason?: string;
};

export async function processMessage(knex: Knex, raw: unknown): Promise<ProcessOutcome> {
  const envelope = RawEnvelopeSchema.parse(raw);
  const result = await dispatchNormalize(knex, envelope);

  if (result.kind === 'sample') {
    const sourceId = await upsertSource(knex, result.source);

    await ingestCanonical(knex, [{ ...result.sample, sourceId }]);

    return { archive: true, kind: 'sample' };
  }

  if (result.kind === 'workout') {
    const sourceId = await upsertSource(knex, result.source);

    await upsertWorkout(knex, sourceId, result.workout);

    return { archive: true, kind: 'workout' };
  }

  if (result.kind === 'correlation') {
    const sourceId = await upsertSource(knex, result.source);

    await upsertCorrelation(knex, sourceId, result.correlation);

    return { archive: true, kind: 'correlation' };
  }

  // quarantine
  await storeQuarantine(knex, {
    subjectId: DEFAULT_SUBJECT_ID,
    vendor: envelope.vendor,
    reason: result.reason,
    raw: envelope,
    context: result.context
  });

  return { archive: true, kind: 'quarantine', reason: result.reason };
}

export async function processPollResult(knex: Knex, msg: PgmqMessage<unknown>): Promise<ProcessOutcome> {
  try {
    return await processMessage(knex, msg.message);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    logger.error({ err, msgId: msg.msg_id, readCt: msg.read_ct }, 'message processing failed');

    if (msg.read_ct >= MAX_RETRIES) {
      try {
        await storeQuarantine(knex, {
          subjectId: DEFAULT_SUBJECT_ID,
          vendor: 'unknown',
          reason: 'dlq',
          raw: msg.message,
          context: { msgId: msg.msg_id, readCt: msg.read_ct, error: errorMessage }
        });

        return { archive: true, kind: 'dlq', reason: errorMessage };
      } catch (dlqErr) {
        logger.error({ err: dlqErr }, 'failed to write to quarantine; leaving message');

        return { archive: false, kind: 'retry', reason: errorMessage };
      }
    }

    return { archive: false, kind: 'retry', reason: errorMessage };
  }
}

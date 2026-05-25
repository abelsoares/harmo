import { DEFAULT_SUBJECT_ID, INGEST_QUEUE, type RawEnvelope, RawEnvelopeSchema } from '@harmo/common';
import { logger } from '@src/clients/logger';
import { sendBatch } from '@src/clients/pgmq';
import { BulkProcessor } from '@src/ingest/bulk-processor';
import { warmRegistry } from '@src/registry/lookup';
import type { Knex } from 'knex';

const DEFAULT_BATCH_SIZE = 500;

export type ReplayOptions = {
  subjectId?: string;
  reason?: string;
  vendor?: string;
  since?: Date;
  limit?: number;
  inline?: boolean;
  dryRun?: boolean;
  batchSize?: number;
};

export type ReplayResult = {
  scanned: number;
  replayed: number;
  skipped: number;
  remainingByReason: Record<string, number>;
};

function applyFilters(query: Knex.QueryBuilder, options: ReplayOptions): Knex.QueryBuilder {
  let q = query.where('subject_id', options.subjectId ?? DEFAULT_SUBJECT_ID);

  if (options.reason) {
    q = q.andWhere('reason', options.reason);
  }

  if (options.vendor) {
    q = q.andWhere('vendor', options.vendor);
  }

  if (options.since) {
    q = q.andWhere('created_at', '>=', options.since);
  }

  return q;
}

async function countByReason(knex: Knex, options: ReplayOptions): Promise<Record<string, number>> {
  const rows = await applyFilters(knex('quarantine'), options)
    .groupBy('reason')
    .select<Array<{ reason: string; n: string }>>('reason')
    .count('* as n');

  const breakdown: Record<string, number> = {};

  for (const row of rows) {
    breakdown[row.reason] = Number(row.n);
  }

  return breakdown;
}

export async function runReplayQuarantine(knex: Knex, options: ReplayOptions = {}): Promise<ReplayResult> {
  if (options.dryRun) {
    const remaining = await countByReason(knex, options);

    return { scanned: 0, replayed: 0, skipped: 0, remainingByReason: remaining };
  }

  // Capture the max id at the start so re-quarantined rows (which get NEW ids during processing)
  // do NOT cause this call to loop forever. They'll be picked up by the next invocation.
  const maxRow = await applyFilters(knex('quarantine'), options).max('id as max').first<{ max: string | null }>();
  const maxId = maxRow?.max ?? null;

  if (!maxId) {
    return { scanned: 0, replayed: 0, skipped: 0, remainingByReason: {} };
  }

  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const limit = options.limit ?? Number.MAX_SAFE_INTEGER;
  const inline = options.inline ?? true;
  const runId = `replay-${Date.now()}`;
  const subjectId = options.subjectId ?? DEFAULT_SUBJECT_ID;

  let scanned = 0;
  let replayed = 0;
  let skipped = 0;
  let processor: BulkProcessor | null = null;
  // Keyset cursor — advances past rows we leave in place (e.g. malformed raw payload).
  let cursor = '0';

  if (inline) {
    await warmRegistry(knex);
    processor = new BulkProcessor(knex, runId, batchSize, subjectId);
  }

  while (scanned < limit) {
    const remaining = limit - scanned;
    const take = Math.min(batchSize, remaining);
    const batch = await applyFilters(knex('quarantine'), options)
      .andWhere('id', '>', cursor)
      .andWhere('id', '<=', maxId)
      .orderBy('id')
      .limit(take)
      .select<Array<{ id: string; raw: unknown }>>('id', 'raw');

    if (batch.length === 0) {
      break;
    }

    const idsToDelete: string[] = [];
    const envelopesForQueue: RawEnvelope[] = [];

    for (const row of batch) {
      scanned += 1;

      try {
        // pgmq jsonb columns come back as JS objects via the pg driver; defensive parse for tests
        // that might insert raw text.
        const rawValue = typeof row.raw === 'string' ? JSON.parse(row.raw) : row.raw;
        const envelope = RawEnvelopeSchema.parse(rawValue);

        if (processor) {
          await processor.process(envelope.payload);
        } else {
          envelopesForQueue.push({ ...envelope, batchId: runId });
        }

        idsToDelete.push(row.id);
        replayed += 1;
      } catch (err) {
        skipped += 1;
        logger.warn({ err, id: row.id }, 'replay-quarantine: failed to process row; leaving in place');
      }
    }

    if (processor) {
      await processor.flush();
    } else if (envelopesForQueue.length > 0) {
      await sendBatch(knex, INGEST_QUEUE, envelopesForQueue);
    }

    if (idsToDelete.length > 0) {
      await knex('quarantine').whereIn('id', idsToDelete).delete();
    }

    // Advance past the highest id we saw (whether processed or skipped) so the next
    // iteration doesn't re-pull rows we left in place.
    cursor = batch[batch.length - 1].id;
  }

  const remainingByReason = await countByReason(knex, options);

  logger.info(
    {
      scanned,
      replayed,
      skipped,
      remainingByReason,
      stats: processor?.getStats()
    },
    'replay-quarantine finished'
  );

  return { scanned, replayed, skipped, remainingByReason };
}

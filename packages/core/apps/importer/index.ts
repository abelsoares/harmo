import { createReadStream } from 'node:fs';
import { DEFAULT_SUBJECT_ID, INGEST_QUEUE, type RawApplePayload } from '@harmo/common';
import { closeKnex, env, getKnex, initSentry, logger, runWithContext, sendBatch } from '@src/clients';
import { mapError } from '@src/errors';
import { BulkProcessor } from '@src/ingest/bulk-processor';
import { parseAppleExport } from '@src/normalize/apple';
import { warmRegistry } from '@src/registry/lookup';
import { Command } from 'commander';

const PROGRESS_EVERY = 50_000;

export type ImportOptions = {
  filePath: string;
  subjectId?: string;
  batchSize?: number;
  inline?: boolean;
  limit?: number;
};

export type ImportResult = {
  runId: string;
  parsedCount: number;
  queuedCount: number;
  status: 'finished' | 'failed';
  error?: string;
  stats?: { samples: number; workouts: number; correlations: number; quarantined: number };
};

type Envelope = { vendor: 'apple'; batchId: string; payload: RawApplePayload };

export async function runImport(options: ImportOptions): Promise<ImportResult> {
  const knex = getKnex();
  const subjectId = options.subjectId ?? DEFAULT_SUBJECT_ID;
  const batchSize = options.batchSize ?? env.INGEST_BATCH_SIZE;

  const [run] = await knex('import_runs')
    .insert({
      subject_id: subjectId,
      source_file: options.filePath,
      status: 'running'
    })
    .returning(['id']);

  const runId = String(run.id);

  return runWithContext({ runId }, async () => {
    logger.info(
      { filePath: options.filePath, subjectId, batchSize, inline: !!options.inline },
      'importer starting'
    );

    let parsed = 0;
    let queued = 0;
    let batch: Envelope[] = [];
    const processor = options.inline ? new BulkProcessor(knex, runId, batchSize, subjectId) : null;

    const flushQueue = async () => {
      if (batch.length === 0) {
        return;
      }

      await sendBatch(knex, INGEST_QUEUE, batch);
      queued += batch.length;
      batch = [];
    };

    try {
      if (processor) {
        await warmRegistry(knex);
      }

      const stream = createReadStream(options.filePath);

      const startTime = Date.now();

      for await (const payload of parseAppleExport(stream)) {
        if (options.limit !== undefined && parsed >= options.limit) {
          break;
        }

        parsed += 1;

        if (processor) {
          await processor.process(payload);
        } else {
          batch.push({ vendor: 'apple', batchId: runId, payload });

          if (batch.length >= batchSize) {
            await flushQueue();
          }
        }

        if (parsed % PROGRESS_EVERY === 0) {
          const progressStats = processor ? processor.getStats() : { samples: 0, workouts: 0, correlations: 0, quarantined: 0 };
          const elapsedSec = Math.round((Date.now() - startTime) / 1000);
          const ratePerSec = parsed / Math.max(elapsedSec, 1);

          logger.info(
            { parsed, queued, elapsedSec, ratePerSec: Math.round(ratePerSec), ...progressStats },
            'importer progress'
          );
        }
      }

      if (processor) {
        await processor.flush();
      } else {
        await flushQueue();
      }

      const stats = processor?.getStats();

      await knex('import_runs').where({ id: run.id }).update({
        finished_at: knex.fn.now(),
        parsed_count: parsed,
        queued_count: processor ? (stats?.samples ?? 0) + (stats?.workouts ?? 0) + (stats?.correlations ?? 0) + (stats?.quarantined ?? 0) : queued,
        status: 'finished'
      });

      logger.info({ parsed, queued, stats }, 'importer finished');

      return {
        runId,
        parsedCount: parsed,
        queuedCount: queued,
        status: 'finished',
        stats: stats
          ? {
              samples: stats.samples,
              workouts: stats.workouts,
              correlations: stats.correlations,
              quarantined: stats.quarantined
            }
          : undefined
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      await knex('import_runs')
        .where({ id: run.id })
        .update({
          finished_at: knex.fn.now(),
          parsed_count: parsed,
          queued_count: queued,
          status: 'failed',
          error: message.slice(0, 4000)
        });

      logger.error({ err, parsed, queued }, 'importer failed');

      return { runId, parsedCount: parsed, queuedCount: queued, status: 'failed', error: message };
    }
  });
}

const program = new Command()
  .name('harmo-importer')
  .description('Stream an Apple Health export.xml into the ingest queue')
  .requiredOption('-f, --file <path>', 'path to export.xml')
  .option('-s, --subject <id>', 'subject id', DEFAULT_SUBJECT_ID)
  .option('-b, --batch-size <n>', 'envelopes per batch (pgmq batch or bulk-insert chunk)', String(env.INGEST_BATCH_SIZE))
  .option('--inline', 'process envelopes directly into samples (skip pgmq) — best for one-shot bulk imports', false)
  .option('--limit <n>', 'stop after N envelopes (for testing)');

async function main() {
  initSentry();

  const opts = program
    .parse(process.argv)
    .opts<{ file: string; subject: string; batchSize: string; inline: boolean; limit?: string }>();
  const result = await runImport({
    filePath: opts.file,
    subjectId: opts.subject,
    batchSize: Number(opts.batchSize),
    inline: opts.inline,
    limit: opts.limit ? Number(opts.limit) : undefined
  });

  if (result.status === 'failed') {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main()
    .catch(err => {
      mapError(err);
      process.exitCode = 1;
    })
    .finally(() => closeKnex());
}

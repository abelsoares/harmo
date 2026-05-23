import { createReadStream } from 'node:fs';
import { DEFAULT_SUBJECT_ID, INGEST_QUEUE, type RawApplePayload } from '@harmo/common';
import { closeKnex, env, getKnex, initSentry, logger, runWithContext, sendBatch } from '@src/clients';
import { mapError } from '@src/errors';
import { parseAppleExport } from '@src/normalize/apple';
import { Command } from 'commander';

const PROGRESS_EVERY = 50_000;

export type ImportOptions = {
  filePath: string;
  subjectId?: string;
  batchSize?: number;
};

export type ImportResult = {
  runId: string;
  parsedCount: number;
  queuedCount: number;
  status: 'finished' | 'failed';
  error?: string;
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
    logger.info({ filePath: options.filePath, subjectId, batchSize }, 'importer starting');

    let parsed = 0;
    let queued = 0;
    let batch: Envelope[] = [];

    const flush = async () => {
      if (batch.length === 0) {
        return;
      }

      await sendBatch(knex, INGEST_QUEUE, batch);
      queued += batch.length;
      batch = [];
    };

    try {
      const stream = createReadStream(options.filePath);

      for await (const payload of parseAppleExport(stream)) {
        parsed += 1;
        batch.push({ vendor: 'apple', batchId: runId, payload });

        if (batch.length >= batchSize) {
          await flush();
        }

        if (parsed % PROGRESS_EVERY === 0) {
          logger.info({ parsed, queued }, 'importer progress');
        }
      }

      await flush();

      await knex('import_runs').where({ id: run.id }).update({
        finished_at: knex.fn.now(),
        parsed_count: parsed,
        queued_count: queued,
        status: 'finished'
      });

      logger.info({ parsed, queued }, 'importer finished');

      return { runId, parsedCount: parsed, queuedCount: queued, status: 'finished' };
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
  .option('-b, --batch-size <n>', 'envelopes per pgmq batch', String(env.INGEST_BATCH_SIZE));

async function main() {
  initSentry();

  const opts = program.parse(process.argv).opts<{ file: string; subject: string; batchSize: string }>();
  const result = await runImport({
    filePath: opts.file,
    subjectId: opts.subject,
    batchSize: Number(opts.batchSize)
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

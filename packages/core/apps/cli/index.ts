import { spawn } from 'node:child_process';
import { createReadStream, writeFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { type AggregateBucket, type AggregateFn, aggregate } from '@src/aggregate';
import { closeKnex, getKnex, initSentry, logger } from '@src/clients';
import { mapError } from '@src/errors';
import { skimAppleExport } from '@src/normalize/apple';
import { runReplayQuarantine } from '@src/quarantine/replay';
import { generateReport } from '@src/report';
import { Command } from 'commander';

const program = new Command().name('harmo').description('Harmo admin CLI');

program
  .command('samples:count')
  .description('Count canonical samples')
  .option('-s, --subject <id>', 'subject id', 'default')
  .action(async opts => {
    const knex = getKnex();
    const row = await knex('samples')
      .where('subject_id', opts.subject)
      .count<{ count: string }>({ count: '*' })
      .first();

    logger.info({ count: Number(row?.count ?? 0), subject: opts.subject }, 'samples count');
  });

program
  .command('registry:show')
  .description('List registered metrics')
  .action(async () => {
    const knex = getKnex();
    const rows = await knex('metrics_registry').select('*').orderBy('metric');

    logger.info({ count: rows.length, metrics: rows.map(r => r.metric) }, 'metrics registry');
  });

program
  .command('samples:peek')
  .description('Show the most recent canonical samples for a metric')
  .requiredOption('-m, --metric <name>', 'canonical metric name')
  .option('--since <iso>', 'inclusive lower bound on start_time', '1970-01-01T00:00:00Z')
  .option('-n, --limit <n>', 'max rows', '20')
  .option('-s, --subject <id>', 'subject id', 'default')
  .action(async opts => {
    const knex = getKnex();
    const rows = await knex('samples')
      .join('sources', 'sources.id', 'samples.source_id')
      .where('samples.subject_id', opts.subject)
      .andWhere('samples.metric', opts.metric)
      .andWhere('samples.start_time', '>=', new Date(opts.since))
      .orderBy('samples.start_time', 'desc')
      .limit(Number(opts.limit))
      .select(
        'samples.start_time as start_time',
        'samples.value_num as value_num',
        'samples.value_text as value_text',
        'samples.unit as unit',
        'sources.source_name as source_name'
      );

    logger.info({ count: rows.length, metric: opts.metric }, 'samples peek');

    for (const row of rows) {
      const value = row.value_num ?? row.value_text;

      logger.info(
        {
          startTime: row.start_time,
          value,
          unit: row.unit,
          source: row.source_name
        },
        'sample'
      );
    }
  });

program
  .command('aggregate')
  .description('Run a registry-aware aggregate query (US-10/11/12)')
  .requiredOption('-m, --metric <name>', 'canonical metric name')
  .requiredOption('--from <iso>', 'inclusive lower bound on start_time')
  .requiredOption('--to <iso>', 'exclusive upper bound on start_time')
  .option('-b, --bucket <unit>', 'hour|day|week|month', 'day')
  .option('-a, --agg <fn>', 'sum|avg|min|max|latest (default from registry)')
  .option('-t, --timezone <iana>', 'override subject timezone')
  .option('-s, --subject <id>', 'subject id', 'default')
  .action(async opts => {
    const knex = getKnex();
    const rows = await aggregate(knex, {
      subjectId: opts.subject,
      metric: opts.metric,
      bucket: opts.bucket as AggregateBucket,
      agg: opts.agg as AggregateFn | undefined,
      from: new Date(opts.from),
      to: new Date(opts.to),
      timezone: opts.timezone
    });

    logger.info({ count: rows.length, metric: opts.metric, bucket: opts.bucket }, 'aggregate');

    for (const row of rows) {
      logger.info(
        {
          bucketStart: row.bucketStart,
          value: row.value,
          sampleCount: row.sampleCount
        },
        'bucket'
      );
    }
  });

program
  .command('apple:skim')
  .description('Stream-count top-level Apple Health XML elements (US-1a)')
  .requiredOption('-f, --file <path>', 'path to export.xml')
  .option('--quiet', 'suppress progress logs', false)
  .action(async opts => {
    const path = resolvePath(opts.file);
    const start = Date.now();
    const counts = new Map<string, number>();
    let total = 0;
    const progressEvery = 100_000;

    const stream = createReadStream(path);

    for await (const event of skimAppleExport(stream)) {
      counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
      total += 1;

      if (!opts.quiet && total % progressEvery === 0) {
        const mem = process.memoryUsage();

        logger.info(
          { total, rssMb: Math.round(mem.rss / 1024 / 1024), elapsedMs: Date.now() - start },
          'skim progress'
        );
      }
    }

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const peakMb = Math.round(process.memoryUsage().rss / 1024 / 1024);

    logger.info(
      { total, elapsedMs: Date.now() - start, peakRssMb: peakMb, counts: Object.fromEntries(sorted) },
      'skim complete'
    );
  });

program
  .command('report')
  .description('Render a self-contained HTML report of the ingested data')
  .requiredOption('-o, --out <path>', 'output HTML file path')
  .option('--from <iso>', 'inclusive lower bound (defaults to earliest sample)')
  .option('--to <iso>', 'exclusive upper bound (defaults to one ms past the latest sample)')
  .option('-t, --timezone <iana>', 'override subject timezone')
  .option('-s, --subject <id>', 'subject id', 'default')
  .option('--open', 'open the report in the default browser after writing', false)
  .action(async opts => {
    const knex = getKnex();
    const start = Date.now();
    const html = await generateReport(knex, {
      subjectId: opts.subject,
      from: opts.from ? new Date(opts.from) : undefined,
      to: opts.to ? new Date(opts.to) : undefined,
      timezone: opts.timezone
    });
    const outPath = resolvePath(opts.out);

    writeFileSync(outPath, html, 'utf-8');
    logger.info({ outPath, bytes: html.length, elapsedMs: Date.now() - start }, 'report written');

    if (opts.open) {
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';

      spawn(opener, [outPath], { detached: true, stdio: 'ignore' }).unref();
    }
  });

program
  .command('imports:list')
  .description('List recent import runs (US-16)')
  .option('-n, --limit <n>', 'max rows', '20')
  .option('-s, --subject <id>', 'subject id', 'default')
  .action(async opts => {
    const knex = getKnex();
    const rows = await knex('import_runs')
      .where('subject_id', opts.subject)
      .orderBy('id', 'desc')
      .limit(Number(opts.limit))
      .select<
        Array<{
          id: string;
          status: string;
          source_file: string;
          started_at: Date;
          finished_at: Date | null;
          parsed_count: number;
          queued_count: number;
          error: string | null;
        }>
      >('*');

    logger.info({ count: rows.length, subject: opts.subject }, 'import_runs');

    for (const row of rows) {
      const ms = row.finished_at ? row.finished_at.getTime() - row.started_at.getTime() : null;

      logger.info(
        {
          id: row.id,
          status: row.status,
          parsed: row.parsed_count,
          queued: row.queued_count,
          startedAt: row.started_at,
          durationMs: ms,
          file: row.source_file,
          error: row.error
        },
        'import_run'
      );
    }
  });

program
  .command('replay-quarantine')
  .description('Re-process quarantined rows through the normalize pipeline (US-15)')
  .option('-r, --reason <reason>', 'filter by reason (e.g. unknown_alias, unit_unknown, dlq)')
  .option('--vendor <name>', 'filter by vendor')
  .option('--since <iso>', 'quarantine.created_at lower bound')
  .option('--limit <n>', 'cap rows replayed in this call')
  .option('--inline', 'process directly via BulkProcessor (skip pgmq)', false)
  .option('--dry-run', 'count rows by reason; do not modify state', false)
  .option('-s, --subject <id>', 'subject id', 'default')
  .action(async opts => {
    const knex = getKnex();
    const result = await runReplayQuarantine(knex, {
      subjectId: opts.subject,
      reason: opts.reason,
      vendor: opts.vendor,
      since: opts.since ? new Date(opts.since) : undefined,
      limit: opts.limit ? Number(opts.limit) : undefined,
      inline: opts.inline,
      dryRun: opts.dryRun
    });

    logger.info(result, opts.dryRun ? 'replay-quarantine dry-run' : 'replay-quarantine complete');
  });

async function main() {
  initSentry();
  await program.parseAsync(process.argv);
}

if (require.main === module) {
  main()
    .catch(err => {
      mapError(err);
      process.exitCode = 1;
    })
    .finally(() => closeKnex());
}

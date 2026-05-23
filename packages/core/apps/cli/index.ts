import { createReadStream } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { closeKnex, getKnex, initSentry, logger } from '@src/clients';
import { mapError } from '@src/errors';
import { skimAppleExport } from '@src/normalize/apple';
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
  .command('aggregate')
  .description('Run an aggregate query (stub)')
  .requiredOption('-m, --metric <name>', 'canonical metric name')
  .requiredOption('--from <iso>', 'inclusive lower bound')
  .requiredOption('--to <iso>', 'exclusive upper bound')
  .option('-b, --bucket <unit>', 'hour|day|week|month', 'day')
  .option('-s, --subject <id>', 'subject id', 'default')
  .action(async opts => {
    logger.info({ opts }, 'aggregate (stub) — see US-7');
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
  .command('replay-quarantine')
  .description('Replay quarantined rows (stub)')
  .option('-r, --reason <reason>', 'filter by reason')
  .option('--dry-run', 'do not actually re-enqueue', false)
  .action(async opts => {
    logger.info({ opts }, 'replay-quarantine (stub) — see US-9');
  });

async function main() {
  initSentry();
  await program.parseAsync(process.argv);
}

main()
  .catch(err => {
    mapError(err);
    process.exitCode = 1;
  })
  .finally(() => closeKnex());

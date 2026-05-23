/* biome-ignore-all lint/suspicious/noConsole: build script */
const esbuild = require('esbuild');

const sharedConfig = {
  alias: {
    '@apps': './apps',
    '@harmo/common': '../common/src/index.ts',
    '@src': './src'
  },
  bundle: true,
  external: [
    'knex',
    'objection',
    'pg',
    'pino',
    'pino-pretty',
    'sax',
    'zod',
    '@sentry/node',
    'commander',
    // knex optional drivers
    'better-sqlite3',
    'sqlite3',
    'tedious',
    'oracledb',
    'mysql',
    'mysql2',
    'pg-query-stream'
  ],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  target: 'node24'
};

async function build() {
  await esbuild.build({
    ...sharedConfig,
    entryPoints: ['apps/importer/index.ts', 'apps/worker/index.ts', 'apps/cli/index.ts'],
    outbase: 'apps',
    outdir: 'dist/apps'
  });
  console.log('apps build complete');
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});

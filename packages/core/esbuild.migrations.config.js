/* biome-ignore-all lint/suspicious/noConsole: build script */
const esbuild = require('esbuild');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');

const sharedConfig = {
  alias: { '@harmo/common': '../common/src/index.ts', '@src': './src' },
  bundle: true,
  external: ['knex', 'pg', 'zod'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  target: 'node24'
};

async function build() {
  await esbuild.build({
    ...sharedConfig,
    entryPoints: ['knexfile.ts'],
    outdir: 'dist'
  });

  const migrationFiles = readdirSync('migrations')
    .filter(f => f.endsWith('.ts'))
    .map(f => join('migrations', f));

  await esbuild.build({
    ...sharedConfig,
    entryPoints: migrationFiles,
    outbase: 'migrations',
    outdir: 'dist/migrations'
  });

  console.log('migrations build complete');
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});

import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@apps': path.resolve(__dirname, './apps'),
      '@harmo/common': path.resolve(__dirname, '../common/src/index.ts'),
      '@src': path.resolve(__dirname, './src'),
      '@test': path.resolve(__dirname, './test')
    }
  },
  test: {
    coverage: {
      exclude: ['apps/**/index.ts', 'bin/**', 'dist/**', 'migrations/**', 'test/**', '*.config.*'],
      provider: 'v8',
      thresholds: { statements: 50 }
    },
    environment: 'node',
    fileParallelism: false,
    globals: false,
    include: ['test/**/*.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    restoreMocks: true,
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30000
  }
});

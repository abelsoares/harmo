import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@harmo/api-client': path.resolve(__dirname, '../api-client/src/index.ts')
    }
  },
  server: {
    // strictPort: true so vite errors out instead of silently using 5174/5175 — keeps you
    // from ever opening a stale dashboard tab whose HMR socket can't reconnect.
    port: 5173,
    strictPort: true,
    host: 'localhost'
  }
});

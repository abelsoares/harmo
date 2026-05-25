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
    port: 5173,
    strictPort: false
  }
});

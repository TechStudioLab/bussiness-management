import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Worker (wrangler dev, port 8787) serves /api and /auth during development
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared')
    }
  },
  server: {
    port: 5180,
    proxy: {
      '/api': 'http://localhost:8787',
      '/auth': 'http://localhost:8787'
    }
  },
  build: { outDir: 'dist', sourcemap: false }
});

import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: '127.0.0.1', port: 5320 },
  preview: { host: '127.0.0.1', port: 5321 },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});

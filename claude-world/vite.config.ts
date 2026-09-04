import { defineConfig } from 'vite';

const backendPort = process.env.AGENT_WORLD_PORT ?? '4173';

export default defineConfig({
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': `http://127.0.0.1:${backendPort}`,
    },
  },
});

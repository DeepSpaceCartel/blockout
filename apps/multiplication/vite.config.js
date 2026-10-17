// The multiplication game is served at / (the server serves the other games at /<name>/).
import { defineConfig } from 'vite';
import { blockoutPage } from '@blockout/ui/vite';

export default defineConfig({
  base: '/',
  plugins: [blockoutPage()],
  server: {
    port: 5173,
    // the API and live classroom updates come from apps/server (npm run dev starts it on 8080)
    proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: false } },
  },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});

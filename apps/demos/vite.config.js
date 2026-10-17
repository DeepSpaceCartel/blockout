// Served at /demos/ by apps/server. Each demo is its own module (src/games/*.js),
// loaded when it's opened.
import { defineConfig } from 'vite';
import { blockoutPage } from '@blockout/ui/vite';

export default defineConfig({
  base: '/demos/',
  plugins: [blockoutPage()],
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});

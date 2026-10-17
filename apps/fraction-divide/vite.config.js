// Served at /fraction-divide/ by apps/server.
import { defineConfig } from 'vite';
import { blockoutPage } from '@blockout/ui/vite';

export default defineConfig({
  base: '/fraction-divide/',
  plugins: [blockoutPage()],
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});

// Served at /fraction-add/ by apps/server.
import { defineConfig } from 'vite';
import { blockoutPage } from '@blockout/ui/vite';

export default defineConfig({
  base: '/fraction-add/',
  plugins: [blockoutPage()],
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});

import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath, URL } from 'node:url';
// @ts-expect-error -- plain JS build plugin, typed by its JSDoc rather than a .d.ts
import { serviceWorker } from './scripts/service-worker-plugin.mjs';

export default defineConfig({
  /*
   * Relative, not absolute.
   *
   * GitHub Pages serves a project site from `/<repo>/`, and absolute `/assets/`
   * URLs 404 there — the app would deploy green and load blank. Relative paths
   * work from a subdirectory, from a custom domain, and from a file:// copy
   * somebody unzipped, which is the same portability the file format promises.
   */
  base: './',
  plugins: [svelte(), serviceWorker()],
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
      $ui: fileURLToPath(new URL('./src/ui', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/index.ts'],
    },
  },
});

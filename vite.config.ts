import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any GitHub Pages sub-path.
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022' },
  server: {
    // Wait until a changed file has stopped growing before reloading it: scripted edits
    // otherwise get picked up half-written (an empty stylesheet, for example).
    watch: { awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 } },
  },
});

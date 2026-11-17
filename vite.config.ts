/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { localizePage } from './src/i18n/pages.ts';

/** The last commit (short hash, date), shown on the page as its version; "dev" outside git. */
function version(): { commit: string; date: string } {
  try {
    const [commit, date] = execSync('git log -1 --format=%h%n%cs', { encoding: 'utf8' }).trim().split('\n');
    return { commit, date };
  } catch {
    return { commit: 'dev', date: new Date().toISOString().slice(0, 10) };
  }
}

/** After the build, a translated copy of the page for each language but English: dist/de/index.html, ... */
function languagePages(): Plugin {
  return {
    name: 'language-pages',
    apply: 'build',
    closeBundle() {
      const html = readFileSync('dist/index.html', 'utf8');
      for (const file of readdirSync('src/i18n/locales')) {
        const lang = file.replace(/\.json$/, '');
        if (lang === 'en') continue;
        mkdirSync(`dist/${lang}`, { recursive: true });
        writeFileSync(`dist/${lang}/index.html`, localizePage(html, lang, JSON.parse(readFileSync(`src/i18n/locales/${file}`, 'utf8'))));
      }
    },
  };
}

export default defineConfig({
  plugins: [languagePages()],
  // Relative base so the build works from any GitHub Pages sub-path.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version()) },
  worker: { format: 'es' },
  build: { target: 'es2022' },
  server: {
    // Wait until a changed file has stopped growing before reloading it: scripted edits
    // otherwise get picked up half-written (an empty stylesheet, for example).
    watch: { awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 } },
  },
  test: {
    // the geometry tests build whole lamps: slow on shared CI runners
    testTimeout: 60000,
  },
});

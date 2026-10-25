import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dir = 'src/i18n/locales';
const load = (f: string) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as Record<string, string>;
const en = load('en.json');
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe('translations', () => {
  for (const file of readdirSync(dir).filter((f) => f !== 'en.json')) {
    it(`${file} matches en.json`, () => {
      const loc = load(file);
      expect(Object.keys(loc).filter((k) => !(k in en)), 'extra keys').toEqual([]);
      expect(Object.keys(en).filter((k) => !(k in loc)), 'missing keys').toEqual([]);
      for (const k of Object.keys(en)) expect(placeholders(loc[k]), k).toEqual(placeholders(en[k]));
      // house style: no em or en dashes in any text
      expect(Object.entries(loc).filter(([, v]) => /[–—]/.test(v)).map(([k]) => k)).toEqual([]);
    });
  }
});

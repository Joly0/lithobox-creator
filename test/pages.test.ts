import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { languageFromPath, languages } from '../src/i18n';
import { localizePage } from '../src/i18n/pages';

const html = readFileSync('index.html', 'utf8');
const dict = (lang: string) => JSON.parse(readFileSync(`src/i18n/locales/${lang}.json`, 'utf8'));

describe('language pages', () => {
  it('translates the head and intro of the German page', () => {
    const de = localizePage(html, 'de', dict('de'));
    expect(de).toContain('<html lang="de">');
    expect(de).toContain('<link rel="canonical" href="https://lithobox.app/de/" />');
    expect(de).toContain('<meta property="og:url" content="https://lithobox.app/de/" />');
    expect(de).toContain(`>${dict('de')['seo.intro']}</p>`);
    expect(de).not.toContain(dict('en')['seo.intro']);
    // the alternate links stay the same on every page
    expect(de).toContain('<link rel="alternate" hreflang="en" href="https://lithobox.app/" />');
  });

  it('builds every language and points built assets one folder up', () => {
    const built = html.replace('href="/favicon.svg"', 'href="./favicon.svg"');
    for (const lang of languages.filter((l) => l !== 'en')) {
      expect(localizePage(built, lang, dict(lang))).toContain('href="../favicon.svg"');
    }
  });

  it('reads the language from a page address', () => {
    expect(languageFromPath('/de/')).toBe('de');
    expect(languageFromPath('/repo/fr/')).toBe('fr');
    expect(languageFromPath('/')).toBeNull();
    expect(languageFromPath('/en/')).toBeNull();
    expect(languageFromPath('/xx/')).toBeNull();
  });
});

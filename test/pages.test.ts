import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { languageFromPath, languages } from '../src/i18n';
import { getShape } from '../src/shapes';
import { localizePage, SHAPE_PAGES, shapeFromPath, shapePage } from '../src/i18n/pages';

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

  it('links every shape page and language from the About panel', () => {
    const about = html.slice(html.indexOf('<details class="about"'), html.indexOf('</details>', html.indexOf('<details class="about"')));
    for (const page of SHAPE_PAGES) expect(about).toContain(`href="https://lithobox.app/${page.slug}/"`);
    for (const lang of languages) expect(about).toContain(`href="https://lithobox.app/${lang === 'en' ? '' : `${lang}/`}"`);
  });

  it('builds each shape page with its own texts and no language alternates', () => {
    const en = dict('en');
    for (const page of SHAPE_PAGES) {
      expect(getShape(page.shape).id, page.slug).toBe(page.shape);
      expect(shapeFromPath(`/${page.slug}/`)).toBe(page.shape);
      const out = shapePage(html, page, en);
      expect(out).toContain(`<link rel="canonical" href="https://lithobox.app/${page.slug}/" />`);
      expect(out).toContain(`>${page.texts['seo.intro']}</p>`);
      expect(out).not.toContain('hreflang');
      // the paragraphs a shape page does not replace keep the main page's text
      expect(out).toContain(`>${en['seo.features']}</p>`);
    }
    expect(shapeFromPath('/')).toBeNull();
    expect(shapeFromPath('/de/')).toBeNull();
  });
});

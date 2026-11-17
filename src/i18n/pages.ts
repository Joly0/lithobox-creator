// The build writes one copy of index.html per language (/de/, /fr/, ...), so each language can be found in search.
export const SITE = 'https://lithobox.app/';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The built index.html as the page at /<lang>/: translated head and intro, assets one folder up. */
export function localizePage(html: string, lang: string, dict: Record<string, string>): string {
  const text = (key: string) => {
    if (!dict[key]) throw new Error(`localizePage: ${lang} has no ${key}`);
    return escape(dict[key]);
  };
  const swap = (from: string, to: string) => {
    if (!html.includes(from)) throw new Error(`localizePage: ${from} not found`);
    html = html.replace(from, to);
  };
  const url = `${SITE}${lang}/`;
  swap('<html lang="en">', `<html lang="${lang}">`);
  swap(`<link rel="canonical" href="${SITE}" />`, `<link rel="canonical" href="${url}" />`);
  swap(`<meta property="og:url" content="${SITE}" />`, `<meta property="og:url" content="${url}" />`);
  return (
    html
      // tags marked data-seo="key": a meta tag's content, or an element's text
      .replace(/<meta([^>]*) data-seo="([\w.]+)" content="[^"]*"/g, (_, a, key) => `<meta${a} data-seo="${key}" content="${text(key)}"`)
      .replace(/<(\w+)([^>]*) data-seo="([\w.]+)"([^>]*)>[^<]*<\/\1>/g, (_, tag, a, key, b) => `<${tag}${a} data-seo="${key}"${b}>${text(key)}</${tag}>`)
      .replace(/(src|href)="\.\//g, '$1="../')
  );
}

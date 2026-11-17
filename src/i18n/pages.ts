// The build writes copies of index.html for search: one per language (/de/, /fr/, ...) and one per shape
// page (/lithophane-lamp/, ...), each with its own title, description and intro.
export const SITE = 'https://lithobox.app/';

/** A page about one shape: it opens the app with that shape, and its texts replace the main page's. */
export interface ShapePage {
  slug: string;
  shape: string;
  texts: Record<'app.pageTitle' | 'seo.heading' | 'seo.description' | 'seo.intro', string>;
}

export const SHAPE_PAGES: ShapePage[] = [
  {
    slug: 'lithophane-box',
    shape: 'box',
    texts: {
      'app.pageTitle': 'Lithophane light box generator (STL/3MF) | Lithobox Creator',
      'seo.heading': 'Lithophane light box generator',
      'seo.description':
        'Free lithophane box maker in the browser: put up to five photos on a 3D printable light box with a lid, lamp seat and cable exit, from a 7 cm mini box to a 21 cm XL box. Download STL or 3MF, nothing is uploaded.',
      'seo.intro':
        'Turn your photos into a lithophane light box you can 3D print. Four pictures go on the sides and an optional fifth one in the lid, and a puck light or tea light in the base makes them glow. Pick a size from a 7 cm mini box to a 21 cm box that fits a 256 mm print bed, or set your own, then choose one of five lid closures, a cable exit, a battery tray and text on the base. Download it as STL or 3MF for Bambu Studio, OrcaSlicer or any slicer. Free, open source, and your photos never leave your device.',
    },
  },
  {
    slug: 'lithophane-frame',
    shape: 'panel',
    texts: {
      'app.pageTitle': 'Lithophane frame and light box generator (STL/3MF) | Lithobox Creator',
      'seo.heading': 'Flat lithophane, frame and light box generator',
      'seo.description':
        'Free flat lithophane maker in the browser: turn a photo into a 3D printable lithophane on its own, in a light box, on a lamp stand or in a slim LED strip frame. Download STL or 3MF, nothing is uploaded.',
      'seo.intro':
        'Turn a photo into a flat lithophane you can 3D print, and choose how it lights up: a light box behind the picture, an open stand with a holder for a puck light, a slim frame with a groove for an LED strip, or just the lithophane on its own. Square, landscape and portrait sizes are ready to go, or set your own. Flat pictures can also be made as colour lithophanes with cyan, magenta and yellow layers on printers with four filaments. Download it as STL or 3MF for Bambu Studio, OrcaSlicer or any slicer. Free, open source, and your photos never leave your device.',
    },
  },
  {
    slug: 'lithophane-ball-lamp',
    shape: 'sphere',
    texts: {
      'app.pageTitle': 'Lithophane ball lamp generator (STL/3MF) | Lithobox Creator',
      'seo.heading': 'Lithophane ball lamp generator',
      'seo.description':
        'Free lithophane ball lamp maker in the browser: wrap a photo around a 3D printable globe that replaces a glass lamp ball or stands on a base with an E27 socket or puck light. Download STL or 3MF, nothing is uploaded.',
      'seo.intro':
        'Turn your photos into a lithophane ball lamp you can 3D print. A band of photo runs around the ball, with an optional second photo on the back. Use it to replace the glass ball of an existing lamp, or stand it on a printed base with an E27 socket or a puck light, from 16 to 25 cm across. Download it as STL or 3MF for Bambu Studio, OrcaSlicer or any slicer. Free, open source, and your photos never leave your device.',
    },
  },
  {
    slug: 'lithophane-lampshade',
    shape: 'shade',
    texts: {
      'app.pageTitle': 'Lithophane lampshade generator (STL/3MF) | Lithobox Creator',
      'seo.heading': 'Lithophane lampshade generator',
      'seo.description':
        'Free lithophane lampshade maker in the browser: put up to four photos on a 3D printable cone or cylinder shade for an E14 or E27 socket, hanging from the ceiling or as a table lamp. Download STL or 3MF, nothing is uploaded.',
      'seo.intro':
        'Turn your photos into a lithophane lampshade you can 3D print. One to four pictures go around a cone or cylinder shade that fits an E14 or E27 lamp socket. Hang it from a ceiling socket, stand it on a printed base as a table lamp, or put it on a lamp foot. Download it as STL or 3MF for Bambu Studio, OrcaSlicer or any slicer. Free, open source, and your photos never leave your device.',
    },
  },
  {
    slug: 'lithophane-ornament',
    shape: 'ornament',
    texts: {
      'app.pageTitle': 'Lithophane ornament generator (STL/3MF) | Lithobox Creator',
      'seo.heading': 'Lithophane ornament generator',
      'seo.description':
        'Free lithophane ornament maker in the browser: turn a photo into a small 3D printable ornament shaped as a circle, star, hexagon or heart, with a loop for hanging. Download STL or 3MF, nothing is uploaded.',
      'seo.intro':
        'Turn a photo into a small lithophane ornament you can 3D print, for the Christmas tree, a window or as a gift. Pick a circle, star, hexagon or heart outline, from a 6 cm bauble to an 8 cm star, add a loop for hanging, and print it lying flat. Download it as STL or 3MF for Bambu Studio, OrcaSlicer or any slicer. Free, open source, and your photos never leave your device.',
    },
  },
  {
    slug: 'lithophane-heart',
    shape: 'heart',
    texts: {
      'app.pageTitle': 'Heart lithophane generator (STL/3MF) | Lithobox Creator',
      'seo.heading': 'Heart lithophane generator',
      'seo.description':
        'Free heart lithophane maker in the browser: turn a photo into a 3D printable heart lithophane to hang, or light it with a light box, stand or base. Download STL or 3MF, nothing is uploaded.',
      'seo.intro':
        'Turn a photo into a heart shaped lithophane you can 3D print, a personal gift for Valentine\'s Day, a wedding or an anniversary. Hang the heart on its own, or light it from behind with a light box, an open stand with a puck light holder, or a base with the light lying behind it. Sizes from 9 to 16 cm, or set your own. Download it as STL or 3MF for Bambu Studio, OrcaSlicer or any slicer. Free, open source, and your photos never leave your device.',
    },
  },
  {
    slug: 'lithophane-lamp',
    shape: 'cylinder',
    texts: {
      'app.pageTitle': 'Cylinder lithophane lamp generator (STL/3MF) | Lithobox Creator',
      'seo.heading': 'Cylinder lithophane lamp generator',
      'seo.description':
        'Free lithophane lamp maker in the browser: wrap a photo around a cylinder lamp with a base for a USB puck light, optionally with a second picture in the top. Download STL or 3MF, nothing is uploaded.',
      'seo.intro':
        'Turn your photos into a cylinder lithophane lamp you can 3D print. One picture wraps all the way around the cylinder, or several sit side by side, and they glow when the puck light in the base shines through. Pick a size (8 cm or 10 cm across, or 18 cm tall) or set your own, add a second lithophane in the top, and download the lamp as STL or 3MF for Bambu Studio, OrcaSlicer or any slicer. Free, open source, and your photos never leave your device.',
    },
  },
];

/** The shape a shape page's address stands for, if it is one. */
export function shapeFromPath(path: string): string | null {
  return SHAPE_PAGES.find((p) => path.endsWith(`/${p.slug}/`))?.shape ?? null;
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The built index.html as the page at `url`, one folder down: data-seo texts from `dict`, assets one folder up. */
function pageAt(html: string, url: string, lang: string, dict: Record<string, string>): string {
  const text = (key: string) => {
    if (!dict[key]) throw new Error(`${url} has no ${key}`);
    return escape(dict[key]);
  };
  const swap = (from: string, to: string) => {
    if (!html.includes(from)) throw new Error(`${url}: ${from} not found`);
    html = html.replace(from, to);
  };
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

/** The page at /<lang>/: the main page in that language. */
export function localizePage(html: string, lang: string, dict: Record<string, string>): string {
  return pageAt(html, `${SITE}${lang}/`, lang, dict);
}

/** The page at /<slug>/, in English. It has no translations, so it drops the language alternates. */
export function shapePage(html: string, page: ShapePage, en: Record<string, string>): string {
  return pageAt(html.replace(/ *<link rel="alternate" hreflang="[^"]+" href="[^"]+" \/>\n/g, ''), `${SITE}${page.slug}/`, 'en', { ...en, ...page.texts });
}

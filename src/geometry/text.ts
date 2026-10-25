// Text outlines for embossing and engraving. Fonts are bundled (SIL Open Font
// Licence, see src/assets/fonts/OFL-*.txt), loaded on demand inside the worker,
// and turned into manifold cross-sections.
import { parse, type Font } from 'opentype.js';
import abril from '../assets/fonts/AbrilFatface-Regular.ttf?url';
import stencil from '../assets/fonts/AllertaStencil-Regular.ttf?url';
import lato from '../assets/fonts/Lato-Bold.ttf?url';
import pacifico from '../assets/fonts/Pacifico-Regular.ttf?url';
import varela from '../assets/fonts/VarelaRound-Regular.ttf?url';
import type { CrossSection, Kernel } from './kernel';

export const FONT_URLS: Record<string, string> = {
  sans: lato,
  rounded: varela,
  serif: abril,
  script: pacifico,
  stencil: stencil,
};
export const FONT_IDS = Object.keys(FONT_URLS);

type Loader = (id: string) => Promise<ArrayBuffer>;
let loader: Loader = async (id) => (await fetch(FONT_URLS[id])).arrayBuffer();
/** Tests replace the loader to read font files from disk. */
export function setFontLoader(l: Loader): void {
  loader = l;
}

const fonts = new Map<string, Font>();
const pending = new Map<string, Promise<void>>();

export function ensureFont(id: string): Promise<void> {
  if (fonts.has(id)) return Promise.resolve();
  if (!FONT_URLS[id]) return Promise.reject(new Error(`unknown font ${id}`));
  let p = pending.get(id);
  if (!p) {
    // a failed download is forgotten, so the next build tries again
    p = loader(id).then(
      (buf) => void fonts.set(id, parse(buf)),
      (e) => {
        pending.delete(id);
        throw e;
      },
    );
    pending.set(id, p);
  }
  return p;
}

function font(id: string): Font {
  const f = fonts.get(id);
  if (!f) throw new Error(`font ${id} not loaded`);
  return f;
}

/** Bezier curves are split into straight pieces of about this length (mm). */
const SEG = 0.25;

export interface TextShape {
  cs: CrossSection;
  width: number;
  height: number;
}

/**
 * Lay out `text` (lines split on "\n") centred on the origin, x right, y up.
 * `capHeight` is the height of a capital letter in mm.
 */
export function textOutline(k: Kernel, text: string, fontId: string, capHeight: number, lineSpacing = 1.35): TextShape | null {
  const f = font(fontId);
  const os2 = (f.tables as { os2?: { sCapHeight?: number } }).os2;
  const capUnits = os2?.sCapHeight || f.unitsPerEm * 0.7;
  const size = (capHeight * f.unitsPerEm) / capUnits;
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length);
  if (!lines.length) return null;

  const contours: [number, number][][] = [];
  const lineGap = capHeight * lineSpacing;
  lines.forEach((line, i) => {
    const adv = f.getAdvanceWidth(line, size);
    const baseline = ((lines.length - 1) / 2 - i) * lineGap - capHeight / 2;
    const path = f.getPath(line, -adv / 2, 0, size);
    let cur: [number, number][] = [];
    let x = 0, y = 0;
    // opentype paths are y-down; flip to y-up and shift to the line's baseline
    const pt = (px: number, py: number): [number, number] => [px, -py + baseline];
    for (const c of path.commands) {
      switch (c.type) {
        case 'M':
          if (cur.length > 2) contours.push(cur);
          cur = [pt(c.x, c.y)];
          [x, y] = [c.x, c.y];
          break;
        case 'L':
          cur.push(pt(c.x, c.y));
          [x, y] = [c.x, c.y];
          break;
        case 'Q': {
          const n = Math.max(2, Math.ceil(Math.hypot(c.x - x, c.y - y) / SEG));
          for (let s = 1; s <= n; s++) {
            const t = s / n, u = 1 - t;
            cur.push(pt(u * u * x + 2 * u * t * c.x1 + t * t * c.x, u * u * y + 2 * u * t * c.y1 + t * t * c.y));
          }
          [x, y] = [c.x, c.y];
          break;
        }
        case 'C': {
          const n = Math.max(3, Math.ceil(Math.hypot(c.x - x, c.y - y) / SEG));
          for (let s = 1; s <= n; s++) {
            const t = s / n, u = 1 - t;
            cur.push(pt(
              u * u * u * x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
              u * u * u * y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
            ));
          }
          [x, y] = [c.x, c.y];
          break;
        }
        case 'Z':
          if (cur.length > 2) contours.push(cur);
          cur = [];
          break;
      }
    }
    if (cur.length > 2) contours.push(cur);
  });
  if (!contours.length) return null;
  // glyph outlines may overlap (script fonts); NonZero merges them
  const cs = k.CrossSection.ofPolygons(contours, 'NonZero');
  const b = cs.bounds();
  // re-centre on the ink, not the advance boxes
  const centred = cs.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]);
  return { cs: centred, width: b.max[0] - b.min[0], height: b.max[1] - b.min[1] };
}

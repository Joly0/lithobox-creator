// Colour lithophanes: the photo's colour as thin layers of cyan, magenta and yellow filament
// behind a white relief (phase 7). The white relief carries the brightness as in a mono picture;
// the colour layers only tint the light. Printed flat, face down, the stack from the bed is:
//   BASE mm white | cyan, magenta, yellow in LAYER mm layers, in that order | white relief.
//
// Each colour layer lets through a share of red, green and blue that follows from the
// filament's colour: FULL layers of it show the filament's own colour (an estimate, to be tuned
// by a test print). Per cell the number of layers of each colour is chosen so the stack's
// filter matches the photo's hue and saturation; what the filter darkens, the relief makes up.

/** Thickness of one colour layer (mm): the print's layer height. */
export const LAYER = 0.1;
/** White below the colour stack (mm): the first layer. */
export const BASE = 0.2;
/** Colour cell size (mm): about one line width, as in the measured reference. */
export const CELL = 0.44;
/** Layers of one filament that show its own colour. */
export const FULL = 5;
/** The least of a channel a filament lets through: a printed colour overstates how much it blocks. */
const LEAK = 0.03;
/** Default filament colours: cyan, magenta, yellow. */
export const DEFAULT_FILAMENTS: [string, string, string] = ['#0086D6', '#EC008C', '#F4EE2A'];

export type RGB = [number, number, number];

/** A photo's sRGB value (0..1) as light. */
export const toLight = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
/** Light (0..1) as an sRGB value. */
export const fromLight = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
/** Brightness of linear light. */
export const lightY = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** '#rrggbb' as linear light; anything else as white. */
export function hexLight(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [toLight(((n >> 16) & 255) / 255), toLight(((n >> 8) & 255) / 255), toLight((n & 255) / 255)];
}

/** What one layer of a filament lets through, per channel. */
export function layerTransmission(hex: string): RGB {
  return hexLight(hex).map((v) => Math.max(v, LEAK) ** (1 / FULL)) as RGB;
}

/** A cell's colour layers and the light they let through. */
export interface Stack {
  /** Layers of cyan, magenta, yellow. */
  n: [number, number, number];
  /** Share of red, green, blue the stack lets through. */
  filter: RGB;
}

/**
 * Chooses colour stacks for photo colours. `layers`: at most this many colour layers per cell.
 * Returns a function from a photo colour (sRGB, 0..1) to its stack; results are cached.
 */
export function separator(filaments: [string, string, string], layers: number): (r: number, g: number, b: number) => Stack {
  const ln = filaments.map((f) => layerTransmission(f).map(Math.log)) as RGB[];
  // every stack that fits, with its filter in log space
  const stacks: (Stack & { log: RGB })[] = [];
  for (let c = 0; c <= layers; c++)
    for (let m = 0; c + m <= layers; m++)
      for (let y = 0; c + m + y <= layers; y++) {
        const log = [0, 1, 2].map((k) => c * ln[0][k] + m * ln[1][k] + y * ln[2][k]) as RGB;
        stacks.push({ n: [c, m, y], filter: log.map(Math.exp) as RGB, log });
      }
  const floor = Math.log(0.02);
  const cache = new Map<number, Stack>();
  const Q = 63;
  return (r, g, b) => {
    // the photo's hue and saturation as a filter: its brightest channel passes all
    const lin: RGB = [toLight(r), toLight(g), toLight(b)];
    const top = Math.max(...lin);
    const want = top < 1e-4 ? [1, 1, 1] : lin.map((v) => v / top);
    const key = (Math.round(want[0] * Q) * (Q + 1) + Math.round(want[1] * Q)) * (Q + 1) + Math.round(want[2] * Q);
    const hit = cache.get(key);
    if (hit) return hit;
    const target = want.map((v) => Math.max(Math.log(Math.max(v, 1e-6)), floor));
    let best = stacks[0], err = Infinity;
    for (const s of stacks) {
      // the photo's brightest channel should pass: the relief can only make up a little darkening
      let e = 0;
      for (let k = 0; k < 3; k++) e += (target[k] - s.log[k]) ** 2;
      // fewer layers when it makes no visible difference
      e += 1e-4 * (s.n[0] + s.n[1] + s.n[2]);
      if (e < err) (err = e), (best = s);
    }
    const out: Stack = { n: best.n, filter: best.filter };
    cache.set(key, out);
    return out;
  };
}

/**
 * The brightness the white relief must show (sRGB, 0..1) so that, behind a stack with this
 * filter, the light comes out as bright as the photo's `l`. Clamped: a stack darker than the
 * photo leaves the relief at its thinnest.
 */
export function compensate(l: number, filter: RGB): number {
  return fromLight(Math.min(1, toLight(l) / Math.max(lightY(filter), 1e-3)));
}

/** Colour stacks on a cell grid. */
export interface ColourMap {
  cols: number;
  rows: number;
  /** Layers of cyan, magenta, yellow per cell (3 per cell, row 0 at the top). */
  n: Uint8Array;
  /** Light let through per cell (3 per cell). */
  filter: Float32Array;
}

/**
 * Colour stacks for a picture of w × h mm whose colours are `rgb` (3 per sample, sRGB, row 0
 * at the top, cols × rows samples spread over the picture), on CELL sized cells.
 */
export function colourMap(rgb: Float32Array, cols: number, rows: number, w: number, h: number, stackOf: ReturnType<typeof separator>): ColourMap {
  const cc = Math.max(1, Math.round(w / CELL)), cr = Math.max(1, Math.round(h / CELL));
  const n = new Uint8Array(cc * cr * 3), filter = new Float32Array(cc * cr * 3);
  const at = (u: number, v: number, k: number) => {
    // bilinear, as the relief samples its picture (sample in mesh.ts)
    const x = Math.min(Math.max(u, 0), 1) * (cols - 1), y = Math.min(Math.max(v, 0), 1) * (rows - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, cols - 1), y1 = Math.min(y0 + 1, rows - 1);
    const fx = x - x0, fy = y - y0, g = (i: number, j: number) => rgb[(j * cols + i) * 3 + k];
    return (g(x0, y0) * (1 - fx) + g(x1, y0) * fx) * (1 - fy) + (g(x0, y1) * (1 - fx) + g(x1, y1) * fx) * fy;
  };
  for (let j = 0; j < cr; j++)
    for (let i = 0; i < cc; i++) {
      const u = (i + 0.5) / cc, v = (j + 0.5) / cr;
      const s = stackOf(at(u, v, 0), at(u, v, 1), at(u, v, 2));
      const o = (j * cc + i) * 3;
      for (let k = 0; k < 3; k++) (n[o + k] = s.n[k]), (filter[o + k] = s.filter[k]);
    }
  return { cols: cc, rows: cr, n, filter };
}

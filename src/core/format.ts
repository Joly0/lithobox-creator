// Picture formats: the visible picture's width to its height, where the visible picture is the
// lithophane less its margin all round. A photo of that format then fills it without cropping.
import type { NumberParam, ParamDef, ParamValues, SelectParam } from './types';

/** Width to height of each named format. */
export const FORMATS: Record<string, number> = {
  '1:1': 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '3:2': 3 / 2,
  '2:3': 2 / 3,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '5:4': 5 / 4,
  '4:5': 4 / 5,
};

/** The format setting for a picture sized by `panelWidth` x `panelHeight`. 'custom' keeps the proportions it was linked at. */
export const formatParam: SelectParam = {
  key: 'picFormat',
  type: 'select',
  default: 'free',
  options: ['free', ...Object.keys(FORMATS), 'custom'],
  ratio: { width: 'panelWidth', height: 'panelHeight' },
};

const margin = (p: ParamValues) => (typeof p.lithoMargin === 'number' ? p.lithoMargin : 2);

/** The visible picture's size for these values. */
export function pictureSize(p: ParamValues, link: { width: string; height: string }): [number, number] {
  const m = margin(p);
  return [(p[link.width] as number) - 2 * m, (p[link.height] as number) - 2 * m];
}

/** A height for this width in a format (and back): its step and limits kept. */
function fit(def: NumberParam, v: number): number {
  const stepped = Math.round((v - def.min) / def.step) * def.step + def.min;
  return Math.min(def.max, Math.max(def.min, +stepped.toFixed(4)));
}

/** The named format the sizes match (to within half a step of the height), else null. */
export function matchFormat(p: ParamValues, def: SelectParam, params: ParamDef[]): string | null {
  const link = def.ratio!;
  const h = params.find((d) => d.key === link.height) as NumberParam;
  const m = margin(p);
  const [pw] = pictureSize(p, link);
  for (const [id, r] of Object.entries(FORMATS)) if (Math.abs(pw / r + 2 * m - (p[link.height] as number)) <= h.step / 2 + 1e-6) return id;
  return null;
}

/** After loading values: a named format the sizes no longer match becomes the one they match, or free. */
export function settleFormats(p: ParamValues, params: ParamDef[]): void {
  for (const def of params)
    if (def.type === 'select' && def.ratio && String(p[def.key]) in FORMATS && matchFormat(p, def, params) !== p[def.key]) p[def.key] = matchFormat(p, def, params) ?? 'free';
}

/**
 * Keeps width and height in their format after `key` changed (`prev`: the values before). The
 * width leads, except when the height was changed; a side at its limit pulls the other back.
 * Returns whether it changed anything.
 */
export function linkFormat(p: ParamValues, params: ParamDef[], key: string, prev: ParamValues): boolean {
  let changed = false;
  for (const def of params) {
    if (def.type !== 'select' || !def.ratio || p[def.key] === 'free') continue;
    const link = def.ratio;
    if (![link.width, link.height, def.key, 'lithoMargin'].includes(key)) continue;
    const w = params.find((d) => d.key === link.width) as NumberParam;
    const h = params.find((d) => d.key === link.height) as NumberParam;
    // custom: the proportions before this change
    const [pw0, ph0] = pictureSize(prev, link);
    const r = FORMATS[p[def.key] as string] ?? pw0 / ph0;
    const m = margin(p);
    const W = p[link.width] as number, H = p[link.height] as number;
    // the side that was changed stays as set, unless the other would pass its limit
    let nw = W, nh = H;
    if (key === link.height) {
      const ideal = (H - 2 * m) * r + 2 * m;
      nw = fit(w, ideal);
      if (ideal > w.max || ideal < w.min) nh = fit(h, (nw - 2 * m) / r + 2 * m);
    } else {
      const ideal = (W - 2 * m) / r + 2 * m;
      nh = fit(h, ideal);
      if (ideal > h.max || ideal < h.min) nw = fit(w, (nh - 2 * m) * r + 2 * m);
    }
    if (nw !== W || nh !== H) {
      p[link.width] = nw;
      p[link.height] = nh;
      changed = true;
    }
  }
  return changed;
}

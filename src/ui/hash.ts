// The design in the address bar: a link that opens the same shape with the same settings.
import { defaultValues, type ShapeDefinition } from '../core/shape';
import type { ParamValues } from '../core/types';

/** The shape id and settings in a link's hash, if any. A broken link gives no settings. */
export function readHash(hash: string): { shape: string | null; params: Partial<ParamValues> } {
  const h = new URLSearchParams(hash.replace(/^#/, ''));
  let params: Partial<ParamValues> = {};
  try {
    const p = h.get('p');
    if (p) params = JSON.parse(decodeURIComponent(escape(atob(p))));
  } catch {
    /* ignore a broken share link */
  }
  return { shape: h.get('s'), params };
}

/** The settings that differ from the shape's defaults, which is all a link needs. */
export function changedValues(shape: ShapeDefinition, values: ParamValues): ParamValues {
  const defs = defaultValues(shape);
  const changed: ParamValues = {};
  for (const [k, v] of Object.entries(values)) if (defs[k] !== v) changed[k] = v;
  return changed;
}

/** The hash for a shape with these changed settings, without the leading '#'. */
export function hashFor(shapeId: string, changed: ParamValues): string {
  const h = new URLSearchParams({ s: shapeId });
  if (Object.keys(changed).length) h.set('p', btoa(unescape(encodeURIComponent(JSON.stringify(changed)))));
  return h.toString();
}

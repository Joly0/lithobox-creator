// A shape is one kind of lamp (box, later cylinder, sphere, ...). Adding a
// shape means writing one module that implements ShapeDefinition and
// registering it in src/shapes/index.ts. UI, viewer and export are generic.
import type { Kernel } from '../geometry/kernel';
import { settleFormats } from './format';
import type { BuildResult, Message, ParamDef, ParamGroup, ParamValues } from './types';

export interface ShapeDefinition {
  /** Stable id, used in URLs and i18n keys (`shape.<id>.*`). */
  id: string;
  groups: ParamGroup[];
  /** Cheap checks that run on the UI thread before a build. */
  validate?(p: ParamValues): Message[];
  /** Named starting points; each sets some values on top of the current ones. */
  presets?: ShapePreset[];
  /** Load what build() needs asynchronously (fonts, ...). Runs in the worker before build. */
  prepare?(p: ParamValues): Promise<void>;
  /** Build all parts. Runs inside the geometry worker within a memory scope. */
  build(k: Kernel, p: ParamValues): BuildResult;
}

export interface ShapePreset {
  /** i18n key `shape.<shape>.preset.<id>` */
  id: string;
  values: Partial<ParamValues>;
}

/** The preset whose values all match `v`, if any. */
export function matchingPreset(shape: ShapeDefinition, v: ParamValues): ShapePreset | undefined {
  return shape.presets?.find((pr) => Object.entries(pr.values).every(([k, x]) => v[k] === x));
}

export function allParams(shape: ShapeDefinition): ParamDef[] {
  return shape.groups.flatMap((g) => g.params);
}

export function defaultValues(shape: ShapeDefinition): ParamValues {
  const v: ParamValues = {};
  for (const p of allParams(shape)) v[p.key] = p.default;
  return v;
}

/** Fill gaps with defaults and clamp numbers into range (e.g. values from a shared URL). */
export function sanitize(shape: ShapeDefinition, input: Partial<ParamValues>): ParamValues {
  const out = defaultValues(shape);
  for (const p of allParams(shape)) {
    const v = input[p.key];
    if (v === undefined) continue;
    if (p.type === 'number' && typeof v === 'number' && Number.isFinite(v)) out[p.key] = Math.min(p.max, Math.max(p.min, v));
    else if (p.type === 'bool' && typeof v === 'boolean') out[p.key] = v;
    else if (p.type === 'select' && typeof v === 'string' && p.options.includes(v)) out[p.key] = v;
    // a carriage return (text pasted from Windows) would show as a gap or a box in the letters
    else if (p.type === 'text' && typeof v === 'string') out[p.key] = (p.multiline ? v.replace(/\r/g, '') : v.replace(/\r?\n|\r/g, ' ')).slice(0, p.maxLength);
    else if (p.type === 'color' && typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) out[p.key] = v.toLowerCase();
  }
  settleFormats(out, allParams(shape));
  return out;
}

export const num = (p: ParamValues, k: string): number => p[k] as number;
export const bool = (p: ParamValues, k: string): boolean => p[k] as boolean;
export const str = (p: ParamValues, k: string): string => p[k] as string;
/** A number for messages, to `d` decimals (0.1 by default). */
export const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

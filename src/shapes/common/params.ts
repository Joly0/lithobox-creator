// Helpers for shapes that reuse the box's own settings: fromBox takes the box's definition of a
// setting and shows it only when `when` holds.
import type { ParamDef, ParamValues } from '../../core/types';
import { boxGroups } from '../box/params';

export type When = (p: ParamValues) => boolean;

/** The box's own definition of a setting, shown only when `when` holds. */
export function fromBox(key: string, when: When, over: Partial<ParamDef> = {}): ParamDef {
  const def = boxGroups.flatMap((g) => g.params).find((d) => d.key === key);
  if (!def) throw new Error(`no box setting ${key}`);
  const vis = def.visibleIf;
  return { ...def, visibleIf: (p) => when(p) && (!vis || vis(p)), ...over } as ParamDef;
}

export const keys = (when: When, ...k: string[]) => k.map((x) => fromBox(x, when));

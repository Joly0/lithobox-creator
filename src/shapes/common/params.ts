// Helpers for shapes that reuse the box's own settings: fromBox takes the box's definition of a
// setting and shows it only when `when` holds.
import type { ParamDef, ParamGroup, ParamValues } from '../../core/types';
import { boxGroups } from '../box/params';

export type When = (p: ParamValues) => boolean;

/** For settings every variant of a shape shows. */
export const always: When = () => true;

/** The box's own definition of a setting, shown only when `when` holds. */
export function fromBox(key: string, when: When, over: Partial<ParamDef> = {}): ParamDef {
  const def = boxGroups.flatMap((g) => g.params).find((d) => d.key === key);
  if (!def) throw new Error(`no box setting ${key}`);
  const vis = def.visibleIf;
  return { ...def, visibleIf: (p) => when(p) && (!vis || vis(p)), ...over } as ParamDef;
}

export const keys = (when: When, ...k: string[]) => k.map((x) => fromBox(x, when));

/**
 * The box's battery tray settings for a shape without a lid, shown when `when` holds: the
 * magnets and pegs between base and tray get their sizes here.
 */
export function powerGroup(when: When): ParamGroup {
  const joint = (j: string) => (p: ParamValues) => when(p) && p.powerBase === true && p.powerJoint === j;
  return {
    id: 'power',
    params: [
      ...boxGroups.find((g) => g.id === 'power')!.params.map((d) => fromBox(d.key, when)),
      ...['magnetDiameter', 'magnetHeight'].map((k) => fromBox(k, when, { visibleIf: joint('magnets') })),
      fromBox('pegSize', when, { visibleIf: joint('pegs') }),
    ],
  };
}

/** The clearance settings in the box's order (the keys of its 'clearances' group). */
export const CLEARANCE_KEYS = boxGroups.find((g) => g.id === 'clearances')!.params.map((d) => d.key);

/**
 * A shape's clearances category: each setting it uses with when it applies (on top of the
 * setting's own condition, e.g. the magnets only with magnets), in the box's order.
 */
export function clearanceGroup(when: Record<string, When>): ParamGroup {
  return { id: 'clearances', params: CLEARANCE_KEYS.filter((k) => when[k]).map((k) => fromBox(k, when[k])) };
}

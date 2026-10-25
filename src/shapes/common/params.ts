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
      ...['magnetDiameter', 'magnetHeight', 'magnetClearance'].map((k) => fromBox(k, when, { visibleIf: joint('magnets') })),
      fromBox('pegSize', when, { visibleIf: joint('pegs') }),
    ],
  };
}

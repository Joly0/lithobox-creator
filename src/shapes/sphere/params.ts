import type { ParamGroup, ParamValues } from '../../core/types';
import { boxGroups, COLOUR_KEYS } from '../box/params';
import { fromBox, type When } from '../cylinder/params';

/** Standing on its own cut rim (over an existing lamp fitting), or in a base with a lamp. */
export const MOUNTS = ['standalone', 'base'];

export const standalone = (p: ParamValues) => p.mount === 'standalone';
export const onBase = (p: ParamValues) => p.mount === 'base';
export const basePuck = (p: ParamValues) => onBase(p) && p.tableLamp === 'puck';
export const baseSocket = (p: ParamValues) => onBase(p) && p.tableLamp === 'socket';

const keys = (when: When, ...k: string[]) => k.map((x) => fromBox(x, when));
const litho = boxGroups.find((g) => g.id === 'litho')!;
const power = (p: ParamValues) => basePuck(p) && p.powerBase === true;

export const sphereGroups: ParamGroup[] = [
  {
    id: 'panels',
    params: [
      { key: 'sphereDiameter', type: 'number', default: 200, min: 60, max: 300, step: 0.5, unit: 'mm' },
      { key: 'sphereHeight', type: 'number', default: 185, min: 40, max: 300, step: 0.5, unit: 'mm' },
      fromBox('panelThickness', () => true),
      { key: 'bandBottom', type: 'number', default: -40, min: -80, max: 70, step: 1, unit: 'deg' },
      { key: 'bandTop', type: 'number', default: 55, min: -70, max: 85, step: 1, unit: 'deg' },
      // how the photo is laid on the ball (see sphereUV in src/litho/mesh.ts)
      { key: 'projection', type: 'select', default: 'front', options: ['front', 'band', 'conformal'] },
      { key: 'wrapWidth', type: 'number', default: 180, min: 60, max: 360, step: 5, unit: 'deg', visibleIf: (p) => p.projection !== 'front' },
      { key: 'frontWidth', type: 'number', default: 100, min: 30, max: 160, step: 1, unit: 'deg', visibleIf: (p) => p.projection === 'front' },
      { key: 'frontBlend', type: 'number', default: 50, min: 0, max: 100, step: 5, unit: '%', visibleIf: (p) => p.projection !== 'conformal' },
      // a second photo on the back half (seen from behind)
      { key: 'backPhoto', type: 'bool', default: false, visibleIf: (p) => p.projection === 'front' },
      fromBox('slotClearance', onBase),
    ],
  },
  // a ball stands on its own while it prints: no support fins
  { ...litho, params: litho.params.filter((d) => d.key !== 'lithoSupports' && d.key !== 'lithoSupportSize' && !COLOUR_KEYS.includes(d.key)) },
  {
    id: 'light',
    params: [
      { key: 'mount', type: 'select', default: 'standalone', options: MOUNTS },
      { key: 'cableHole', type: 'bool', default: true, visibleIf: standalone },
      { key: 'tableLamp', type: 'select', default: 'puck', options: ['puck', 'socket'], visibleIf: onBase },
      { key: 'socket', type: 'select', default: 'e27', options: ['e27', 'e14'], visibleIf: baseSocket },
      { key: 'socketHoleE27', type: 'number', default: 41, min: 30, max: 50, step: 0.1, unit: 'mm', advanced: true, visibleIf: (p) => baseSocket(p) && p.socket === 'e27' },
      { key: 'socketHoleE14', type: 'number', default: 29, min: 20, max: 40, step: 0.1, unit: 'mm', advanced: true, visibleIf: (p) => baseSocket(p) && p.socket === 'e14' },
      { key: 'socketRoom', type: 'number', default: 45, min: 20, max: 100, step: 1, unit: 'mm', advanced: true, visibleIf: baseSocket },
    ],
  },
  {
    id: 'base',
    params: [
      ...keys(basePuck, 'baseHeight', 'lampDiameter', 'lampSeatDepth', 'steelDisc', 'discDiameter', 'discDepth', 'discKeepClear'),
      fromBox('baseGroove', onBase, { default: 4 }),
      { key: 'baseRim', type: 'number', default: 6, min: 2, max: 30, step: 0.5, unit: 'mm', advanced: true, visibleIf: onBase },
    ],
  },
  {
    id: 'cable',
    params: keys(basePuck, 'cableMode', 'cableHoleWidth', 'cableHoleLength', 'cableHoleOffset', 'cableChannel', 'cableChannelWidth', 'cableChannelDepth'),
  },
  {
    id: 'text',
    params: [...keys(onBase, 'baseText', 'baseTextStyle', 'baseTextSize', 'textFont', 'textDepth'), fromBox('textSecondColor', onBase)],
  },
  {
    // battery tray under a base with a puck light
    id: 'power',
    params: [
      ...boxGroups.find((g) => g.id === 'power')!.params.map((d) => fromBox(d.key, basePuck)),
      ...['magnetDiameter', 'magnetHeight', 'magnetClearance'].map((k) => fromBox(k, basePuck, { visibleIf: (p) => power(p) && p.powerJoint === 'magnets' })),
      fromBox('pegSize', basePuck, { visibleIf: (p) => power(p) && p.powerJoint === 'pegs' }),
    ],
  },
  boxGroups.find((g) => g.id === 'print')!,
];

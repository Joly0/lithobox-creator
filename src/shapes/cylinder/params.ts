import type { ParamGroup, ParamValues } from '../../core/types';
import { boxGroups, COLOUR_KEYS } from '../box/params';
import { always, fromBox, keys, powerGroup } from '../common/params';

/** With a base (lamp seat, cable) or the cylinder on its own. */
export const LIGHTING = ['base', 'plain'];

export const withBase = (p: ParamValues) => p.lighting === 'base';

const ring = (p: ParamValues) => p.topRing === true;

// a cylinder stands on its own while it prints: no support fins
const litho = boxGroups.find((g) => g.id === 'litho')!;

export const cylinderGroups: ParamGroup[] = [
  {
    id: 'panels',
    params: [
      { key: 'cylDiameter', type: 'number', default: 100, min: 50, max: 250, step: 0.5, unit: 'mm' },
      { key: 'panelHeight', type: 'number', default: 130, min: 40, max: 300, step: 0.5, unit: 'mm' },
      { key: 'panelThickness', type: 'number', default: 3.2, min: 1, max: 8, step: 0.1, unit: 'mm' },
      fromBox('slotClearance', always),
    ],
  },
  { ...litho, params: litho.params.filter((d) => d.key !== 'lithoSupports' && d.key !== 'lithoSupportSize' && !COLOUR_KEYS.includes(d.key)) },
  {
    id: 'light',
    params: [
      { key: 'lighting', type: 'select', default: 'base', options: LIGHTING },
      { key: 'topRing', type: 'bool', default: true },
      // the ring becomes a lid with a round picture in it (off at first: light leaves at the top)
      fromBox('topPanel', ring, { default: false }),
      fromBox('topLedge', ring),
    ],
  },
  {
    id: 'base',
    params: [
      ...keys(withBase, 'baseHeight', 'lampDiameter', 'lampSeatDepth', 'steelDisc', 'discDiameter', 'discDepth', 'discKeepClear'),
      fromBox('baseGroove', always, { default: 4 }),
      { key: 'baseRim', type: 'number', default: 4, min: 2, max: 20, step: 0.5, unit: 'mm', advanced: true },
    ],
  },
  {
    id: 'cable',
    params: keys(withBase, 'cableMode', 'cableHoleWidth', 'cableHoleLength', 'cableHoleOffset', 'cableChannel', 'cableChannelWidth', 'cableChannelDepth'),
  },
  {
    // base text bent round the base; lid text bent along the top ring
    id: 'text',
    params: [
      ...keys(withBase, 'baseText', 'baseTextStyle', 'baseTextSize'),
      ...keys(ring, 'topText', 'topTextStyle', 'topTextSize'),
      ...keys(always, 'textFont', 'textDepth'),
      fromBox('textSecondColor', withBase),
    ],
  },
  // battery tray under the base, round like it
  powerGroup(withBase),
  boxGroups.find((g) => g.id === 'print')!,
];

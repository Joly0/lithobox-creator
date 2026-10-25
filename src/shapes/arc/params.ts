import type { ParamGroup, ParamValues } from '../../core/types';
import { boxGroups, COLOUR_KEYS } from '../box/params';
import { always, clearanceGroup, fromBox, keys, powerGroup } from '../common/params';

/** Base (puck lying in a seat), open stand (upright puck holder behind the picture), or no lamp. */
export const LIGHTING = ['base', 'stand', 'plain'];

export const withBase = (p: ParamValues) => p.lighting === 'base';
/** Open stand: the curved foot with the flat stand's upright holder behind the picture. */
export const withStand = (p: ParamValues) => p.lighting === 'stand';
/** Both the base and the stand use the curved foot, so their shared settings show for either. */
export const withFoot = (p: ParamValues) => withBase(p) || withStand(p);


// support fins as for the flat picture: a curve alone stands, but wobbles while it prints tall
const litho = boxGroups.find((g) => g.id === 'litho')!;

export const arcGroups: ParamGroup[] = [
  {
    id: 'panels',
    params: [
      { key: 'arcWidth', type: 'number', default: 150, min: 40, max: 300, step: 0.5, unit: 'mm' },
      { key: 'panelHeight', type: 'number', default: 100, min: 30, max: 300, step: 0.5, unit: 'mm' },
      { key: 'arcRadius', type: 'number', default: 150, min: 40, max: 1000, step: 1, unit: 'mm' },
      { key: 'panelThickness', type: 'number', default: 3.2, min: 1, max: 8, step: 0.1, unit: 'mm' },
    ],
  },
  // curved: no colour (it cannot print flat)
  // play between the parts this shape has
  clearanceGroup({ slotClearance: always, slotWidthClearance: always, magnetClearance: withBase, bankClearance: withBase, powerTrayClearance: withBase, discClearance: withFoot, holderClearance: withStand }),
  { ...litho, params: litho.params.filter((d) => !COLOUR_KEYS.includes(d.key)) },
  {
    id: 'light',
    params: [
      { key: 'lighting', type: 'select', default: 'base', options: LIGHTING },
      // the stand's holder, as on the flat picture
      { key: 'lampDistance', type: 'number', default: 40, min: 10, max: 150, step: 1, unit: 'mm', visibleIf: withStand },
      { key: 'holderDepth', type: 'number', default: 8, min: 2, max: 30, step: 0.5, unit: 'mm', visibleIf: withStand },
      { key: 'wallThickness', type: 'number', default: 2.4, min: 1.2, max: 6, step: 0.2, unit: 'mm', visibleIf: withStand, advanced: true },
    ],
  },
  {
    id: 'base',
    params: [
      ...keys(withFoot, 'baseHeight', 'lampDiameter'),
      fromBox('lampSeatDepth', withBase),
      ...keys(withFoot, 'steelDisc', 'discDiameter', 'discDepth'),
      fromBox('discKeepClear', withBase),
      fromBox('baseGroove', always, { default: 4 }),
      { key: 'baseRim', type: 'number', default: 4, min: 2, max: 20, step: 0.5, unit: 'mm', advanced: true },
    ],
  },
  {
    id: 'cable',
    params: keys(withBase, 'cableMode', 'cableHoleWidth', 'cableHoleLength', 'cableHoleOffset', 'cableChannel', 'cableChannelWidth', 'cableChannelDepth'),
  },
  {
    // text bent along the foot's curved front (the feet have no room for it)
    id: 'text',
    params: [...keys(withFoot, 'baseText', 'baseTextStyle', 'baseTextSize', 'textFont', 'textDepth'), fromBox('textSecondColor', withFoot)],
  },
  // battery tray under the base, following its outline
  powerGroup(withBase),
  boxGroups.find((g) => g.id === 'print')!,
];

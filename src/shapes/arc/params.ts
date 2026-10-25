import type { ParamGroup } from '../../core/types';
import { boxGroups, COLOUR_KEYS } from '../box/params';
import { fromBox, keys } from '../common/params';
import { LIGHTING, withBase } from '../cylinder/params';

export { withBase };

const always = () => true;

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
      fromBox('slotClearance', always),
    ],
  },
  // curved: no colour (it cannot print flat)
  { ...litho, params: litho.params.filter((d) => !COLOUR_KEYS.includes(d.key)) },
  {
    id: 'light',
    params: [{ key: 'lighting', type: 'select', default: 'base', options: LIGHTING }],
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
    // text bent along the base's curved front (the feet have no room for it)
    id: 'text',
    params: [...keys(withBase, 'baseText', 'baseTextStyle', 'baseTextSize', 'textFont', 'textDepth'), fromBox('textSecondColor', withBase)],
  },
  // battery tray under the base, following its outline
  {
    id: 'power',
    params: [
      ...boxGroups.find((g) => g.id === 'power')!.params.map((d) => fromBox(d.key, withBase)),
      // no lid here: the magnets and pegs between base and tray get their sizes in this group
      ...['magnetDiameter', 'magnetHeight', 'magnetClearance'].map((k) => fromBox(k, withBase, { visibleIf: (p) => withBase(p) && p.powerBase === true && p.powerJoint === 'magnets' })),
      fromBox('pegSize', withBase, { visibleIf: (p) => withBase(p) && p.powerBase === true && p.powerJoint === 'pegs' }),
    ],
  },
  boxGroups.find((g) => g.id === 'print')!,
];

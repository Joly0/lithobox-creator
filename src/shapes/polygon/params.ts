import { formatParam } from '../../core/format';
import type { ParamGroup } from '../../core/types';
import { boxGroups } from '../box/params';
import { always, clearanceGroup, fromBox } from '../common/params';

export const SIDES = ['3', '5', '6', '8'];

const group = (id: string) => boxGroups.find((g) => g.id === id)!;
const box = (...keys: string[]) => keys.map((k) => fromBox(k, always));

export const polygonGroups: ParamGroup[] = [
  {
    id: 'panels',
    params: [
      { key: 'sides', type: 'select', default: '6', options: SIDES },
      formatParam,
      { key: 'panelWidth', type: 'number', default: 80, min: 30, max: 250, step: 0.5, unit: 'mm' },
      { key: 'panelHeight', type: 'number', default: 100, min: 30, max: 300, step: 0.5, unit: 'mm' },
      ...box('panelThickness', 'slotEngage'),
    ],
  },
  // play between the parts this shape has
  clearanceGroup({ slotClearance: always, slotWidthClearance: always, plugClearance: always, magnetClearance: always, bankClearance: always, powerTrayClearance: always, discClearance: always }),
  group('litho'),
  // the polygon's plugs hold the magnets with 14 mm posts
  { ...group('frame'), params: group('frame').params.map((d) => (d.key === 'postSize' ? fromBox('postSize', always, { default: 14 }) : d)) },
  group('base'),
  group('cable'),
  // the box's lid and closures
  // the box's lid and closures, and like the box a picture on top (cut to the polygon; off at first)
  { ...group('lid'), params: [fromBox('topPanel', always, { default: false }), ...group('lid').params] },
  group('text'),
  group('power'),
  group('print'),
];

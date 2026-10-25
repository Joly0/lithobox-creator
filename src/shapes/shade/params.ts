import type { ParamGroup, ParamValues } from '../../core/types';
import { boxGroups, COLOUR_KEYS } from '../box/params';
import { fromBox, keys } from '../common/params';

export const SHADES = ['cone', 'cylinder'];
/** Hung from a ceiling socket, or standing on a base with a lamp in it. */
export const MOUNTS = ['pendant', 'table'];

export const cone = (p: ParamValues) => p.shadeShape === 'cone';
export const pendant = (p: ParamValues) => p.mount === 'pendant';
export const table = (p: ParamValues) => p.mount === 'table';
/** On a table: a puck light in a seat, or a lamp socket in a hollow base. */
export const tablePuck = (p: ParamValues) => table(p) && p.tableLamp === 'puck';
export const tableSocket = (p: ParamValues) => table(p) && p.tableLamp === 'socket';
/** A lamp socket is used: the pendant's, or the table base's. */
const socket = (p: ParamValues) => pendant(p) || tableSocket(p);

const litho = boxGroups.find((g) => g.id === 'litho')!;
const power = (p: ParamValues) => tablePuck(p) && p.powerBase === true;

export const shadeGroups: ParamGroup[] = [
  {
    id: 'panels',
    params: [
      { key: 'shadeShape', type: 'select', default: 'cone', options: SHADES },
      { key: 'topDiameter', type: 'number', default: 120, min: 50, max: 300, step: 0.5, unit: 'mm' },
      { key: 'bottomDiameter', type: 'number', default: 180, min: 50, max: 300, step: 0.5, unit: 'mm', visibleIf: cone },
      { key: 'panelHeight', type: 'number', default: 150, min: 40, max: 300, step: 0.5, unit: 'mm' },
      fromBox('panelThickness', () => true),
      fromBox('slotClearance', table),
    ],
  },
  // a shade stands on its own while it prints: no support fins
  { ...litho, params: litho.params.filter((d) => d.key !== 'lithoSupports' && d.key !== 'lithoSupportSize' && !COLOUR_KEYS.includes(d.key)) },
  {
    id: 'light',
    params: [
      { key: 'mount', type: 'select', default: 'pendant', options: MOUNTS },
      { key: 'tableLamp', type: 'select', default: 'puck', options: ['puck', 'socket'], visibleIf: table },
      { key: 'socket', type: 'select', default: 'e27', options: ['e27', 'e14'], visibleIf: socket },
      { key: 'spider', type: 'select', default: 'separate', options: ['separate', 'joined'], visibleIf: pendant },
      { key: 'spokes', type: 'select', default: '3', options: ['3', '4'], visibleIf: pendant },
      { key: 'socketHoleE27', type: 'number', default: 41, min: 30, max: 50, step: 0.1, unit: 'mm', advanced: true, visibleIf: (p) => socket(p) && p.socket === 'e27' },
      { key: 'socketHoleE14', type: 'number', default: 29, min: 20, max: 40, step: 0.1, unit: 'mm', advanced: true, visibleIf: (p) => socket(p) && p.socket === 'e14' },
      { key: 'socketRoom', type: 'number', default: 45, min: 20, max: 100, step: 1, unit: 'mm', advanced: true, visibleIf: tableSocket },
    ],
  },
  {
    id: 'base',
    params: [
      ...keys(tablePuck, 'baseHeight', 'lampDiameter', 'lampSeatDepth', 'steelDisc', 'discDiameter', 'discDepth', 'discKeepClear'),
      fromBox('baseGroove', table, { default: 4 }),
      { key: 'baseRim', type: 'number', default: 4, min: 2, max: 20, step: 0.5, unit: 'mm', advanced: true, visibleIf: table },
    ],
  },
  {
    id: 'cable',
    params: keys(tablePuck, 'cableMode', 'cableHoleWidth', 'cableHoleLength', 'cableHoleOffset', 'cableChannel', 'cableChannelWidth', 'cableChannelDepth'),
  },
  {
    id: 'text',
    params: [...keys(table, 'baseText', 'baseTextStyle', 'baseTextSize', 'textFont', 'textDepth'), fromBox('textSecondColor', table)],
  },
  {
    // battery tray under a table base with a puck light (as the ball lamp's)
    id: 'power',
    params: [
      ...boxGroups.find((g) => g.id === 'power')!.params.map((d) => fromBox(d.key, tablePuck)),
      ...['magnetDiameter', 'magnetHeight', 'magnetClearance'].map((k) => fromBox(k, tablePuck, { visibleIf: (p) => power(p) && p.powerJoint === 'magnets' })),
      fromBox('pegSize', tablePuck, { visibleIf: (p) => power(p) && p.powerJoint === 'pegs' }),
    ],
  },
  boxGroups.find((g) => g.id === 'print')!,
];

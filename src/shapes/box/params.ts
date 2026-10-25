import { formatParam } from '../../core/format';
import type { ParamGroup, ParamValues } from '../../core/types';
import { FONT_IDS } from '../../geometry/text';

const rect = (p: ParamValues) => p.rectangular === true;
const top = (p: ParamValues) => p.topPanel === true;
const joint = (...j: string[]) => (p: ParamValues) => j.includes(p.lidJoint as string);
// magnet size is shared by the lid and the power base
const magnets = (p: ParamValues) => joint('plugMagnet', 'magnet')(p) || (power(p) && p.powerJoint === 'magnets');
const customCable = (p: ParamValues) => p.cableMode === 'custom';
const channel = (p: ParamValues) => p.cableChannel === true;
const power = (p: ParamValues) => p.powerBase === true;
const disc = (p: ParamValues) => p.steelDisc === true;
const pocket = (p: ParamValues) => power(p) && p.bankPocket === true;
const sw = (...t: string[]) => (p: ParamValues) => power(p) && t.includes(p.switchType as string);
const led = (p: ParamValues) => power(p) && p.ledWindow === true;
const baseText = (p: ParamValues) => String(p.baseText ?? '').trim() !== '';
const topText = (p: ParamValues) => String(p.topText ?? '').trim() !== '';
const anyText = (p: ParamValues) => baseText(p) || topText(p);

export const LID_JOINTS = ['plugMagnet', 'plug', 'magnet', 'latch', 'pegs'];

/**
 * Cable slot presets, scaled to the lamp: the slot runs from inner × radius to
 * outer × radius + extra (mm). For a 64 mm seat: bottom 12.8 to 30 mm, side 16 to 48 mm.
 */
export const CABLE_PRESETS: Record<string, { width: number; inner: number; outer: number; extra: number }> = {
  bottom: { width: 9, inner: 0.4, outer: 0.94, extra: 0 },
  // reaches past the lamp edge so a USB plug at the side of the lamp can drop through
  side: { width: 13, inner: 0.5, outer: 1, extra: 16 },
};

export const boxGroups: ParamGroup[] = [
  {
    id: 'panels',
    params: [
      formatParam,
      { key: 'panelWidth', type: 'number', default: 156, min: 40, max: 300, step: 0.5, unit: 'mm' },
      { key: 'panelHeight', type: 'number', default: 156, min: 40, max: 300, step: 0.5, unit: 'mm' },
      { key: 'rectangular', type: 'bool', default: false },
      { key: 'sideWidth', type: 'number', default: 156, min: 40, max: 300, step: 0.5, unit: 'mm', visibleIf: rect },
      { key: 'panelThickness', type: 'number', default: 3.2, min: 1, max: 8, step: 0.1, unit: 'mm' },
      { key: 'topPanel', type: 'bool', default: true },
      { key: 'slotClearance', type: 'number', default: 0.6, min: 0, max: 1.5, step: 0.05, unit: 'mm', advanced: true },
      { key: 'slotEngage', type: 'number', default: 4, min: 2, max: 10, step: 0.5, unit: 'mm', advanced: true },
    ],
  },
  {
    // how photos become relief; used by src/litho for every shape's panel slots
    id: 'litho',
    step: 'pictures',
    params: [
      { key: 'lithoMinThickness', type: 'number', default: 1, min: 0.3, max: 3, step: 0.1, unit: 'mm', advanced: true },
      { key: 'lithoCurve', type: 'select', default: 'light', options: ['light', 'linear'], advanced: true },
      { key: 'lithoQuality', type: 'select', default: 'normal', options: ['draft', 'normal', 'fine'] },
      // colour pictures print lying flat: no fins
      { key: 'lithoSupports', type: 'bool', default: true, visibleIf: (p) => !p.lithoColour },
      { key: 'lithoSupportSize', type: 'select', default: 'normal', options: ['small', 'normal', 'large'], visibleIf: (p) => !!p.lithoSupports && !p.lithoColour },
      { key: 'lithoMargin', type: 'number', default: 2, min: 1, max: 10, step: 0.5, unit: 'mm', advanced: true },
      // colour lithophanes (src/litho/colour.ts): flat pictures only, see COLOUR_KEYS
      { key: 'lithoColour', type: 'bool', default: false },
      { key: 'colourLayers', type: 'number', default: 7, min: 2, max: 12, step: 1, visibleIf: (p) => !!p.lithoColour },
      { key: 'filamentCyan', type: 'color', default: '#0086d6', advanced: true, visibleIf: (p) => !!p.lithoColour },
      { key: 'filamentMagenta', type: 'color', default: '#ec008c', advanced: true, visibleIf: (p) => !!p.lithoColour },
      { key: 'filamentYellow', type: 'color', default: '#f4ee2a', advanced: true, visibleIf: (p) => !!p.lithoColour },
    ],
  },
  {
    id: 'frame',
    params: [
      { key: 'postSize', type: 'number', default: 14, min: 8, max: 30, step: 0.5, unit: 'mm' },
      { key: 'cornerRadius', type: 'number', default: 3, min: 0, max: 12, step: 0.5, unit: 'mm' },
      { key: 'faceInset', type: 'number', default: 1.5, min: 0.8, max: 6, step: 0.1, unit: 'mm', advanced: true },
    ],
  },
  {
    id: 'base',
    params: [
      { key: 'baseHeight', type: 'number', default: 10, min: 5, max: 60, step: 0.5, unit: 'mm' },
      { key: 'lampDiameter', type: 'number', default: 64, min: 20, max: 200, step: 0.5, unit: 'mm' },
      { key: 'lampSeatDepth', type: 'number', default: 1, min: 0, max: 20, step: 0.5, unit: 'mm' },
      { key: 'steelDisc', type: 'bool', default: false },
      { key: 'discDiameter', type: 'number', default: 30, min: 5, max: 120, step: 0.5, unit: 'mm', visibleIf: disc },
      { key: 'discDepth', type: 'number', default: 1, min: 0.2, max: 5, step: 0.1, unit: 'mm', visibleIf: disc },
      { key: 'discKeepClear', type: 'bool', default: true, visibleIf: disc },
      { key: 'baseGroove', type: 'number', default: 2.5, min: 1, max: 10, step: 0.5, unit: 'mm', advanced: true },
    ],
  },
  {
    id: 'cable',
    params: [
      { key: 'cableMode', type: 'select', default: 'bottom', options: ['bottom', 'side', 'custom'] },
      { key: 'cableHoleWidth', type: 'number', default: 9, min: 3, max: 60, step: 0.5, unit: 'mm', visibleIf: customCable },
      { key: 'cableHoleLength', type: 'number', default: 17, min: 3, max: 120, step: 0.5, unit: 'mm', visibleIf: customCable },
      { key: 'cableHoleOffset', type: 'number', default: 21.5, min: 0, max: 100, step: 0.5, unit: 'mm', visibleIf: customCable },
      { key: 'cableChannel', type: 'bool', default: true },
      { key: 'cableChannelWidth', type: 'number', default: 8, min: 3, max: 30, step: 0.5, unit: 'mm', visibleIf: channel, advanced: true },
      { key: 'cableChannelDepth', type: 'number', default: 5, min: 2, max: 30, step: 0.5, unit: 'mm', visibleIf: channel, advanced: true },
    ],
  },
  {
    id: 'lid',
    params: [
      { key: 'lidJoint', type: 'select', default: 'plugMagnet', options: LID_JOINTS },
      { key: 'lidThickness', type: 'number', default: 6, min: 3, max: 20, step: 0.5, unit: 'mm' },
      { key: 'topLedge', type: 'number', default: 2.5, min: 1.5, max: 20, step: 0.5, unit: 'mm', visibleIf: top },
      { key: 'lidGroove', type: 'number', default: 3, min: 1, max: 8, step: 0.5, unit: 'mm', advanced: true },
      { key: 'plugDepth', type: 'number', default: 4, min: 2, max: 25, step: 0.5, unit: 'mm', visibleIf: joint('plugMagnet', 'plug') },
      { key: 'plugTaper', type: 'number', default: 1, min: 0, max: 10, step: 0.5, unit: 'deg', advanced: true, visibleIf: joint('plugMagnet', 'plug') },
      { key: 'plugClearance', type: 'number', default: 0.15, min: 0, max: 1, step: 0.05, unit: 'mm', visibleIf: joint('plugMagnet', 'plug', 'pegs') },
      { key: 'magnetDiameter', type: 'number', default: 5, min: 2, max: 15, step: 0.5, unit: 'mm', visibleIf: magnets },
      { key: 'magnetHeight', type: 'number', default: 2, min: 1, max: 10, step: 0.5, unit: 'mm', visibleIf: magnets },
      { key: 'magnetClearance', type: 'number', default: 0.15, min: 0, max: 0.6, step: 0.05, unit: 'mm', visibleIf: magnets, advanced: true },
      { key: 'latchLength', type: 'number', default: 10, min: 5, max: 25, step: 0.5, unit: 'mm', visibleIf: joint('latch') },
      { key: 'latchThickness', type: 'number', default: 1.6, min: 0.8, max: 3, step: 0.1, unit: 'mm', visibleIf: joint('latch'), advanced: true },
      { key: 'latchHook', type: 'number', default: 0.8, min: 0.3, max: 2, step: 0.1, unit: 'mm', visibleIf: joint('latch') },
      // pegs hold the lid, the power base, or both
      { key: 'pegSize', type: 'number', default: 3, min: 1.5, max: 6, step: 0.5, unit: 'mm', visibleIf: (p) => joint('pegs')(p) || (power(p) && p.powerJoint === 'pegs') },
    ],
  },
  {
    id: 'text',
    params: [
      { key: 'baseText', type: 'text', default: '', maxLength: 40 },
      { key: 'baseTextStyle', type: 'select', default: 'raised', options: ['raised', 'engraved', 'inlay'], visibleIf: baseText },
      { key: 'baseTextSize', type: 'number', default: 5, min: 2, max: 40, step: 0.5, unit: 'mm', visibleIf: baseText },
      { key: 'topText', type: 'text', default: '', maxLength: 200, multiline: true },
      { key: 'topTextStyle', type: 'select', default: 'engraved', options: ['engraved', 'inlay'], visibleIf: topText },
      { key: 'topTextSize', type: 'number', default: 5, min: 2, max: 60, step: 0.5, unit: 'mm', visibleIf: topText },
      { key: 'textFont', type: 'select', default: 'sans', options: FONT_IDS, visibleIf: anyText },
      { key: 'textDepth', type: 'number', default: 0.6, min: 0.2, max: 3, step: 0.1, unit: 'mm', visibleIf: anyText, advanced: true },
      { key: 'textSecondColor', type: 'bool', default: false, visibleIf: (p) => baseText(p) && p.baseTextStyle === 'raised' },
    ],
  },
  {
    id: 'power',
    params: [
      { key: 'powerBase', type: 'bool', default: false },
      { key: 'powerHeight', type: 'number', default: 22, min: 8, max: 80, step: 0.5, unit: 'mm', visibleIf: power },
      { key: 'powerJoint', type: 'select', default: 'magnets', options: ['magnets', 'pegs', 'none'], visibleIf: power },
      { key: 'chargeSlot', type: 'bool', default: true, visibleIf: power },
      // a fixed spot for one particular power bank
      { key: 'bankPocket', type: 'bool', default: false, visibleIf: power, advanced: true },
      { key: 'bankWidth', type: 'number', default: 75, min: 20, max: 250, step: 0.5, unit: 'mm', visibleIf: pocket, advanced: true },
      { key: 'bankLength', type: 'number', default: 150, min: 20, max: 280, step: 0.5, unit: 'mm', visibleIf: pocket, advanced: true },
      { key: 'bankClearance', type: 'number', default: 1, min: 0, max: 5, step: 0.5, unit: 'mm', visibleIf: pocket, advanced: true },
      { key: 'switchType', type: 'select', default: 'none', options: ['none', 'rocker', 'slide', 'round'], visibleIf: power, advanced: true },
      { key: 'switchWidth', type: 'number', default: 19, min: 4, max: 40, step: 0.5, unit: 'mm', visibleIf: sw('rocker'), advanced: true },
      { key: 'switchHeight', type: 'number', default: 13, min: 3, max: 30, step: 0.5, unit: 'mm', visibleIf: sw('rocker'), advanced: true },
      { key: 'slideWidth', type: 'number', default: 12, min: 4, max: 40, step: 0.5, unit: 'mm', visibleIf: sw('slide'), advanced: true },
      { key: 'slideHeight', type: 'number', default: 6, min: 2, max: 20, step: 0.5, unit: 'mm', visibleIf: sw('slide'), advanced: true },
      { key: 'slideScrewPitch', type: 'number', default: 15, min: 0, max: 40, step: 0.5, unit: 'mm', visibleIf: sw('slide'), advanced: true },
      { key: 'buttonDiameter', type: 'number', default: 12, min: 4, max: 30, step: 0.5, unit: 'mm', visibleIf: sw('round'), advanced: true },
      { key: 'switchOffset', type: 'number', default: 40, min: -120, max: 120, step: 1, unit: 'mm', visibleIf: sw('rocker', 'slide', 'round'), advanced: true },
      { key: 'ledWindow', type: 'bool', default: false, visibleIf: power, advanced: true },
      { key: 'ledWindowWidth', type: 'number', default: 30, min: 5, max: 150, step: 1, unit: 'mm', visibleIf: led, advanced: true },
      { key: 'ledWindowHeight', type: 'number', default: 6, min: 2, max: 30, step: 0.5, unit: 'mm', visibleIf: led, advanced: true },
      { key: 'ledWindowOffset', type: 'number', default: 0, min: -120, max: 120, step: 1, unit: 'mm', visibleIf: led, advanced: true },
    ],
  },
  {
    id: 'print',
    params: [{ key: 'bedSize', type: 'number', default: 256, min: 100, max: 600, step: 1, unit: 'mm' }],
  },
];

/** The colour settings: left out by shapes whose pictures are curved (they cannot print flat). */
export const COLOUR_KEYS = ['lithoColour', 'colourLayers', 'filamentCyan', 'filamentMagenta', 'filamentYellow'];

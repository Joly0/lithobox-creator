import { formatParam } from '../../core/format';
import type { ParamGroup, ParamValues } from '../../core/types';
import { boxGroups } from '../box/params';
import { clearanceGroup, fromBox, keys } from '../common/params';

/** How the picture is lit; an LED strip frame comes later. */
export const LIGHTING = ['box', 'stand', 'plain', 'frame'];

/** A slim frame round the picture with an LED strip round its inside, behind the picture. */
export const lightFrame = (p: ParamValues) => p.lighting === 'frame';

export const lightBox = (p: ParamValues) => p.lighting === 'box';
/** Open stand: a foot with the picture at the front and an upright puck light holder behind it. */
export const lightStand = (p: ParamValues) => p.lighting === 'stand';
const withLamp = (p: ParamValues) => lightBox(p) || lightStand(p);
/** Every lighting but the picture on its own holds the picture in a groove or a frame. */
const pictureHeld = (p: ParamValues) => p.lighting !== 'plain';

export const panelGroups: ParamGroup[] = [
  {
    id: 'panels',
    params: [
      formatParam,
      { key: 'panelWidth', type: 'number', default: 150, min: 40, max: 300, step: 0.5, unit: 'mm' },
      { key: 'panelHeight', type: 'number', default: 150, min: 40, max: 300, step: 0.5, unit: 'mm' },
      { key: 'panelThickness', type: 'number', default: 3.2, min: 1, max: 8, step: 0.1, unit: 'mm' },
      fromBox('slotEngage', lightBox),
    ],
  },
  // play between the parts this shape has
  clearanceGroup({ slotClearance: pictureHeld, slotWidthClearance: pictureHeld, plugClearance: lightBox, magnetClearance: withLamp, bankClearance: withLamp, powerTrayClearance: withLamp, discClearance: withLamp, holderClearance: lightStand, hoodClearance: lightBox, frameClearance: lightFrame }),
  boxGroups.find((g) => g.id === 'litho')!,
  {
    id: 'light',
    params: [
      { key: 'lighting', type: 'select', default: 'box', options: LIGHTING },
      // the picture on its own can hang: a loop on top (the box's loop settings)
      { key: 'loop', type: 'bool', default: false, visibleIf: (p) => p.lighting === 'plain' },
      { key: 'loopHole', type: 'number', default: 5, min: 2, max: 12, step: 0.5, unit: 'mm', visibleIf: (p) => p.lighting === 'plain' && p.loop === true },
      { key: 'lightDepth', type: 'number', default: 70, min: 30, max: 200, step: 1, unit: 'mm', visibleIf: lightBox },
      { key: 'lampDistance', type: 'number', default: 40, min: 10, max: 150, step: 1, unit: 'mm', visibleIf: lightStand },
      { key: 'holderDepth', type: 'number', default: 8, min: 2, max: 30, step: 0.5, unit: 'mm', visibleIf: lightStand },
      { key: 'wallThickness', type: 'number', default: 2.4, min: 1.2, max: 6, step: 0.2, unit: 'mm', visibleIf: withLamp, advanced: true },
      { key: 'frameDepth', type: 'number', default: 25, min: 15, max: 60, step: 1, unit: 'mm', visibleIf: lightFrame },
      { key: 'frameRim', type: 'number', default: 8, min: 5, max: 30, step: 0.5, unit: 'mm', visibleIf: lightFrame },
      { key: 'stripWidth', type: 'number', default: 10, min: 4, max: 20, step: 0.5, unit: 'mm', visibleIf: lightFrame },
      { key: 'frameKeyholes', type: 'bool', default: true, visibleIf: lightFrame },
      { key: 'frameFoot', type: 'bool', default: true, visibleIf: lightFrame },
    ],
  },
  { id: 'frame', params: [fromBox('postSize', lightBox, { default: 12 }), ...keys(withLamp, 'cornerRadius', 'faceInset')] },
  {
    id: 'base',
    params: [
      ...keys(withLamp, 'baseHeight', 'lampDiameter'),
      fromBox('lampSeatDepth', lightBox),
      ...keys(withLamp, 'steelDisc', 'discDiameter', 'discDepth'),
      fromBox('discKeepClear', lightBox),
      fromBox('baseGroove', withLamp),
    ],
  },
  {
    id: 'cable',
    params: keys(lightBox, 'cableMode', 'cableHoleWidth', 'cableHoleLength', 'cableHoleOffset', 'cableChannel', 'cableChannelWidth', 'cableChannelDepth'),
  },
  // the hood closes on the base with the box lid's closures; the hood has its own top plate
  {
    id: 'lid',
    params: boxGroups
      .find((g) => g.id === 'lid')!
      .params.filter((d) => !['lidThickness', 'topLedge', 'lidGroove'].includes(d.key))
      // the magnets and pegs also join the battery tray under the stand's foot
      .map((d) => fromBox(d.key, ['magnetDiameter', 'magnetHeight', 'pegSize'].includes(d.key) ? withLamp : lightBox)),
  },
  { id: 'text', params: keys(withLamp, 'baseText', 'baseTextStyle', 'baseTextSize', 'textFont', 'textDepth', 'textSecondColor') },
  // battery tray under the light box, as under the box
  // battery tray under the light box or the open stand's foot
  { id: 'power', params: boxGroups.find((g) => g.id === 'power')!.params.map((d) => fromBox(d.key, (p) => lightBox(p) || lightStand(p))) },
  boxGroups.find((g) => g.id === 'print')!,
];

// Ornament: a small flat lithophane cut to an outline (circle, star, hexagon, heart) with a loop
// on top to hang it by a ribbon. It prints lying flat, picture side up, in one piece with its
// loop (the loop is a second volume of the lithophane's slicer object).
//
// Model space: millimetres, Z up, the ornament standing upright facing -Y, its bottom on z = 0.
import { bool, num, round, type ShapeDefinition, str } from '../../core/shape';
import type { BuildResult, Message, PanelSlot, ParamGroup, PartOutput } from '../../core/types';
import { toMeshData } from '../../geometry/kernel';
import { outlinePoints } from '../../litho/mesh';
import { boxGroups } from '../box/params';
import { roundSlotMatrix } from '../common/base';
import { fromBox } from '../common/params';
import { hangingLoop, loopAnchor, loopWidth, outlineFor, outlineSize, OUTLINES } from '../common/outlines';

const COLORS = { litho: '#f4ead7', panel: '#fff4dc' };
const loop = (p: Record<string, unknown>) => p.loop === true;
const litho = boxGroups.find((g) => g.id === 'litho')!;

export const ornamentGroups: ParamGroup[] = [
  {
    id: 'panels',
    params: [
      { key: 'outline', type: 'select', default: 'circle', options: OUTLINES },
      { key: 'ornamentSize', type: 'number', default: 80, min: 30, max: 200, step: 1, unit: 'mm' },
      fromBox('panelThickness', () => true, { default: 2.8 }),
      { key: 'loop', type: 'bool', default: true },
      { key: 'loopHole', type: 'number', default: 5, min: 2, max: 12, step: 0.5, unit: 'mm', visibleIf: loop },
    ],
  },
  // it prints lying flat: no support fins
  { ...litho, params: litho.params.filter((d) => d.key !== 'lithoSupports' && d.key !== 'lithoSupportSize') },
  boxGroups.find((g) => g.id === 'print')!,
];

export const ornamentShape: ShapeDefinition = {
  id: 'ornament',
  groups: ornamentGroups,
  presets: [
    { id: 'ball', values: { outline: 'circle', ornamentSize: 60 } },
    { id: 'star', values: { outline: 'star', ornamentSize: 80 } },
    { id: 'heart', values: { outline: 'heart', ornamentSize: 70 } },
  ],
  validate: () => [],
  build(k, p): BuildResult {
    const o = outlineFor(str(p, 'outline'), num(p, 'ornamentSize'));
    const [w, h] = outlineSize(o);
    const T = num(p, 'panelThickness');
    const matrix = roundSlotMatrix(h / 2);
    const slot: PanelSlot = { id: 'picture', width: w, height: h, thickness: T, matrix, outline: o, explode: [0, 0, 0] };
    const pts = outlinePoints(o);
    const parts: PartOutput[] = [];
    // the stand-in until a photo is placed: the outline, plain
    const stand = new k.CrossSection([pts]).extrude(T).translate([0, 0, -T / 2]);
    parts.push({ id: 'panel-picture', mesh: toMeshData(stand), matrix, color: COLORS.panel, explode: [0, 0, 0], printRotation: [0, 0, 0], preview: true, ghost: true });
    let top = h;
    if (bool(p, 'loop')) {
      // into the margin only, never over the picture
      const margin = typeof p.lithoMargin === 'number' ? p.lithoMargin : 2;
      const ring = hangingLoop(k, loopAnchor(o, pts, loopWidth(num(p, 'loopHole'))), T, num(p, 'loopHole'), margin, pts);
      top = h / 2 + ring.boundingBox().max[1];
      // printed with the picture, in its panel space, as one object
      parts.push({ id: 'loop', object: 'litho-picture', mesh: toMeshData(ring), matrix, color: COLORS.litho, explode: [0, 0, 0], printRotation: [0, 0, 0] });
    }
    const info: Message[] = [
      { key: 'info.outer', vars: { x: round(w), y: round(T), z: round(top) } },
      { key: 'info.ornament', vars: { w: round(w), h: round(h), t: T } },
    ];
    return { parts, slots: [slot], warnings: [], info };
  },
};

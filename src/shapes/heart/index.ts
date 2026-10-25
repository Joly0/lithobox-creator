// Heart: a heart-shaped lithophane standing in front of a light (the flat picture's open stand:
// a foot with a groove and a puck light behind it), or on its own with a loop to hang it. Its
// point is cut flat so it stands in the foot's groove. It prints lying flat, picture side up.
//
// Built as the flat picture (src/shapes/panel) with a heart outline on its picture slot.
import { bool, num, type ShapeDefinition } from '../../core/shape';
import type { BuildResult, ParamDef, ParamGroup, ParamValues, PartOutput } from '../../core/types';
import { toMeshData } from '../../geometry/kernel';
import { outlinePoints } from '../../litho/mesh';
import { hangingLoop, heartPoints, loopAnchor, loopWidth } from '../common/outlines';
import { panelShape } from '../panel';
import { panelGroups } from '../panel/params';

const COLORS = { litho: '#f4ead7', panel: '#fff4dc' };

/** The flat picture's settings: only the stand and the plain heart (a light box does not suit a heart). */
export const heartGroups: ParamGroup[] = panelGroups.map((g) => {
  if (g.id === 'panels')
    return {
      ...g,
      params: [
        ...g.params.map((d) => (d.key === 'panelWidth' ? { ...d, default: 120 } : d.key === 'panelHeight' ? { ...d, default: 110 } : d) as ParamDef),
        { key: 'heartFlat', type: 'number', default: 25, min: 0, max: 80, step: 1, unit: 'mm' },
      ],
    };
  if (g.id === 'light')
    return {
      ...g,
      params: g.params.map(
        (d) => (d.key === 'lighting' && d.type === 'select' ? { ...d, default: 'stand', options: ['stand', 'plain'] } : d.key === 'loop' ? { ...d, default: true } : d) as ParamDef,
      ),
    };
  return g;
});

/** The heart's outline in the picture slot (W × H, flat at the bottom). */
const heartOf = (p: ParamValues) => heartPoints(num(p, 'panelWidth'), num(p, 'panelHeight'), num(p, 'heartFlat'));

export const heartShape: ShapeDefinition = {
  id: 'heart',
  groups: heartGroups,
  presets: [
    { id: 'small', values: { panelWidth: 90, panelHeight: 82 } },
    { id: 'medium', values: { panelWidth: 120, panelHeight: 110 } },
    { id: 'large', values: { panelWidth: 160, panelHeight: 146 } },
  ],
  validate: (p) => panelShape.validate?.(p) ?? [],
  prepare: async (p) => {
    await panelShape.prepare?.(p);
  },
  build(k, p): BuildResult {
    // the flat picture without its own loop (the heart's goes on its top edge, beside the dip)
    const r = panelShape.build(k, { ...p, loop: false });
    const slot = r.slots[0];
    const pts = heartOf(p);
    slot.outline = { radius: Math.max(slot.width, slot.height) / 2, cy: 0, points: pts };
    // the stand-in: the heart, plain, placed by the slot
    const T = slot.thickness;
    const heart = new k.CrossSection([pts]).extrude(T).translate([0, 0, -T / 2]);
    const i = r.parts.findIndex((x) => x.id === 'panel-front');
    const stand: PartOutput = { id: 'panel-front', mesh: toMeshData(heart), matrix: slot.matrix, color: COLORS.panel, explode: r.parts[i]?.explode ?? [0, 0, 0], printRotation: [0, 0, 0], preview: true, ghost: true };
    if (i >= 0) r.parts[i] = stand;
    else r.parts.push(stand);
    if (p.lighting === 'plain' && bool(p, 'loop')) {
      const o = slot.outline;
      const ring = hangingLoop(k, loopAnchor(o, outlinePoints(o), loopWidth(num(p, 'loopHole'))), T, num(p, 'loopHole'));
      // printed with the heart, lying flat like it, as one object
      r.parts.push({ id: 'loop', object: 'litho-front', mesh: toMeshData(ring), matrix: slot.matrix, color: COLORS.litho, explode: [0, 0, 0], printRotation: [0, 0, 0] });
    }
    return r;
  },
};

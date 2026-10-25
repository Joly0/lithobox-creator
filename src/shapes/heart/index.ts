// Heart: a heart-shaped lithophane standing in front of a light (a foot with a groove and a
// puck light behind it, on a stand or lying flat in the foot), or on its own with a loop to
// hang it. Its point is cut flat so it stands in the foot's groove. It prints lying flat,
// picture side up.
//
// Built as the flat picture (src/shapes/panel) with a heart outline on its picture slot.
import { bool, num, str, type ShapeDefinition } from '../../core/shape';
import type { BuildResult, ParamDef, ParamGroup, ParamValues, PartOutput } from '../../core/types';
import { toMeshData } from '../../geometry/kernel';
import { ensureFont } from '../../geometry/text';
import { outlinePoints } from '../../litho/mesh';
import { hangingLoop, heartPoints, loopAnchor, loopWidth } from '../common/outlines';
import { panelShape } from '../panel';
import { seatLayout } from '../panel/layout';
import { lightStand, panelGroups } from '../panel/params';
import { buildSeatBase } from '../panel/seat';
import { buildStand } from '../panel/stand';

const COLORS = { litho: '#f4ead7', panel: '#fff4dc' };

/**
 * The open foot uses the base settings of the light box and the stand: with it, such a setting
 * shows when it would for either of them (so its own conditions, a toggle above it, still hold).
 */
const baseLight = (p: ParamValues) => p.lighting === 'base';
const BASE_GROUPS = new Set(['base', 'cable', 'text', 'power', 'clearances']);
const BASE_KEYS = new Set(['cornerRadius', 'faceInset']);
// the stand's holder, the light box's hood and the frame's insert are not on the open foot
const NOT_ON_BASE = new Set(['holderClearance', 'hoodClearance', 'frameClearance']);
const withBase = (d: ParamDef): ParamDef => {
  const vis = d.visibleIf;
  if (!vis || NOT_ON_BASE.has(d.key)) return d;
  return { ...d, visibleIf: (p) => vis(p) || (baseLight(p) && (vis({ ...p, lighting: 'box' }) || vis({ ...p, lighting: 'stand' }))) } as ParamDef;
};

/** The flat picture's settings: only the stand, the open foot and the plain heart (a light box does not suit a heart). */
export const heartGroups: ParamGroup[] = panelGroups.map((g) => {
  if (g.id === 'panels')
    return {
      ...g,
      params: [
        // a heart-shaped picture has no photo format
        ...g.params.filter((d) => d.key !== 'picFormat').map((d) => (d.key === 'panelWidth' ? { ...d, default: 120 } : d.key === 'panelHeight' ? { ...d, default: 110 } : d) as ParamDef),
        { key: 'heartFlat', type: 'number', default: 25, min: 0, max: 80, step: 1, unit: 'mm' },
      ],
    };
  if (g.id === 'light')
    return {
      ...g,
      params: g.params.map(
        (d) => (d.key === 'lighting' && d.type === 'select' ? { ...d, default: 'stand', options: ['stand', 'base', 'plain'] } : d.key === 'loop' ? { ...d, default: true } : d) as ParamDef,
      ),
    };
  return { ...g, params: g.params.map((d) => (BASE_GROUPS.has(g.id) || BASE_KEYS.has(d.key) ? withBase(d) : d)) };
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
  validate: (p) => (baseLight(p) ? seatLayout(p).warnings : panelShape.validate?.(p) ?? []),
  prepare: async (p) => {
    await panelShape.prepare?.(p);
    if (baseLight(p) && str(p, 'baseText').trim()) await ensureFont(str(p, 'textFont'));
  },
  build(k, p): BuildResult {
    // the flat picture without its own loop (the heart's goes on its top edge, beside the dip)
    const pts = heartOf(p);
    // on the stand or the foot it goes in a groove of its own shape, not one as wide as the heart
    const info = { key: 'info.panel', vars: { w: num(p, 'panelWidth'), h: num(p, 'panelHeight'), t: num(p, 'panelThickness') } };
    const r = p.lighting === 'base' ? buildSeatBase(k, p, info, pts) : lightStand(p) ? buildStand(k, p, info, pts) : panelShape.build(k, { ...p, loop: false });
    const slot = r.slots[0];
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
      const pts = outlinePoints(o);
      // into the margin only, never over the picture
      const margin = typeof p.lithoMargin === 'number' ? p.lithoMargin : 2;
      const ring = hangingLoop(k, loopAnchor(o, pts, loopWidth(num(p, 'loopHole'))), T, num(p, 'loopHole'), margin, pts);
      // printed with the heart, lying flat like it, as one object
      r.parts.push({ id: 'loop', object: 'litho-front', mesh: toMeshData(ring), matrix: slot.matrix, color: COLORS.litho, explode: [0, 0, 0], printRotation: [0, 0, 0] });
    }
    return r;
  },
};

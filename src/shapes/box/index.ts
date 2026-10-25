// Lithophane box: a body (base plate + four corner posts, printed as one), a
// lid and an optional power base underneath. Panels slide into slots in the
// posts and stand in grooves in the base. The lid closes with one of several
// joints (see LID_JOINTS).
import { bool, num, round, type ShapeDefinition, str } from '../../core/shape';
import type { BuildResult, Message, PanelSlot, ParamValues, PartOutput, Vec3 } from '../../core/types';
import { box, prism, roundedRect, toMeshData, type Kernel, type Manifold } from '../../geometry/kernel';
import { ensureFont } from '../../geometry/text';
import { cableCuts, fitText, frontText, lampCuts, puckLamp, slotMatrix } from '../common/base';
import { applyLidJoint, jointGeometry, type JointGeometry } from '../common/lid';
import { powerUnderside, pushPowerInfo, rectTray } from '../common/power';
import { boxLayout, type BoxLayout } from './layout';
import { boxGroups } from './params';

const COLORS = { body: '#c9ccd3', lid: '#e9a23b', power: '#9aa3b5', panel: '#fff4dc', lamp: '#8fb7ff', text: '#3b4150' };

/** The four post corners as sign pairs. */
const CORNERS: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];

function panelEnvelopes(k: Kernel, L: BoxLayout, extraTop: number): Manifold[] {
  const g = L.gap;
  const z0 = L.panelBottom - g;
  const z1 = L.panelTop + extraTop;
  const out: Manifold[] = [];
  for (const s of [1, -1]) {
    out.push(box(k, [-L.panelW / 2 - g, s * L.planeY - L.thick / 2 - g, z0], [L.panelW / 2 + g, s * L.planeY + L.thick / 2 + g, z1]));
    out.push(box(k, [s * L.planeX - L.thick / 2 - g, -L.panelD / 2 - g, z0], [s * L.planeX + L.thick / 2 + g, L.panelD / 2 + g, z1]));
  }
  return out;
}

/** The closure's sockets (one per post) and latch faces (the posts' ±X faces). */
function boxJoint(k: Kernel, p: ParamValues, L: BoxLayout): JointGeometry {
  const sockets = CORNERS.map(([sx, sy]) => ({ x: sx * L.socketCx, y: sy * L.socketCy, rot: 0 }));
  const latches = CORNERS.map(([sx, sy]) => ({ x: (sx * L.outerX) / 2, y: sy * L.latchCy, nx: sx, ny: 0 }));
  return jointGeometry(k, p, L, sockets, latches);
}

// ------------------------------------------------------------------ parts

function buildBody(k: Kernel, p: ParamValues, L: BoxLayout, joint: JointGeometry): Manifold {
  const r = num(p, 'cornerRadius');
  const footprint = roundedRect(k, L.outerX, L.outerY, r);
  const base = prism(footprint, 0, L.baseTop);

  // Posts: corner squares of the rounded footprint, from the base top to the lid.
  const tall = prism(footprint, L.baseTop - 0.01, L.lidBottom);
  const posts = CORNERS.map(([sx, sy]) => {
    const x0 = sx > 0 ? L.outerX / 2 - L.post : -L.outerX / 2 - 1;
    const y0 = sy > 0 ? L.outerY / 2 - L.post : -L.outerY / 2 - 1;
    return tall.intersect(box(k, [x0, y0, -1], [x0 + L.post + 1, y0 + L.post + 1, L.lidBottom + 1]));
  });
  let body = k.Manifold.union([base, ...posts, ...joint.bodyAdds]);

  const cuts: Manifold[] = [...panelEnvelopes(k, L, 1), ...joint.bodyCuts];

  cuts.push(...lampCuts(k, p, 0, L.baseTop));
  // cable hole through the base, plus an optional channel underneath to the back edge
  cuts.push(...cableCuts(k, p, L.cable, 0, L.baseTop, L.outerY / 2));
  // underside: magnets or peg holes matching the power base's corner pillars
  if (L.power) cuts.push(...powerUnderside(k, p, L.power));
  body = body.subtract(k.Manifold.union(cuts));
  return body;
}

function buildLid(k: Kernel, p: ParamValues, L: BoxLayout, joint: JointGeometry): Manifold {
  const r = num(p, 'cornerRadius');
  let lid = prism(roundedRect(k, L.outerX, L.outerY, r), L.lidBottom, L.lidTop);
  const cuts: Manifold[] = panelEnvelopes(k, L, L.gap + 0.3);
  if (bool(p, 'topPanel')) {
    const g = L.gap;
    const rebateZ = L.lidTop - (L.thick + 0.2);
    cuts.push(box(k, [-L.topW / 2 - g, -L.topD / 2 - g, rebateZ], [L.topW / 2 + g, L.topD / 2 + g, L.lidTop + 1]));
    const ledge = num(p, 'topLedge');
    cuts.push(prism(roundedRect(k, L.topW - 2 * ledge, L.topD - 2 * ledge, 1), L.lidBottom - 1, L.lidTop + 1));
  }
  lid = lid.subtract(k.Manifold.union(cuts));
  lid = applyLidJoint(k, lid, joint);
  return lid;
}

// ------------------------------------------------------------------ text

type Target = 'body' | 'lid' | 'power';

interface TextGeometry {
  adds: Partial<Record<Target, Manifold>>;
  cuts: Partial<Record<Target, Manifold>>;
  /** Text that becomes its own volume (second filament) of the target object. */
  volumes: { id: string; target: Target; solid: Manifold }[];
  warnings: Message[];
}

function textGeometry(k: Kernel, p: ParamValues, L: BoxLayout): TextGeometry {
  const g: TextGeometry = { adds: {}, cuts: {}, volumes: [], warnings: [] };
  const d = num(p, 'textDepth');
  const r = num(p, 'cornerRadius');

  // --- front of the base (or of the power base, which then is the front)
  const baseText = str(p, 'baseText').trim();
  if (baseText) {
    const P = L.power;
    const target: Target = P ? 'power' : 'body';
    const y0 = P ? -P.outerY / 2 : -L.outerY / 2;
    const width = P ? P.outerX : L.outerX;
    const zc = P ? P.seat - P.height + P.floor + P.inner / 2 : L.baseTop / 2;
    const maxH = P ? P.inner - 4 : L.baseTop - 2;
    const t = frontText(k, p, y0, zc, width - 2 * r - 8, maxH);
    if (t) {
      if (t.shrunk) g.warnings.push({ key: 'warn.textShrunkBase' });
      if (t.add) g.adds[target] = t.add;
      if (t.cut) g.cuts[target] = t.cut;
      if (t.volume) g.volumes.push({ id: 'text-base', target, solid: t.volume });
      if (P) {
        // switch and LED window sit at the same height as the text: check the x ranges
        const b = (t.add ?? t.cut ?? t.volume)!.boundingBox();
        const half = (b.max[0] - b.min[0]) / 2 + 1;
        const ranges: [number, number][] = [];
        if (P.switch) ranges.push([P.switch.x, Math.max(P.switch.w, num(p, 'slideScrewPitch') + 3) / 2 + 2]);
        if (bool(p, 'ledWindow')) ranges.push([num(p, 'ledWindowOffset'), num(p, 'ledWindowWidth') / 2]);
        if (ranges.some(([x, h]) => Math.abs(x) < half + h)) g.warnings.push({ key: 'warn.textPower' });
      }
    }
  }

  // --- top of the lid: the front rim around the top lithophane, or the whole lid
  const topText = str(p, 'topText').trim();
  if (topText) {
    let cy = 0, maxW = L.outerX - 2 * r - 12, maxH = L.outerY - 2 * r - 12;
    if (bool(p, 'topPanel')) {
      const inner = L.topD / 2 + L.gap + 1;
      cy = -(L.outerY / 2 + inner) / 2;
      maxH = L.outerY / 2 - inner - 1.5;
      maxW = L.topW;
    }
    const t = fitText(k, p, topText, num(p, 'topTextSize'), maxW, maxH);
    if (t) {
      if (t.shrunk) g.warnings.push({ key: 'warn.textShrunkTop' });
      const solid = (z0: number, z1: number) => t.cs.translate([0, cy]).extrude(z1 - z0).translate([0, 0, L.lidTop + z0]);
      g.cuts.lid = solid(-d, 1);
      if (str(p, 'topTextStyle') === 'inlay') g.volumes.push({ id: 'text-top', target: 'lid', solid: solid(-d, 0) });
    }
  }
  return g;
}

function applyText(m: Manifold, g: TextGeometry, target: Target): Manifold {
  if (g.cuts[target]) m = m.subtract(g.cuts[target]!);
  if (g.adds[target]) m = m.add(g.adds[target]!);
  return m;
}

// ------------------------------------------------------------------ slots + previews

function panelSlots(L: BoxLayout, top: boolean): PanelSlot[] {
  const zc = (L.panelBottom + L.panelTop) / 2;
  const slots: PanelSlot[] = [
    { id: 'front', width: L.panelW, height: L.panelH, thickness: L.thick, matrix: slotMatrix([0, -L.planeY, zc], [1, 0, 0], [0, 0, 1], [0, -1, 0]) },
    { id: 'right', width: L.panelD, height: L.panelH, thickness: L.thick, matrix: slotMatrix([L.planeX, 0, zc], [0, 1, 0], [0, 0, 1], [1, 0, 0]) },
    { id: 'back', width: L.panelW, height: L.panelH, thickness: L.thick, matrix: slotMatrix([0, L.planeY, zc], [-1, 0, 0], [0, 0, 1], [0, 1, 0]) },
    { id: 'left', width: L.panelD, height: L.panelH, thickness: L.thick, matrix: slotMatrix([-L.planeX, 0, zc], [0, -1, 0], [0, 0, 1], [-1, 0, 0]) },
  ];
  if (top)
    slots.push({ id: 'top', width: L.topW, height: L.topD, thickness: L.thick, matrix: slotMatrix([0, 0, L.lidTop - 0.2 - L.thick / 2], [1, 0, 0], [0, 1, 0], [0, 0, 1]) });
  return slots;
}

function previewParts(k: Kernel, p: ParamValues, L: BoxLayout, slots: PanelSlot[]): PartOutput[] {
  const parts: PartOutput[] = [];
  for (const s of slots) {
    const m = s.matrix;
    const size: Vec3 = [s.width, s.height, s.thickness];
    // slots are axis-aligned, so the slot axes map directly to a box
    const ext: Vec3 = [0, 0, 0];
    for (let a = 0; a < 3; a++) for (let ax = 0; ax < 3; ax++) ext[a] += (Math.abs(m[ax * 4 + a]) * size[ax]) / 2;
    const c: Vec3 = [m[12], m[13], m[14]];
    const solid = box(k, [c[0] - ext[0], c[1] - ext[1], c[2] - ext[2]], [c[0] + ext[0], c[1] + ext[1], c[2] + ext[2]]);
    const out: Vec3 = [m[8] * 70, m[9] * 70, s.id === 'top' ? 110 : 0];
    parts.push({ id: `panel-${s.id}`, mesh: toMeshData(solid), color: COLORS.panel, explode: out, printRotation: [0, 0, 0], preview: true, ghost: true });
  }
  parts.push(puckLamp(k, p, 0, L.baseTop));
  return parts;
}

export const boxShape: ShapeDefinition = {
  id: 'box',
  groups: boxGroups,
  // box size = lithophane + 2 × (post − slot depth) = lithophane + 20 mm with the default posts
  presets: [
    { id: 'mini', values: { panelWidth: 50, panelHeight: 50, rectangular: false, panelThickness: 3.2, lampDiameter: 40 } },
    { id: 'small', values: { panelWidth: 100, panelHeight: 100, rectangular: false, panelThickness: 3.2, lampDiameter: 64 } },
    { id: 'large', values: { panelWidth: 156, panelHeight: 156, rectangular: false, panelThickness: 3.2, lampDiameter: 64 } },
    { id: 'xl', values: { panelWidth: 190, panelHeight: 190, rectangular: false, panelThickness: 3.2, lampDiameter: 64 } },
  ],
  validate: (p) => boxLayout(p).warnings,
  async prepare(p) {
    if (str(p, 'baseText').trim() || str(p, 'topText').trim()) await ensureFont(str(p, 'textFont'));
  },
  build(k, p): BuildResult {
    const L = boxLayout(p);
    const joint = boxJoint(k, p, L);
    const text = textGeometry(k, p, L);
    const parts: PartOutput[] = [
      { id: 'body', mesh: toMeshData(applyText(buildBody(k, p, L, joint), text, 'body')), color: COLORS.body, explode: [0, 0, 0], printRotation: [0, 0, 0] },
      { id: 'lid', mesh: toMeshData(applyText(buildLid(k, p, L, joint), text, 'lid')), color: COLORS.lid, explode: [0, 0, 130], printRotation: [180, 0, 0],
        // solid lid like the original recommends: infill patterns would cast shadows
        slicer: { sparse_infill_density: '100%' } },
    ];
    if (L.power) parts.push({ id: 'power', mesh: toMeshData(applyText(rectTray(k, p, L.outerX, L.outerY, L.power), text, 'power')), color: COLORS.power, explode: [0, 0, -70], printRotation: [0, 0, 0] });
    for (const v of text.volumes) {
      const host = parts.find((x) => x.id === v.target)!;
      parts.push({ id: v.id, object: v.target, extruder: 2, mesh: toMeshData(v.solid), color: COLORS.text, explode: host.explode, printRotation: host.printRotation });
    }
    const slots = panelSlots(L, bool(p, 'topPanel'));
    parts.push(...previewParts(k, p, L, slots));

    const height = L.totalHeight + (L.power ? L.power.height - L.power.seat : 0);
    const info: Message[] = [
      { key: 'info.outer', vars: { x: round(L.power?.outerX ?? L.outerX), y: round(L.power?.outerY ?? L.outerY), z: round(height) } },
      { key: 'info.panels', vars: { w: L.panelW, d: L.panelD, h: L.panelH, t: L.thick } },
    ];
    if (bool(p, 'topPanel')) info.push({ key: 'info.top', vars: { w: L.topW, d: L.topD, t: L.thick } });
    if (L.magnetsFit) info.push({ key: 'info.magnets', vars: { n: 8, d: num(p, 'magnetDiameter'), h: num(p, 'magnetHeight') } });
    pushPowerInfo(info, L.power, p);
    return { parts, slots, warnings: [...L.warnings, ...text.warnings], info };
  },
};

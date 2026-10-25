// Cylinder lamp: one lithophane that runs all the way round, standing in a ring groove in a
// round base (lamp seat, steel disc, cable, like the box's base) or on its own. An optional
// ring on top stiffens the upper edge and covers it; it is open in the middle.
//
// Model space: millimetres, Z up, the cylinder's axis on x = y = 0, standing on z = 0, the
// picture's middle facing -Y.
import { bool, num, round, type ShapeDefinition, str } from '../../core/shape';
import type { BuildResult, Message, PanelSlot, ParamValues, PartOutput } from '../../core/types';
import { cylinder, toMeshData, type Kernel, type Manifold } from '../../geometry/kernel';
import { annulus, applyFrontText, cableCuts, cableSlot, type CableSlot, curvedText, lampCuts, lidText, puckLamp, ringText, roundSlotMatrix } from '../common/base';
import { ensureFont } from '../../geometry/text';
import { PILLAR, POWER_FIT, POWER_LEDGE, POWER_WALL, powerLayout, type PowerLayout, powerTextZ, powerUnderside, pushPowerInfo, roundTray } from '../common/power';
import { cylinderGroups, withBase } from './params';

const COLORS = { base: '#c9ccd3', power: '#9aa3b5', ring: '#e9a23b', panel: '#fff4dc', lamp: '#8fb7ff', text: '#3b4150' };
/** Text runs along at most this much of the way round (radians): readable from the front. */
const TEXT_ARC = (2 * Math.PI) / 3;

/** Top ring: plate above the cylinder's edge, and how far it reaches in over the edge. */
const TOP = 2;
const LIP = 2;
/** Wall between the top picture's rebate and the cylinder's groove. */
const WALL = 1.2;

export interface CylinderLayout {
  /** Outside and inside (back) radius of the lithophane at full thickness. */
  rOut: number;
  rIn: number;
  /** Radius of the base and the top ring. */
  rBase: number;
  thick: number;
  gap: number;
  groove: number;
  /** Circumference the picture runs round (at half the thickness). */
  width: number;
  height: number;
  /** 0 without a base. */
  baseTop: number;
  panelBottom: number;
  panelTop: number;
  top: number;
  /** Round picture in the top ring: its radius; 0 = none. */
  topR: number;
  cable: CableSlot | null;
  /** Round battery tray under the base. */
  power: PowerLayout | null;
  warnings: Message[];
}

export function cylinderLayout(p: ParamValues): CylinderLayout {
  const warnings: Message[] = [];
  const thick = num(p, 'panelThickness');
  const rOut = num(p, 'cylDiameter') / 2;
  const rIn = rOut - thick;
  const gap = num(p, 'slotClearance') / 2;
  const groove = num(p, 'baseGroove');
  const rBase = rOut + gap + num(p, 'baseRim');
  const height = num(p, 'panelHeight');
  const base = withBase(p);
  const baseTop = base ? num(p, 'baseHeight') : 0;
  const panelBottom = base ? baseTop - groove : 0;
  const panelTop = panelBottom + height;
  const top = bool(p, 'topRing') ? panelTop + TOP : panelTop;

  let cable: CableSlot | null = null;
  if (base) {
    if (groove + num(p, 'lampSeatDepth') > baseTop - 1) warnings.push({ key: 'warn.baseTooThin' });
    // the lamp must fit inside the cylinder
    const room = 2 * (rIn - gap) - 2;
    if (num(p, 'lampDiameter') > room) warnings.push({ key: 'warn.lampTooBig', vars: { max: round(room) } });
    // the cable hole stays inside the ring groove
    cable = cableSlot(p, rIn - gap - 1.5, warnings);
  }
  let power: PowerLayout | null = null;
  if (base && bool(p, 'powerBase')) {
    const ri = rBase - POWER_LEDGE, h = PILLAR / 2;
    // four pillars on the diagonals, turned with them, 1 mm inside the base's edge
    const pr = rBase - 1 - h * Math.SQRT2;
    const angles = [45, 135, 225, 315];
    const grow = 2 * (POWER_WALL + POWER_FIT);
    power = powerLayout(p, {
      size: [2 * rBase + grow, 2 * rBase + grow],
      // the front wall is curved: the switch has to stay within the straighter middle
      innerW: 2 * ri * 0.85,
      innerL: 2 * ri,
      pillars: angles.map((a) => [pr * Math.cos((a * Math.PI) / 180), pr * Math.sin((a * Math.PI) / 180)] as [number, number]),
      pillarRot: angles,
      post: 2 * num(p, 'baseRim'),
      baseTop,
    }, warnings);
  }
  // a round picture in the ring: its rebate a wall inside the cylinder's groove
  const topR = bool(p, 'topRing') && bool(p, 'topPanel') ? rIn - 2 * gap - WALL : 0;
  if (topR && thick + 0.2 + 1.2 > groove + TOP) warnings.push({ key: 'warn.lidTooThin' });
  return { rOut, rIn, rBase, thick, gap, groove, width: 2 * Math.PI * (rIn + thick / 2), height, baseTop, panelBottom, panelTop, top, topR, cable, power, warnings };
}

/** The groove the cylinder's edge sits in, between z0 and z1. */
function groove(k: Kernel, L: CylinderLayout, z0: number, z1: number): Manifold {
  return annulus(k, L.rIn - L.gap, L.rOut + L.gap, z0, z1);
}

function buildBase(k: Kernel, p: ParamValues, L: CylinderLayout): Manifold {
  const base = cylinder(k, 0, 0, 0, L.baseTop, L.rBase);
  const cuts = [groove(k, L, L.panelBottom, L.baseTop + 1), ...lampCuts(k, p, 0, L.baseTop), ...cableCuts(k, p, L.cable!, 0, L.baseTop, L.rBase)];
  if (L.power) cuts.push(...powerUnderside(k, p, L.power));
  return base.subtract(k.Manifold.union(cuts));
}

function buildRing(k: Kernel, p: ParamValues, L: CylinderLayout): Manifold {
  const z0 = L.panelTop - L.groove;
  if (!L.topR) return annulus(k, L.rIn - LIP, L.rBase, z0, L.top).subtract(groove(k, L, z0 - 1, L.panelTop + L.gap));
  // a lid with a round picture: a rebate it lies in, on a ledge round the opening
  const rebate = cylinder(k, 0, 0, L.top - (L.thick + 0.2), L.thick + 1.2, L.topR + L.gap);
  return annulus(k, L.topR - num(p, 'topLedge'), L.rBase, z0, L.top).subtract(groove(k, L, z0 - 1, L.panelTop + L.gap)).subtract(rebate);
}

export const cylinderShape: ShapeDefinition = {
  id: 'cylinder',
  groups: cylinderGroups,
  presets: [
    { id: 'small', values: { cylDiameter: 80, panelHeight: 100 } },
    { id: 'medium', values: { cylDiameter: 100, panelHeight: 130 } },
    { id: 'tall', values: { cylDiameter: 100, panelHeight: 180 } },
  ],
  validate: (p) => cylinderLayout(p).warnings,
  async prepare(p) {
    if (str(p, 'baseText').trim() || str(p, 'topText').trim()) await ensureFont(str(p, 'textFont'));
  },
  build(k, p): BuildResult {
    const L = cylinderLayout(p);
    const warnings = [...L.warnings];
    const parts: PartOutput[] = [];
    if (withBase(p)) {
      let base = buildBase(k, p, L);
      const P = L.power;
      let tray = P ? roundTray(k, p, L.rBase, P) : null;
      // text bent round the base's front, or round the battery tray's when there is one
      const tr = L.rBase + POWER_WALL + POWER_FIT;
      const t = P
        ? curvedText(k, p, 0, 0, tr, powerTextZ(P), TEXT_ARC * tr - 8, P.inner - 4)
        : curvedText(k, p, 0, 0, L.rBase, L.baseTop / 2, TEXT_ARC * L.rBase - 8, L.baseTop - 2);
      if (tray) tray = applyFrontText(tray, t, warnings);
      else base = applyFrontText(base, t, warnings);
      parts.push({ id: 'base', mesh: toMeshData(base), color: COLORS.base, explode: [0, 0, 0], printRotation: [0, 0, 0] });
      if (tray) parts.push({ id: 'power', mesh: toMeshData(tray), color: COLORS.power, explode: [0, 0, -70], printRotation: [0, 0, 0] });
      if (t?.volume) parts.push({ id: 'text-base', object: tray ? 'power' : 'base', extruder: 2, mesh: toMeshData(t.volume), color: COLORS.text, explode: [0, 0, 0], printRotation: [0, 0, 0] });
    }
    if (bool(p, 'topRing')) {
      let ring = buildRing(k, p, L);
      // text bent along the ring's top, between the opening and the outer edge
      const r0 = L.topR ? L.topR + L.gap + 0.5 : L.rIn - LIP, R = (r0 + L.rBase) / 2;
      const t = lidText(k, p, L.top, TEXT_ARC * R - 8, L.rBase - r0 - 3, ringText(R));
      if (t?.shrunk) warnings.push({ key: 'warn.textShrunkTop' });
      if (t) ring = ring.subtract(t.cut);
      // printed upside down: the plate on the bed
      parts.push({ id: 'ring', mesh: toMeshData(ring), color: COLORS.ring, explode: [0, 0, 120], printRotation: [180, 0, 0] });
      if (t?.volume) parts.push({ id: 'text-top', object: 'ring', extruder: 2, mesh: toMeshData(t.volume), color: COLORS.text, explode: [0, 0, 120], printRotation: [180, 0, 0] });
    }

    const zc = (L.panelBottom + L.panelTop) / 2;
    const slot: PanelSlot = { id: 'round', width: L.width, height: L.height, thickness: L.thick, matrix: roundSlotMatrix(zc), wrap: { radius: L.rIn } };
    const tube = annulus(k, L.rIn, L.rOut, L.panelBottom, L.panelTop);
    parts.push({ id: 'panel-round', mesh: toMeshData(tube), color: COLORS.panel, explode: [0, 0, 60], printRotation: [0, 0, 0], preview: true, ghost: true });
    if (withBase(p)) {
      parts.push(puckLamp(k, p, 0, L.baseTop));
    }

    const info: Message[] = [
      { key: 'info.outer', vars: { x: round(L.power?.outerX ?? 2 * L.rBase), y: round(L.power?.outerY ?? 2 * L.rBase), z: round(L.top + (L.power ? L.power.height - L.power.seat : 0)) } },
      { key: 'info.cylinder', vars: { d: round(2 * L.rOut), h: round(L.height), t: L.thick, w: round(L.width) } },
    ];
    pushPowerInfo(info, L.power, p);
    const slots = [slot];
    if (L.topR) {
      const z1 = L.top - 0.2;
      slots.push({ id: 'top', width: 2 * L.topR, height: 2 * L.topR, thickness: L.thick, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, z1 - L.thick / 2, 1], outline: { radius: L.topR, cy: 0 } });
      parts.push({ id: 'panel-top', mesh: toMeshData(cylinder(k, 0, 0, z1 - L.thick, L.thick, L.topR)), color: COLORS.panel, explode: [0, 0, 110], printRotation: [0, 0, 0], preview: true, ghost: true });
    }
    return { parts, slots, warnings, info };
  },
};

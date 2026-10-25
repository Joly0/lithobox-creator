// Ball lamp: one lithophane ball, cut flat at the bottom, the picture a band round its middle
// and plain thin caps above and below. It stands on its cut rim over an existing lamp fitting
// (like the glass ball it replaces, with a cable hole at the back), or sits in a round base with
// a puck light or a lamp socket (a globe on a base).
//
// Model space: millimetres, Z up, the ball's axis on x = y = 0, its cut on the floor or in the
// base, the picture's middle facing -Y.
import { bool, num, round, type ShapeDefinition, str } from '../../core/shape';
import type { BuildResult, Message, PanelSlot, ParamValues, PartOutput } from '../../core/types';
import { box, cylinder, toMeshData, type Kernel, type Manifold } from '../../geometry/kernel';
import { ensureFont } from '../../geometry/text';
import { applyFrontText, cableCuts, cableSlot, type CableSlot, curvedText, DRUM_WALL, lampCuts, puckLamp, roundSlotMatrix, SOCKET_PLATE, socketDrumCuts } from '../common/base';
import { spherePicture, type SphereProjection } from '../../litho/mesh';
import { PILLAR, powerFit, POWER_LEDGE, POWER_WALL, powerLayout, type PowerLayout, powerTextZ, powerUnderside, pushPowerInfo, roundTray } from '../common/power';
import { basePuck, baseSocket, onBase, sphereGroups, standalone } from './params';

const COLORS = { base: '#c9ccd3', power: '#9aa3b5', panel: '#fff4dc', lamp: '#8fb7ff', text: '#3b4150' };
/** Cable hole at the back of a ball standing on its own: radius and height of its middle above the cut. */
const HOLE_R = 7.5;
const HOLE_Z = 12;
/** Bulb for the preview lamp in a socket: an A60. */
const BULB = [60, 105];

export interface SphereLayout {
  /** Outside and back (inside) radius, and half way between. */
  rOut: number;
  rIn: number;
  rMid: number;
  thick: number;
  gap: number;
  /** Height of the ball's centre above its cut, and of the cut above the floor. */
  c: number;
  cutZ: number;
  /** Inside radius of the opening at the cut. */
  opening: number;
  /** Rows along the meridian: their middle (from the equator) and length; the cut's latitude. */
  sMid: number;
  length: number;
  edge: number;
  band: [number, number];
  /** How the photo is laid on the ball, half the width of a picture from the front (radians), the picture's size. */
  projection: SphereProjection;
  half: number;
  blend: number;
  around: number;
  picture: [number, number];
  /** Base (on a base only): top, outside radius, groove. */
  baseTop: number;
  rBase: number;
  groove: number;
  hole: number;
  cable: CableSlot | null;
  power: PowerLayout | null;
  warnings: Message[];
}

export function sphereLayout(p: ParamValues): SphereLayout {
  const warnings: Message[] = [];
  const rOut = num(p, 'sphereDiameter') / 2;
  const thick = num(p, 'panelThickness');
  const rIn = rOut - thick, rMid = rIn + thick / 2;
  const gap = num(p, 'slotClearance') / 2;
  // the cut must stay below the middle, or the ball would not hold the lamp's light in
  let c = num(p, 'sphereHeight') - rOut;
  if (c < 5 || c > rIn - 10) {
    warnings.push({ key: 'warn.sphereCut', vars: { min: round(rOut + 5), max: round(rOut + rIn - 10) } });
    c = Math.min(Math.max(c, 5), rIn - 10);
  }
  const opening = Math.sqrt(rIn * rIn - c * c);
  // rows from just below the cut up to the pole, along the meridian through the wall's middle
  // rows start where the outside meets the cut (above it the whole wall is above the floor);
  // the mesh then puts the bottom row's points on the cut itself, so the ball stands flat
  const sBottom = -Math.asin(c / rOut) * rMid, sTop = (Math.PI / 2) * rMid;
  const sMid = (sBottom + sTop) / 2, length = sTop - sBottom;
  const edge = sBottom - sMid;
  const deg = (key: string) => ((num(p, key) * Math.PI) / 180) * rMid - sMid;
  const m = num(p, 'lithoMargin');
  // the band stays clear of the cut's margin and below the pole
  const b0 = Math.max(deg('bandBottom'), edge + m), b1 = Math.min(deg('bandTop'), length / 2 - 2);
  if (b1 - b0 < 10) warnings.push({ key: 'warn.sphereBand' });
  // widening a narrow band must not push it past the pole, where the conformal map is NaN
  const top = Math.min(Math.max(b1, b0 + 10), length / 2 - 2);
  const band: [number, number] = [Math.min(b0, top - 10), top];
  const projection = str(p, 'projection') as SphereProjection;
  const half = ((num(p, 'frontWidth') / 2) * Math.PI) / 180;
  // the slider means the same for both: 0 % true from in front of the middle, 100 % natural from
  // every side; the band's own blend runs the other way (0 = the plain band, even all round)
  const slider = num(p, 'frontBlend') / 100;
  const blend = projection === 'band' ? 1 - slider : slider;
  const around = (num(p, 'wrapWidth') * Math.PI) / 180;
  const picture = spherePicture(projection, [(band[0] + sMid) / rMid, (band[1] + sMid) / rMid], half, rMid, blend, around);

  const groove = onBase(p) ? num(p, 'baseGroove') : 0;
  const baseTop = !onBase(p) ? 0 : baseSocket(p) ? num(p, 'socketRoom') + SOCKET_PLATE : num(p, 'baseHeight');
  const cutZ = onBase(p) ? baseTop - groove : 0;
  // the ball's widest point inside the groove: at the groove's top
  const zTopRel = baseTop - cutZ - c;
  const rBase = Math.sqrt(Math.max(0, rOut * rOut - zTopRel * zTopRel)) + gap + num(p, 'baseRim');
  const hole = str(p, 'socket') === 'e14' ? num(p, 'socketHoleE14') : num(p, 'socketHoleE27');

  let cable: CableSlot | null = null;
  let power: PowerLayout | null = null;
  if (basePuck(p)) {
    if (groove + num(p, 'lampSeatDepth') > baseTop - 1) warnings.push({ key: 'warn.baseTooThin' });
    if (num(p, 'lampDiameter') > 2 * (opening - gap) - 2) warnings.push({ key: 'warn.lampTooBig', vars: { max: round(2 * (opening - gap) - 2) } });
    cable = cableSlot(p, opening - gap - 1.5, warnings);
    if (bool(p, 'powerBase')) {
      const h = PILLAR / 2, pr = rBase - 1 - h * Math.SQRT2, angles = [45, 135, 225, 315];
      const grow = 2 * (POWER_WALL + powerFit(p)), ri = rBase - POWER_LEDGE;
      power = powerLayout(p, {
        size: [2 * rBase + grow, 2 * rBase + grow],
        innerW: 2 * ri * 0.85,
        innerL: 2 * ri,
        pillars: angles.map((a) => [pr * Math.cos((a * Math.PI) / 180), pr * Math.sin((a * Math.PI) / 180)] as [number, number]),
        pillarRot: angles,
        post: 2 * num(p, 'baseRim'),
        baseTop,
      }, warnings);
    }
  }
  if (baseSocket(p) && hole / 2 + 4 > opening - gap - DRUM_WALL) warnings.push({ key: 'warn.lampTooBig', vars: { max: round(2 * (opening - gap - DRUM_WALL - 4)) } });
  const widest = 2 * Math.max(rOut, onBase(p) ? rBase : 0);
  if (widest > num(p, 'bedSize')) warnings.push({ key: 'warn.bed', vars: { size: round(widest), bed: num(p, 'bedSize') } });

  return { rOut, rIn, rMid, thick, gap, c, cutZ, opening, sMid, length, edge, band, projection, half, blend, around, picture, baseTop, rBase, groove, hole, cable, power, warnings };
}

/** The base: a disc with a lamp seat, or a hollow drum with the socket in its plate; the ball's rim in a groove. */
function buildBase(k: Kernel, p: ParamValues, L: SphereLayout): Manifold {
  // the ball's wall in the groove leans in towards the cut: inside at the cut, outside at the top
  const zRel = L.baseTop - L.cutZ - L.c;
  const outTop = Math.sqrt(L.rOut * L.rOut - zRel * zRel);
  const groove = cylinder(k, 0, 0, L.cutZ, L.groove + 1, outTop + L.gap).subtract(cylinder(k, 0, 0, L.cutZ - 1, L.groove + 3, L.opening - L.gap));
  const base = cylinder(k, 0, 0, 0, L.baseTop, L.rBase);
  if (baseSocket(p)) {
    return base.subtract(k.Manifold.union([groove, ...socketDrumCuts(k, L.baseTop, L.opening - L.gap, L.hole, L.rBase)]));
  }
  const cuts = [groove, ...lampCuts(k, p, 0, L.baseTop), ...cableCuts(k, p, L.cable!, 0, L.baseTop, L.rBase)];
  if (L.power) cuts.push(...powerUnderside(k, p, L.power));
  return base.subtract(k.Manifold.union(cuts));
}

export const sphereShape: ShapeDefinition = {
  id: 'sphere',
  groups: sphereGroups,
  presets: [
    { id: 'replacement', values: { sphereDiameter: 200, sphereHeight: 185, mount: 'standalone' } },
    { id: 'globeSmall', values: { sphereDiameter: 160, sphereHeight: 146, mount: 'base' } },
    { id: 'globeLarge', values: { sphereDiameter: 250, sphereHeight: 236, mount: 'base' } },
  ],
  validate: (p) => sphereLayout(p).warnings,
  async prepare(p) {
    if (onBase(p) && str(p, 'baseText').trim()) await ensureFont(str(p, 'textFont'));
  },
  build(k, p): BuildResult {
    const L = sphereLayout(p);
    const warnings = [...L.warnings];
    const parts: PartOutput[] = [];
    const centre = L.cutZ + L.c;

    if (onBase(p)) {
      let base = buildBase(k, p, L);
      const P = L.power;
      let tray = P ? roundTray(k, p, L.rBase, P) : null;
      const tr = P ? L.rBase + POWER_WALL + powerFit(p) : L.rBase;
      const arc = ((2 * Math.PI) / 3) * tr - 8;
      const t = P ? curvedText(k, p, 0, 0, tr, powerTextZ(P), arc, P.inner - 4) : curvedText(k, p, 0, 0, L.rBase, L.baseTop / 2, arc, Math.min(L.baseTop - 2, 20));
      if (tray) tray = applyFrontText(tray, t, warnings);
      else base = applyFrontText(base, t, warnings);
      parts.push({ id: 'base', mesh: toMeshData(base), color: COLORS.base, explode: [0, 0, 0], printRotation: [0, 0, 0] });
      if (tray) parts.push({ id: 'power', mesh: toMeshData(tray), color: COLORS.power, explode: [0, 0, -70], printRotation: [0, 0, 0] });
      if (t?.volume) parts.push({ id: 'text-base', object: tray ? 'power' : 'base', extruder: 2, mesh: toMeshData(t.volume), color: COLORS.text, explode: [0, 0, 0], printRotation: [0, 0, 0] });
    }

    // the cable hole at the back (the picture's seam), its middle HOLE_Z above the cut
    const sHole = Math.asin((HOLE_Z - L.c) / L.rMid) * L.rMid - L.sMid;
    const hole = standalone(p) && bool(p, 'cableHole') ? { x: Math.PI * L.rMid, y: sHole, r: HOLE_R } : undefined;
    // exploded: the ball lifts straight up until its bottom clears the lamp under it (the bulb on
    // its socket, or the puck light), which stays where it is
    const [, bulbLen] = BULB;
    const lampTop = basePuck(p) ? L.baseTop + 30 + 20 : Math.max((onBase(p) ? L.baseTop : 0) + 35, centre - bulbLen / 2) + bulbLen;
    const lift: [number, number, number] = [0, 0, Math.max(80, lampTop + 20 - L.cutZ)];
    // a second photo on the back half: its own slot, made into the same relief
    const backPhoto = L.projection === 'front' && bool(p, 'backPhoto');
    const slot: PanelSlot = {
      id: 'round',
      width: 2 * Math.PI * L.rMid,
      height: L.length,
      thickness: L.thick,
      matrix: roundSlotMatrix(centre),
      wrap: { radius: L.rIn, sphere: { sMid: L.sMid, band: L.band, edge: L.edge, cutY: -L.c, hole, projection: L.projection, half: L.half, blend: L.blend, around: L.around, picture: L.picture, back: backPhoto } },
      explode: lift,
    };
    // stand-in: the ball's shell, cut flat
    const ball = k.Manifold.sphere(L.rOut, 96).subtract(k.Manifold.sphere(L.rIn, 96)).translate([0, 0, centre]).intersect(box(k, [-L.rOut - 1, -L.rOut - 1, L.cutZ], [L.rOut + 1, L.rOut + 1, centre + L.rOut + 1]));
    parts.push({ id: 'panel-round', mesh: toMeshData(ball), color: COLORS.panel, explode: slot.explode!, printRotation: [0, 0, 0], preview: true, ghost: true });

    // the preview lamp: a bulb in the middle of the ball on a socket from below, or a puck in its seat
    if (basePuck(p)) {
      parts.push(puckLamp(k, p, 0, L.baseTop));
    } else {
      const [bd, bl] = BULB;
      const z0 = onBase(p) ? L.baseTop : 0;
      const zBulb = Math.max(z0 + 35, centre - bl / 2);
      const lamp = cylinder(k, 0, 0, z0, zBulb - z0, 18).add(cylinder(k, 0, 0, zBulb, bl, bd * 0.3, bd / 2));
      parts.push({ id: 'lamp', mesh: toMeshData(lamp), color: COLORS.lamp, explode: [0, 0, 0], printRotation: [0, 0, 0], preview: true, ghost: true, light: [0, 0, Math.min(centre, zBulb + bl * 0.6)] });
    }

    const P = L.power;
    const outer = 2 * Math.max(L.rOut, onBase(p) ? L.rBase : 0);
    const info: Message[] = [
      { key: 'info.outer', vars: { x: round(P?.outerX ?? outer), y: round(P?.outerY ?? outer), z: round(centre + L.rOut + (P ? P.height - P.seat : 0)) } },
      L.projection === 'front'
        ? { key: 'info.sphereFront', vars: { d: round(2 * L.rOut), h: round(L.c + L.rOut), o: round(2 * L.opening), w: round(L.picture[0]), ph: round(L.picture[1]) } }
        : { key: 'info.sphere', vars: { d: round(2 * L.rOut), h: round(L.c + L.rOut), o: round(2 * L.opening), w: round(L.picture[0]) } },
      { key: 'info.sphereDetail' },
    ];
    if (!basePuck(p)) info.push({ key: 'info.shadeHeat' });
    pushPowerInfo(info, P, p);
    return { parts, slots: backPhoto ? [slot, { ...slot, id: 'back', pictureOf: 'round' }] : [slot], warnings, info };
  },
};

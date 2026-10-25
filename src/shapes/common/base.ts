// Base options shared by the shapes that stand on a lamp base: lamp seat, steel disc recess,
// cable hole and channel, and text on the front. Each shape decides where its base is; these
// only need the lamp centre, the base top and how far the cable may run.
import { bool, num, str } from '../../core/shape';
import type { MeshData, Message, ParamValues, PartOutput, Vec3 } from '../../core/types';
import { box, cylinder, prism, roundedRect, toMeshData, type Kernel, type Manifold } from '../../geometry/kernel';
import { textOutline } from '../../geometry/text';
import { CABLE_PRESETS } from '../box/params';

/** Slot-shaped hole (stadium) centred on (cx, cy), long axis along Y. */
export function stadiumY(k: Kernel, cx: number, cy: number, z0: number, z1: number, width: number, length: number): Manifold {
  const len = Math.max(length, width);
  return prism(roundedRect(k, width, len, width / 2 - 0.01).translate([cx, cy]), z0, z1);
}

/** Cable hole (stadium) along +Y from the lamp centre: width, length, centre distance. */
export interface CableSlot {
  width: number;
  length: number;
  offset: number;
}

/**
 * Where the cable hole goes, from the cable settings. Presets scale with the lamp. `limit` is
 * how far from the lamp centre the hole may reach before it hits something (a groove, a wall).
 */
export function cableSlot(p: ParamValues, limit: number, warnings: Message[]): CableSlot {
  const lampR = num(p, 'lampDiameter') / 2;
  const mode = str(p, 'cableMode');
  let cw: number, inner: number, outer: number;
  if (mode === 'custom') {
    cw = num(p, 'cableHoleWidth');
    inner = num(p, 'cableHoleOffset') - num(p, 'cableHoleLength') / 2;
    outer = num(p, 'cableHoleOffset') + num(p, 'cableHoleLength') / 2;
  } else {
    const c = CABLE_PRESETS[mode] ?? CABLE_PRESETS.bottom;
    cw = c.width;
    inner = c.inner * lampR;
    outer = c.outer * lampR + c.extra;
  }
  // keep the slot clear of the steel disc recess: move it outwards, same length
  if (bool(p, 'steelDisc') && bool(p, 'discKeepClear')) {
    const clear = num(p, 'discDiameter') / 2 + 2 - inner;
    if (clear > 0) {
      inner += clear;
      outer += clear;
    }
  }
  if (outer > limit) {
    if (mode === 'custom') warnings.push({ key: 'warn.cableOutside' });
    outer = limit;
  }
  if (outer - inner < cw) warnings.push({ key: 'warn.cableOutside' });
  const length = Math.max(outer - inner, 0.5);
  return { width: cw, length, offset: inner + length / 2 };
}

/**
 * The puck light in its seat, as a see-through preview part: centred at y = `cy`, standing in
 * the seat cut into the base top. `mesh` is for shapes that move their meshes (the arc).
 */
export function puckLamp(k: Kernel, p: ParamValues, cy: number, baseTop: number, mesh: (m: Manifold) => MeshData = toMeshData): PartOutput {
  const r = num(p, 'lampDiameter') / 2 - 2;
  const lamp = cylinder(k, 0, cy, baseTop - num(p, 'lampSeatDepth'), 30, r * 0.85, r);
  return { id: 'lamp', mesh: mesh(lamp), color: '#8fb7ff', explode: [0, 0, 20], printRotation: [0, 0, 0], preview: true, ghost: true };
}

/** Plate over a lamp socket's drum (table shade, ball on a base), and the drum's wall. */
export const SOCKET_PLATE = 3;
export const DRUM_WALL = 2.4;

/**
 * Hollow under a base for a lamp socket's body: the drum inside a wall of DRUM_WALL within
 * radius `rOut`, the socket's hole through the plate, and a notch at the back for the cable.
 */
export function socketDrumCuts(k: Kernel, baseTop: number, rOut: number, hole: number, rBase: number): Manifold[] {
  const chamber = cylinder(k, 0, 0, -1, baseTop - SOCKET_PLATE + 1, rOut - DRUM_WALL);
  const through = cylinder(k, 0, 0, baseTop - SOCKET_PLATE - 1, SOCKET_PLATE + 2, hole / 2);
  const notch = box(k, [-5, 0, -1], [5, rBase + 1, 8]);
  return [chamber, through, notch];
}

/** Lamp seat and steel disc recess, centred on (0, cy), cut down from the base top. */
export function lampCuts(k: Kernel, p: ParamValues, cy: number, baseTop: number): Manifold[] {
  const cuts: Manifold[] = [];
  const seat = num(p, 'lampSeatDepth');
  if (seat > 0) cuts.push(cylinder(k, 0, cy, baseTop - seat, seat + 1, num(p, 'lampDiameter') / 2));
  if (bool(p, 'steelDisc')) {
    // recess for the steel disc of magnetic-base bulbs, in the floor of the lamp seat
    const dd = num(p, 'discDepth');
    cuts.push(cylinder(k, 0, cy, baseTop - seat - dd, dd + 0.01, num(p, 'discDiameter') / 2 + num(p, 'discClearance')));
  }
  return cuts;
}

/**
 * Cable hole through the base at (0, cy + offset), plus an optional channel underneath that
 * runs out at the back edge `backY`.
 */
export function cableCuts(k: Kernel, p: ParamValues, c: CableSlot, cy: number, baseTop: number, backY: number): Manifold[] {
  const cuts = [stadiumY(k, 0, cy + c.offset, -1, baseTop + 1, c.width, c.length)];
  if (bool(p, 'cableChannel')) {
    const cw = num(p, 'cableChannelWidth');
    const cd = Math.min(num(p, 'cableChannelDepth'), baseTop - 1);
    const y0 = cy + c.offset;
    const len = backY + 2 - y0;
    cuts.push(stadiumY(k, 0, y0 + len / 2, -1, cd, cw, len));
  }
  return cuts;
}

/** Lay text into a rectangle, shrinking it if needed. Returns the outline and whether it shrank. */
export function fitText(k: Kernel, p: ParamValues, text: string, size: number, maxW: number, maxH: number) {
  const t = textOutline(k, text, str(p, 'textFont'), size);
  if (!t) return null;
  const scale = Math.min(1, maxW / t.width, maxH / t.height);
  return { cs: scale < 1 ? t.cs.scale(scale) : t.cs, shrunk: scale < 0.999 };
}

/** Text on a front face (plane y = y0, facing -Y), centred at height zc. */
export interface FrontText {
  /** Material to add (raised text in the body colour). */
  add?: Manifold;
  /** Material to remove (engraved or inlaid text). */
  cut?: Manifold;
  /** Text printed in a second filament, as its own volume. */
  volume?: Manifold;
  shrunk: boolean;
}

export function frontText(k: Kernel, p: ParamValues, y0: number, zc: number, maxW: number, maxH: number): FrontText | null {
  const text = str(p, 'baseText').trim();
  if (!text) return null;
  const t = fitText(k, p, text, num(p, 'baseTextSize'), maxW, maxH);
  if (!t) return null;
  const d = num(p, 'textDepth');
  // text plane XY -> front face XZ, extruded outwards (-Y)
  const solid = (z0: number, z1: number) => t.cs.extrude(z1 - z0).translate([0, 0, z0]).rotate([90, 0, 0]).translate([0, y0, zc]);
  const out: FrontText = { shrunk: t.shrunk };
  if (str(p, 'baseTextStyle') === 'raised') {
    if (bool(p, 'textSecondColor')) out.volume = solid(0, d);
    else out.add = solid(-0.01, d);
  } else {
    out.cut = solid(-d, 1);
    if (str(p, 'baseTextStyle') === 'inlay') out.volume = solid(-d, 0);
  }
  return out;
}

/** Put base text on `m`: engrave or inlay its cut, add raised text, warn when it had to shrink. */
export function applyFrontText(m: Manifold, t: FrontText | null, warnings: Message[]): Manifold {
  if (t?.shrunk) warnings.push({ key: 'warn.textShrunkBase' });
  if (t?.cut) m = m.subtract(t.cut);
  if (t?.add) m = m.add(t.add);
  return m;
}

/**
 * Base text bent round a curved front: the front surface is a circle of radius `R` round
 * (cx, cy), the text centred where it faces -Y, at height zc. `maxW` is measured along the curve.
 */
export function curvedText(k: Kernel, p: ParamValues, cx: number, cy: number, R: number, zc: number, maxW: number, maxH: number): FrontText | null {
  const flat = frontText(k, p, 0, zc, maxW, maxH);
  if (!flat) return null;
  // flat: x along the face, -y out of it; bent: x becomes the angle, -y the distance outside R
  const bend = (m: Manifold) =>
    m.warp((v) => {
      const a = v[0] / R, r = R - v[1];
      v[0] = cx + r * Math.sin(a);
      v[1] = cy - r * Math.cos(a);
    });
  const out: FrontText = { shrunk: flat.shrunk };
  if (flat.add) out.add = bend(flat.add);
  if (flat.cut) out.cut = bend(flat.cut);
  if (flat.volume) out.volume = bend(flat.volume);
  return out;
}

/** Text engraved (or inlaid) into a lid's top at `zTop`: the outline placed by `place` in the XY plane. */
export interface LidText {
  cut: Manifold;
  volume?: Manifold;
  shrunk: boolean;
}

/**
 * The lid text, fitted into maxW × maxH and centred on the origin, then moved by `place` (a
 * flat placement, or a bend round a ring with `ringText`).
 */
export function lidText(k: Kernel, p: ParamValues, zTop: number, maxW: number, maxH: number, place: (m: Manifold) => Manifold): LidText | null {
  const text = str(p, 'topText').trim();
  if (!text) return null;
  const t = fitText(k, p, text, num(p, 'topTextSize'), maxW, maxH);
  if (!t) return null;
  const d = num(p, 'textDepth');
  const solid = (z0: number, z1: number) => place(t.cs.extrude(z1 - z0).translate([0, 0, zTop + z0]));
  const out: LidText = { cut: solid(-d, 1), shrunk: t.shrunk };
  if (str(p, 'topTextStyle') === 'inlay') out.volume = solid(-d, 0);
  return out;
}

/** A panel slot's matrix: the origin and the panel's x/y/z axes in model space. */
export function slotMatrix(origin: Vec3, xAxis: Vec3, yAxis: Vec3, zAxis: Vec3): number[] {
  return [...xAxis, 0, ...yAxis, 0, ...zAxis, 0, ...origin, 1];
}

/**
 * A round panel's slot matrix: panel x stays x, panel y (the axis) becomes up, the picture's
 * middle faces -Y. `y` moves it off the axis (the arc's picture sits in front of it).
 */
export function roundSlotMatrix(z: number, y = 0): number[] {
  return [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, y, z, 1];
}

/** Ring between two radii, from z0 to z1 (the outside may lean: rOut1 at the top). */
export function annulus(k: Kernel, rIn: number, rOut0: number, z0: number, z1: number, rOut1 = rOut0): Manifold {
  return cylinder(k, 0, 0, z0, z1 - z0, rOut0, rOut1).subtract(cylinder(k, 0, 0, z0 - 1, z1 - z0 + 2, rIn));
}

/** A placement for lidText: along a ring of radius R round the origin, read from the front (-Y). */
export const ringText = (R: number) => (m: Manifold) =>
  m.warp((v) => {
    // the text's up (+y) points to the middle
    const a = v[0] / R, r = R - v[1];
    v[0] = r * Math.sin(a);
    v[1] = -r * Math.cos(a);
  });

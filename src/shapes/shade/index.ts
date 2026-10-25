// Lampshade: one lithophane all the way round, a cone or a cylinder, the relief outside.
// Hung from a ceiling socket (pendant): the shade hangs by a narrow inward rim at its top edge on
// a spider ring clamped by the socket's shade ring; the spider is a separate part, or joined to
// the rim and printed with the shade in one piece. Or standing on a table: its bottom edge in a
// cone-shaped groove in a round base that holds a puck light, or a lamp socket in a hollow drum.
//
// Model space: millimetres, Z up, the shade's axis on x = y = 0, standing on z = 0 (a pendant
// drawn as if it stood), the picture's middle facing -Y.
import { bool, num, str, type ShapeDefinition } from '../../core/shape';
import type { BuildResult, Message, PanelSlot, ParamValues, PartOutput } from '../../core/types';
import { box, cylinder, toMeshData, type Kernel, type Manifold } from '../../geometry/kernel';
import { ensureFont } from '../../geometry/text';
import { round } from '../box/layout';
import { cableCuts, cableSlot, curvedText, lampCuts, type CableSlot } from '../common/base';
import { buildPowerTray, PILLAR, POWER_FIT, POWER_LEDGE, POWER_WALL, powerLayout, powerTextZ, powerUnderside, type PowerLayout } from '../common/power';
import { cone, pendant, shadeGroups, table, tablePuck, tableSocket } from './params';

const COLORS = { base: '#c9ccd3', power: '#9aa3b5', spider: '#e9a23b', litho: '#f4ead7', panel: '#fff4dc', lamp: '#8fb7ff', text: '#3b4150' };

/** The pendant's inward rim at the top edge: thickness and how far it reaches in. */
const LIP_T = 2;
const LIP_W = 5;
/** Spider: ring height and width, hub wall round the socket, spoke width. */
const RING_H = 3;
const RING_W = 5;
const HUB = 6;
const SPOKE = 6;
/** Plate over the table base's socket drum, and its walls. */
const PLATE = 3;
const DRUM_WALL = 2.4;
/** Bulbs for the preview lamp: diameter and length (A60 for E27, a candle-sized one for E14). */
const BULB = { e27: [60, 105], e14: [45, 80] } as const;

export interface ShadeLayout {
  /** Outside radius at the bottom and top edge, and the back's (inside) radius there. */
  rBo: number;
  rTo: number;
  rBi: number;
  rTi: number;
  /** Change of radius per mm up; how much longer the slant is than the height. */
  slope: number;
  sl: number;
  thick: number;
  height: number;
  gap: number;
  /** Bottom and top edge of the shade. */
  bottom: number;
  top: number;
  /** Table: the base's top, outside radius, groove depth. */
  baseTop: number;
  rBase: number;
  groove: number;
  /** The socket's hole (pendant spider or table plate). */
  hole: number;
  cable: CableSlot | null;
  /** Table with a puck light: the battery tray under the base. */
  power: PowerLayout | null;
  warnings: Message[];
}

export function shadeLayout(p: ParamValues): ShadeLayout {
  const warnings: Message[] = [];
  const height = num(p, 'panelHeight');
  const rTo = num(p, 'topDiameter') / 2;
  const rBo = cone(p) ? num(p, 'bottomDiameter') / 2 : rTo;
  const slope = (rTo - rBo) / height;
  const sl = Math.sqrt(1 + slope * slope);
  // a steep cone with a narrow end would get an inside radius at or past the centre
  const maxThick = (Math.min(rTo, rBo) - 1) / sl;
  let thick = num(p, 'panelThickness');
  if (thick > maxThick) {
    thick = maxThick;
    warnings.push({ key: 'warn.shadeThick', vars: { max: round(maxThick) } });
  }
  // the wall is `thick` at right angles to it: a little more measured across
  const rTi = rTo - thick * sl, rBi = rBo - thick * sl;
  const gap = num(p, 'slotClearance') / 2;
  const groove = table(p) ? num(p, 'baseGroove') : 0;
  const baseTop = !table(p) ? 0 : tableSocket(p) ? num(p, 'socketRoom') + PLATE : num(p, 'baseHeight');
  const bottom = table(p) ? baseTop - groove : 0;
  const rBase = rBo + gap + num(p, 'baseRim');
  const hole = str(p, 'socket') === 'e14' ? num(p, 'socketHoleE14') : num(p, 'socketHoleE27');

  // it prints upside down when hanging (rim on the bed), the right way up on a table: the
  // wall must not lean out further than 45° on the way up
  const lean = (Math.atan(pendant(p) ? -slope : slope) * 180) / Math.PI;
  if (lean > 45) warnings.push({ key: 'warn.shadeSteep', vars: { deg: Math.round(lean) } });

  let cable: CableSlot | null = null;
  if (table(p) && !tableSocket(p)) {
    if (groove + num(p, 'lampSeatDepth') > baseTop - 1) warnings.push({ key: 'warn.baseTooThin' });
    const room = 2 * (rBi - gap) - 2;
    if (num(p, 'lampDiameter') > room) warnings.push({ key: 'warn.lampTooBig', vars: { max: round(room) } });
    cable = cableSlot(p, rBi - gap - 1.5, warnings);
  }
  let power: PowerLayout | null = null;
  if (tablePuck(p) && bool(p, 'powerBase')) {
    // pillars on the diagonals near the base's rim, as under the ball lamp
    const h = PILLAR / 2, pr = rBase - 1 - h * Math.SQRT2, angles = [45, 135, 225, 315];
    const grow = 2 * (POWER_WALL + POWER_FIT), ri = rBase - POWER_LEDGE;
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
  if (tableSocket(p) && hole / 2 + 4 > rBi - gap - DRUM_WALL) warnings.push({ key: 'warn.lampTooBig', vars: { max: round(2 * (rBi - gap - DRUM_WALL - 4)) } });
  if (pendant(p) && spiderRing({ rBi, rTi, slope, top: height, bottom: 0 }) - RING_W < hole / 2 + HUB + 2) warnings.push({ key: 'warn.spiderNoFit' });
  const widest = Math.max(2 * Math.max(rTo, rBo, table(p) ? rBase : 0), power?.outerX ?? 0);
  if (widest > num(p, 'bedSize')) warnings.push({ key: 'warn.bed', vars: { size: round(widest), bed: num(p, 'bedSize') } });

  return { rBo, rTo, rBi, rTi, slope, sl, thick, height, gap, bottom, top: bottom + height, baseTop, rBase, groove, hole, cable, power, warnings };
}

/** Back (inside) radius at height z. */
const backAt = (L: Pick<ShadeLayout, 'rBi' | 'slope' | 'bottom'>, z: number) => L.rBi + L.slope * (z - L.bottom);

/**
 * The separate spider's ring: as wide as it can be and still pass up to the rim from below
 * (the narrowest point on its way), with a little play.
 */
function spiderRing(L: Pick<ShadeLayout, 'rBi' | 'rTi' | 'slope' | 'top' | 'bottom'>): number {
  return Math.min(backAt(L, L.top - LIP_T), L.rBi) - 0.3;
}

/** Ring between two radii, from z0 to z1 (the outside may lean: r1 at the top). */
function annulus(k: Kernel, rIn: number, rOut0: number, z0: number, z1: number, rOut1 = rOut0): Manifold {
  return cylinder(k, 0, 0, z0, z1 - z0, rOut0, rOut1).subtract(cylinder(k, 0, 0, z0 - 1, z1 - z0 + 2, rIn));
}

/** Hub round the socket hole and spokes out to radius `reach`, from z0 to z1. */
function hubAndSpokes(k: Kernel, p: ParamValues, L: ShadeLayout, reach: number, z0: number, z1: number): Manifold {
  const h = L.hole / 2;
  const parts = [cylinder(k, 0, 0, z0, z1 - z0, h + HUB)];
  const n = Number(p.spokes) || 3;
  for (let i = 0; i < n; i++) parts.push(box(k, [h, -SPOKE / 2, z0], [reach, SPOKE / 2, z1]).rotate([0, 0, 90 + (i * 360) / n]));
  return k.Manifold.union(parts).subtract(cylinder(k, 0, 0, z0 - 1, z1 - z0 + 2, h));
}

/** The pendant's inward rim at the top edge, reaching a little into the wall so they join. */
function lip(k: Kernel, L: ShadeLayout): Manifold {
  const z0 = L.top - LIP_T;
  return annulus(k, L.rTi - LIP_W, backAt(L, z0) + 0.5, z0, L.top, L.rTi + 0.5);
}

/** The spider on its own: a ring that sits under the rim, spokes, the hub the socket clamps. */
function separateSpider(k: Kernel, p: ParamValues, L: ShadeLayout): Manifold {
  const ro = spiderRing(L);
  const z1 = L.top - LIP_T, z0 = z1 - RING_H;
  return annulus(k, ro - RING_W, ro, z0, z1).add(hubAndSpokes(k, p, L, ro - RING_W + 1, z0, z1));
}

/** Model space to the shade's panel space (inverse of slotMatrix): for volumes printed with the shade. */
const toPanel = (m: Manifold, zc: number) => m.translate([0, 0, -zc]).rotate([-90, 0, 0]);

function slotMatrix(z: number): number[] {
  // panel x stays x, panel y (the axis) becomes up, the picture's middle faces -Y
  return [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, z, 1];
}

/** The table base: a solid disc with a lamp seat, or a hollow drum with the socket in its top plate. */
function buildBase(k: Kernel, p: ParamValues, L: ShadeLayout): Manifold {
  const outAt = (z: number) => L.rBo + L.slope * (z - L.bottom);
  // the shade's bottom edge stands in a groove that leans with it
  const z0 = L.bottom, z1 = L.baseTop + 1;
  const groove = cylinder(k, 0, 0, z0, z1 - z0, outAt(z0) + L.gap, outAt(z1) + L.gap).subtract(
    cylinder(k, 0, 0, z0 - 1, z1 - z0 + 2, backAt(L, z0 - 1) - L.gap, backAt(L, z1 + 1) - L.gap),
  );
  const base = cylinder(k, 0, 0, 0, L.baseTop, L.rBase);
  if (tableSocket(p)) {
    // hollow underneath for the socket's body; the cable leaves through a notch at the back
    const chamber = cylinder(k, 0, 0, -1, L.baseTop - PLATE + 1, L.rBi - L.gap - DRUM_WALL);
    const hole = cylinder(k, 0, 0, L.baseTop - PLATE - 1, PLATE + 2, L.hole / 2);
    const notch = box(k, [-5, 0, -1], [5, L.rBase + 1, 8]);
    return base.subtract(k.Manifold.union([groove, chamber, hole, notch]));
  }
  const cuts = [groove, ...lampCuts(k, p, 0, L.baseTop), ...cableCuts(k, p, L.cable!, 0, L.baseTop, L.rBase)];
  if (L.power) cuts.push(...powerUnderside(k, p, L.power));
  return base.subtract(k.Manifold.union(cuts));
}

/** The battery tray round the base (a puck base only). */
function buildTray(k: Kernel, p: ParamValues, L: ShadeLayout, P: PowerLayout): Manifold {
  const circle = (r: number) => k.CrossSection.circle(r);
  const grow = POWER_WALL + POWER_FIT;
  return buildPowerTray(k, p, P, {
    outer: circle(L.rBase + grow),
    pocket: circle(L.rBase + POWER_FIT),
    open: circle(L.rBase - POWER_LEDGE),
    front: -(L.rBase + grow),
    back: L.rBase + grow,
    innerBack: L.rBase - POWER_LEDGE,
    clip: true,
  });
}

export const shadeShape: ShapeDefinition = {
  id: 'shade',
  groups: shadeGroups,
  presets: [
    { id: 'small', values: { shadeShape: 'cone', topDiameter: 90, bottomDiameter: 130, panelHeight: 110, socket: 'e14' } },
    { id: 'medium', values: { shadeShape: 'cone', topDiameter: 120, bottomDiameter: 180, panelHeight: 150, socket: 'e27' } },
    { id: 'cylinder', values: { shadeShape: 'cylinder', topDiameter: 160, panelHeight: 160, socket: 'e27' } },
  ],
  validate: (p) => shadeLayout(p).warnings,
  async prepare(p) {
    if (table(p) && str(p, 'baseText').trim()) await ensureFont(str(p, 'textFont'));
  },
  build(k, p): BuildResult {
    const L = shadeLayout(p);
    const warnings = [...L.warnings];
    const parts: PartOutput[] = [];
    const zc = (L.bottom + L.top) / 2;
    const matrix = slotMatrix(zc);
    // exploded: a hanging shade stays and the spider, socket and bulb lift out of its top (the
    // bulb clear of it); a standing shade lifts off its base
    const [bd, bl] = BULB[str(p, 'socket') === 'e14' ? 'e14' : 'e27'];
    const shadeOut: [number, number, number] = pendant(p) ? [0, 0, 0] : [0, 0, 60];
    const lift: [number, number, number] = [0, 0, bl + 30];
    // volumes printed as one object with the shade: in its panel space, placed by its matrix
    const withShade = (id: string, m: Manifold, color: string): PartOutput => ({
      id, object: 'litho-round', mesh: toMeshData(toPanel(m, zc)), color, matrix, explode: shadeOut, printRotation: [-90, 0, 0],
    });

    if (pendant(p)) {
      if (str(p, 'spider') === 'joined') {
        // spokes straight to the rim: one piece with the shade, printed with the spider on the bed
        const spider = lip(k, L).add(hubAndSpokes(k, p, L, L.rTi - LIP_W + 1, L.top - LIP_T, L.top));
        parts.push(withShade('spider', spider, COLORS.spider));
      } else {
        parts.push(withShade('lip', lip(k, L), COLORS.litho));
        // printed flat, as it lies
        parts.push({ id: 'spider', mesh: toMeshData(separateSpider(k, p, L)), color: COLORS.spider, explode: lift, printRotation: [0, 0, 0] });
      }
    } else {
      let base = buildBase(k, p, L);
      const P = L.power;
      let tray = P ? buildTray(k, p, L, P) : null;
      // with a tray the text goes on its front, else on the base
      const tr = P ? L.rBase + POWER_WALL + POWER_FIT : L.rBase;
      const arc = ((2 * Math.PI) / 3) * tr - 8;
      const t = P ? curvedText(k, p, 0, 0, tr, powerTextZ(P), arc, P.inner - 4) : curvedText(k, p, 0, 0, L.rBase, L.baseTop / 2, arc, Math.min(L.baseTop - 2, 20));
      if (t?.shrunk) warnings.push({ key: 'warn.textShrunkBase' });
      if (tray) {
        if (t?.cut) tray = tray.subtract(t.cut);
        if (t?.add) tray = tray.add(t.add);
      } else {
        if (t?.cut) base = base.subtract(t.cut);
        if (t?.add) base = base.add(t.add);
      }
      parts.push({ id: 'base', mesh: toMeshData(base), color: COLORS.base, explode: [0, 0, 0], printRotation: [0, 0, 0] });
      if (tray) parts.push({ id: 'power', mesh: toMeshData(tray), color: COLORS.power, explode: [0, 0, -70], printRotation: [0, 0, 0] });
      if (t?.volume) parts.push({ id: 'text-base', object: tray ? 'power' : 'base', extruder: 2, mesh: toMeshData(t.volume), color: COLORS.text, explode: [0, 0, 0], printRotation: [0, 0, 0] });
    }

    const rMid = (L.rBi + L.rTi) / 2;
    const slot: PanelSlot = {
      id: 'round',
      width: 2 * Math.PI * (rMid + (L.thick * L.sl) / 2),
      height: L.height * L.sl,
      thickness: L.thick,
      matrix,
      wrap: { radius: rMid, slope: L.slope },
      upsideDown: pendant(p),
      explode: shadeOut,
    };
    const stand = cylinder(k, 0, 0, L.bottom, L.height, L.rBo, L.rTo).subtract(cylinder(k, 0, 0, L.bottom - 1, L.height + 2, L.rBi - L.slope, L.rTi + L.slope));
    parts.push({ id: 'panel-round', mesh: toMeshData(stand), color: COLORS.panel, explode: shadeOut, printRotation: [0, 0, 0], preview: true, ghost: true });

    // the preview lamp: a bulb under the hub, on the drum's plate, or a puck in its seat
    if (pendant(p)) {
      const z = L.top - LIP_T - RING_H;
      const bulb = cylinder(k, 0, 0, z - bl, bl, bd * 0.3, bd / 2).add(cylinder(k, 0, 0, z, 35, L.hole / 2 - 1));
      parts.push({ id: 'lamp', mesh: toMeshData(bulb), color: COLORS.lamp, explode: lift, printRotation: [0, 0, 0], preview: true, ghost: true, light: [0, 0, z - bl * 0.6] });
    } else if (tableSocket(p)) {
      const bulb = cylinder(k, 0, 0, L.baseTop, bl, bd / 2, bd * 0.3);
      parts.push({ id: 'lamp', mesh: toMeshData(bulb), color: COLORS.lamp, explode: [0, 0, 20], printRotation: [0, 0, 0], preview: true, ghost: true, light: [0, 0, L.baseTop + bl * 0.6] });
    } else {
      const lampR = num(p, 'lampDiameter') / 2 - 2;
      const lamp = cylinder(k, 0, 0, L.baseTop - num(p, 'lampSeatDepth'), 30, lampR * 0.85, lampR);
      parts.push({ id: 'lamp', mesh: toMeshData(lamp), color: COLORS.lamp, explode: [0, 0, 20], printRotation: [0, 0, 0], preview: true, ghost: true });
    }

    const outer = 2 * Math.max(L.rTo, L.rBo, table(p) ? L.rBase : 0);
    const P = L.power;
    const info: Message[] = [
      { key: 'info.outer', vars: { x: round(Math.max(outer, P?.outerX ?? 0)), y: round(Math.max(outer, P?.outerY ?? 0)), z: round(L.top + (P ? P.height - P.seat : 0)) } },
      { key: 'info.shade', vars: { top: round(2 * L.rTo), bottom: round(2 * L.rBo), h: round(L.height), t: L.thick, w: round(slot.width) } },
    ];
    // the shade is PLA: only an LED bulb, and not a strong one
    if (pendant(p) || tableSocket(p)) info.push({ key: 'info.shadeHeat' });
    if (P) info.push({ key: 'info.power', vars: { t: round(P.inner - 1) } });
    if (P && str(p, 'powerJoint') === 'magnets') info.push({ key: 'info.powerMagnets', vars: { d: num(p, 'magnetDiameter'), h: num(p, 'magnetHeight') } });
    return { parts, slots: [slot], warnings, info };
  },
};

// Arc: one picture bent in a shallow curve, the outside towards the viewer. It stands in a
// curved groove in a base with a lamp seat behind the picture's middle (steel disc, cable, as
// the box's base), or on two small feet without a lamp.
//
// Model space: millimetres, Z up, standing on z = 0, the picture's middle facing -Y. Parts are
// built round the curve's axis (x = y = 0, behind the picture), then moved by `shift` so the
// footprint's middle is on the origin like the other shapes.
import { bool, num, round, type ShapeDefinition, str } from '../../core/shape';
import type { BuildResult, Message, PanelSlot, ParamValues, PartOutput } from '../../core/types';
import { box, cylinder, prism, toMeshData, type Kernel, type Manifold } from '../../geometry/kernel';
import { applyFrontText, cableCuts, cableSlot, type CableSlot, curvedText, lampCuts, puckLamp, roundSlotMatrix } from '../common/base';
import { ensureFont } from '../../geometry/text';
import { buildPowerTray, PILLAR, powerFit, POWER_LEDGE, POWER_WALL, powerLayout, type PowerLayout, powerTextZ, powerUnderside, pushPowerInfo } from '../common/power';
import { SOCKET_FLOOR } from '../panel/layout';
import { buildHolder, cylY, type HolderDims, tenon } from '../panel/stand';
import { arcGroups, withBase, withFoot, withStand } from './params';

const COLORS = { base: '#c9ccd3', power: '#9aa3b5', panel: '#fff4dc', lamp: '#8fb7ff', text: '#3b4150', holder: '#e9a23b' };

/** Without a base: each foot holds this much of the arc's ends, and its floor under the groove. */
const FOOT = 25;
const FLOOR = 2;
/** Room between the lamp and the picture's back, and wall behind the lamp. */
const LAMP_GAP = 2.5;
const BACK_WALL = 4;

export interface ArcLayout {
  rOut: number;
  rIn: number;
  /** Radius at half the thickness: the picture's width is measured there. */
  rMid: number;
  thick: number;
  gap: number;
  /** Play along the picture's edges (its width), per side; `gap` is across its thickness. */
  wgap: number;
  groove: number;
  rim: number;
  width: number;
  height: number;
  /** Half the angle the picture spans, and the groove's (with clearance at the ends). */
  half: number;
  halfGroove: number;
  /** Top of the base or the feet. */
  baseTop: number;
  panelBottom: number;
  panelTop: number;
  /** Footprint of the base: x from -xHalf to xHalf, y up to yBack (the front is the curve). */
  xHalf: number;
  yBack: number;
  /** Lamp centre (on x = 0); null without a base. */
  lampY: number | null;
  /** The stand's upright holder (the flat stand's sizes, in the arc's coordinates); null without it. */
  holder: { w: number; front: number; back: number; lampZ: number; top: number } | null;
  cable: CableSlot | null;
  /** Battery tray under the base, following its outline. */
  power: PowerLayout | null;
  warnings: Message[];
}

export function arcLayout(p: ParamValues): ArcLayout {
  const warnings: Message[] = [];
  const thick = num(p, 'panelThickness');
  const width = num(p, 'arcWidth');
  const height = num(p, 'panelHeight');
  const rOut = Math.max(num(p, 'arcRadius'), thick + 5);
  const rIn = rOut - thick;
  const rMid = rOut - thick / 2;
  const gap = num(p, 'slotClearance') / 2;
  const wgap = num(p, 'slotWidthClearance') / 2;
  const groove = num(p, 'baseGroove');
  const rim = num(p, 'baseRim');
  let half = width / 2 / rMid;
  if (half > Math.PI / 2) {
    // more than a half circle: it would no longer stand like an arc
    warnings.push({ key: 'warn.arcTooBent', vars: { min: round(width / Math.PI + thick / 2) } });
    half = Math.PI / 2;
  }
  const halfGroove = half + wgap / rMid;
  const base = withBase(p);
  const stand = withStand(p);
  const baseTop = base || stand ? num(p, 'baseHeight') : groove + FLOOR;
  const panelBottom = baseTop - groove;

  // the groove's ends, with a rim round them
  const rG = rOut + gap + rim;
  const xHalf = Math.min(rG, (rOut + gap) * Math.sin(halfGroove) + rim);
  let yBack = -(rIn - gap) * Math.cos(halfGroove) + rim;
  let lampY: number | null = null;
  let holder: ArcLayout['holder'] = null;
  let cable: CableSlot | null = null;
  if (base) {
    if (groove + num(p, 'lampSeatDepth') > baseTop - 1) warnings.push({ key: 'warn.baseTooThin' });
    const lampR = num(p, 'lampDiameter') / 2;
    // the lamp sits behind the picture's middle, inside the curve
    lampY = -(rIn - gap - LAMP_GAP - lampR);
    // and must fit between the arc's ends
    const room = 2 * (rIn - gap - LAMP_GAP) * Math.sin(half);
    if (2 * lampR > room) warnings.push({ key: 'warn.lampTooBig', vars: { max: round(room) } });
    yBack = Math.max(yBack, lampY + lampR + BACK_WALL);
    cable = cableSlot(p, yBack - lampY - 2, warnings);
  } else if (stand) {
    // the flat stand's upright holder behind the picture's middle, inside the curve
    const lampR = num(p, 'lampDiameter') / 2;
    const wall = num(p, 'wallThickness');
    const floor = bool(p, 'steelDisc') ? Math.max(wall, num(p, 'discDepth') + 1.2) : wall;
    const w = 2 * (lampR + wall);
    const front = -(rIn - gap - num(p, 'lampDistance'));
    const back = front + num(p, 'holderDepth') + floor;
    const lampZ = Math.max((panelBottom + panelBottom + height) / 2, baseTop + lampR + wall);
    holder = { w, front, back, lampZ, top: lampZ + lampR + wall };
    yBack = Math.max(yBack, back + BACK_WALL);
    if (groove > baseTop - 1 || baseTop < SOCKET_FLOOR + 3) warnings.push({ key: 'warn.baseTooThin' });
    // the holder's front corners must stay inside the curve's inner surface, between its ends
    const corner = Math.hypot(w / 2, front);
    if (corner > rIn - gap - 1 || w / 2 > corner * Math.sin(half)) warnings.push({ key: 'warn.holderTooBig' });
  }
  let power: PowerLayout | null = null;
  if (base && bool(p, 'powerBase')) {
    const rG = rOut + gap + rim, h = PILLAR / 2, grow = POWER_WALL + powerFit(p);
    // a pillar near each corner of the base: the back ones in its back corners, the front
    // ones where the curve meets the sides
    const px = xHalf - 1 - h;
    const fr = rG - 1 - h * Math.SQRT2;
    const fy = -Math.sqrt(Math.max(0, fr * fr - px * px));
    const pillars: [number, number][] = [[px, yBack - 1 - h], [-px, yBack - 1 - h], [-px, fy], [px, fy]];
    power = powerLayout(p, {
      size: [2 * (xHalf + grow), yBack + rG + 2 * grow],
      innerW: 2 * (xHalf - POWER_LEDGE) * 0.85,
      innerL: yBack + rG - 2 * POWER_LEDGE,
      pillars,
      post: 2 * rim,
      baseTop,
    }, warnings);
  }
  return { rOut, rIn, rMid, thick, gap, wgap, groove, rim, width, height, half, halfGroove, baseTop, panelBottom, panelTop: panelBottom + height, xHalf, yBack, lampY, holder, cable, power, warnings };
}

/** Wedge from the axis, between angles a0 and a1 (0 = straight towards -Y, positive = +x). */
function wedge(k: Kernel, a0: number, a1: number, r: number, z0: number, z1: number): Manifold {
  const pts: [number, number][] = [[0, 0]];
  const n = Math.max(2, Math.ceil(((a1 - a0) * 180) / Math.PI / 3));
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([r * Math.sin(a), -r * Math.cos(a)]);
  }
  return prism(new k.CrossSection([pts]), z0, z1);
}

/** Part of a ring between two radii and two angles. */
function sector(k: Kernel, rIn: number, rOut: number, a0: number, a1: number, z0: number, z1: number): Manifold {
  const ring = cylinder(k, 0, 0, z0, z1 - z0, rOut).subtract(cylinder(k, 0, 0, z0 - 1, z1 - z0 + 2, rIn));
  return ring.intersect(wedge(k, a0, a1, rOut * 1.5, z0 - 1, z1 + 1));
}

function grooveCut(k: Kernel, L: ArcLayout): Manifold {
  return sector(k, L.rIn - L.gap, L.rOut + L.gap, -L.halfGroove, L.halfGroove, L.panelBottom, L.baseTop + 1);
}

/** The base's outline seen from above: the disc round the curve, cut straight at the sides and back. */
function baseOutline(k: Kernel, L: ArcLayout) {
  const rG = L.rOut + L.gap + L.rim;
  const rect = new k.CrossSection([[[-L.xHalf, -rG - 1], [L.xHalf, -rG - 1], [L.xHalf, L.yBack], [-L.xHalf, L.yBack]]]);
  return k.CrossSection.circle(rG).intersect(rect);
}

/** Battery tray under the base, following its outline. */
function buildTray(k: Kernel, p: ParamValues, L: ArcLayout, P: PowerLayout): Manifold {
  const foot = baseOutline(k, L);
  const rG = L.rOut + L.gap + L.rim, grow = POWER_WALL + powerFit(p);
  return buildPowerTray(k, p, P, {
    outer: foot.offset(grow, 'Round'),
    pocket: foot.offset(powerFit(p), 'Round'),
    open: foot.offset(-POWER_LEDGE, 'Round'),
    front: -(rG + grow),
    back: L.yBack + grow,
    innerBack: L.yBack - POWER_LEDGE,
    clip: true,
  });
}

function buildBase(k: Kernel, p: ParamValues, L: ArcLayout): Manifold {
  const rG = L.rOut + L.gap + L.rim;
  const outline = cylinder(k, 0, 0, 0, L.baseTop, rG).intersect(box(k, [-L.xHalf, -rG - 1, -1], [L.xHalf, L.yBack, L.baseTop + 1]));
  const y = L.lampY!;
  const cuts = [grooveCut(k, L), ...lampCuts(k, p, y, L.baseTop), ...cableCuts(k, p, L.cable!, y, L.baseTop, L.yBack)];
  if (L.power) cuts.push(...powerUnderside(k, p, L.power));
  return outline.subtract(k.Manifold.union(cuts));
}

/** The stand's foot: the base's curved outline minus the groove; the holder plugs into a socket. */
function buildStandFoot(k: Kernel, p: ParamValues, L: ArcLayout, S: HolderDims): Manifold {
  const rG = L.rOut + L.gap + L.rim;
  const outline = cylinder(k, 0, 0, 0, L.baseTop, rG).intersect(box(k, [-L.xHalf, -rG - 1, -1], [L.xHalf, L.yBack, L.baseTop + 1]));
  return outline.subtract(k.Manifold.union([grooveCut(k, L), tenon(k, p, S, num(p, 'holderClearance'))]));
}

/** Without a base: a short block under each end of the arc. */
function buildFeet(k: Kernel, L: ArcLayout): Manifold {
  const r0 = L.rIn - L.gap - L.rim, r1 = L.rOut + L.gap + L.rim;
  const along = Math.min(FOOT / L.rMid, L.half);
  const end = L.halfGroove + L.rim / L.rMid;
  const feet = [-1, 1].map((s) => {
    const [a0, a1] = s > 0 ? [L.half - along, end] : [-end, -L.half + along];
    return sector(k, r0, r1, a0, a1, 0, L.baseTop);
  });
  return k.Manifold.union(feet).subtract(grooveCut(k, L));
}

export const arcShape: ShapeDefinition = {
  id: 'arc',
  groups: arcGroups,
  presets: [
    { id: 'small', values: { arcWidth: 100, panelHeight: 75, arcRadius: 100 } },
    { id: 'medium', values: { arcWidth: 150, panelHeight: 100, arcRadius: 150 } },
    { id: 'large', values: { arcWidth: 200, panelHeight: 130, arcRadius: 200 } },
  ],
  validate: (p) => arcLayout(p).warnings,
  async prepare(p) {
    if (withFoot(p) && str(p, 'baseText').trim()) await ensureFont(str(p, 'textFont'));
  },
  build(k, p): BuildResult {
    const L = arcLayout(p);
    const rG = L.rOut + L.gap + L.rim;
    // from the front of the curve to the back of the base or the feet
    const back = withFoot(p) ? L.yBack : -(L.rIn - L.gap - L.rim) * Math.cos(L.halfGroove);
    const shift = (rG - back) / 2;
    const mesh = (m: Manifold) => toMeshData(m.translate([0, shift, 0]));
    const parts: PartOutput[] = [];
    const warnings = [...L.warnings];
    if (withStand(p)) {
      // the flat stand's upright holder behind the picture, plugged into the curved foot
      const H = L.holder!;
      const S: HolderDims = { holderW: H.w, holderFront: H.front, holderBack: H.back, lampZ: H.lampZ, baseTop: L.baseTop };
      let foot = buildStandFoot(k, p, L, S);
      // text bent along the foot's curved front, as on the base
      const along = 2 * rG * Math.asin(Math.min(1, L.xHalf / rG)) - 8;
      const t = curvedText(k, p, 0, 0, rG, L.baseTop / 2, along, L.baseTop - 2);
      foot = applyFrontText(foot, t, warnings);
      parts.push({ id: 'base', mesh: mesh(foot), color: COLORS.base, explode: [0, 0, 0], printRotation: [0, 0, 0] });
      // printed on its back, the cup facing up
      parts.push({ id: 'holder', mesh: mesh(buildHolder(k, p, S)), color: COLORS.holder, explode: [0, 30, 40], printRotation: [-90, 0, 0] });
      if (t?.volume) parts.push({ id: 'text-base', object: 'base', extruder: 2, mesh: mesh(t.volume), color: COLORS.text, explode: [0, 0, 0], printRotation: [0, 0, 0] });
      // a puck light standing upright in the cup, its face a little in front of the holder
      const seat = num(p, 'holderDepth');
      const lampR = num(p, 'lampDiameter') / 2 - 2;
      const lampFront = H.front + seat - Math.min(16, seat + num(p, 'lampDistance') - 2);
      const lamp = cylY(k, 0, lampFront, H.front + seat, H.lampZ, lampR);
      parts.push({ id: 'lamp', mesh: mesh(lamp), color: COLORS.lamp, explode: [0, 30, 40], printRotation: [0, 0, 0], preview: true, ghost: true, light: [0, lampFront + shift, H.lampZ] });
    } else if (withBase(p)) {
      let base = buildBase(k, p, L);
      const P = L.power;
      let tray = P ? buildTray(k, p, L, P) : null;
      // text bent along the curved front of the base, or of the battery tray, as far round as it reaches
      const grow = POWER_WALL + powerFit(p);
      const tr = P ? rG + grow : rG;
      const along = 2 * tr * Math.asin(Math.min(1, (L.xHalf + (P ? grow : 0)) / tr)) - 8;
      const t = P ? curvedText(k, p, 0, 0, tr, powerTextZ(P), along, P.inner - 4) : curvedText(k, p, 0, 0, rG, L.baseTop / 2, along, L.baseTop - 2);
      if (tray) tray = applyFrontText(tray, t, warnings);
      else base = applyFrontText(base, t, warnings);
      parts.push({ id: 'base', mesh: mesh(base), color: COLORS.base, explode: [0, 0, 0], printRotation: [0, 0, 0] });
      if (tray) parts.push({ id: 'power', mesh: mesh(tray), color: COLORS.power, explode: [0, 0, -70], printRotation: [0, 0, 0] });
      if (t?.volume) parts.push({ id: 'text-base', object: tray ? 'power' : 'base', extruder: 2, mesh: mesh(t.volume), color: COLORS.text, explode: [0, 0, 0], printRotation: [0, 0, 0] });
    }
    else parts.push({ id: 'feet', mesh: mesh(buildFeet(k, L)), color: COLORS.base, explode: [0, 0, 0], printRotation: [0, 0, 0] });

    const zc = (L.panelBottom + L.panelTop) / 2;
    const slot: PanelSlot = { id: 'arc', width: L.width, height: L.height, thickness: L.thick, matrix: roundSlotMatrix(zc, shift), wrap: { radius: L.rIn, open: true } };
    const stand = sector(k, L.rIn, L.rOut, -L.half, L.half, L.panelBottom, L.panelTop);
    parts.push({ id: 'panel-arc', mesh: mesh(stand), color: COLORS.panel, explode: [0, 0, 60], printRotation: [0, 0, 0], preview: true, ghost: true });
    if (L.lampY !== null) {
      parts.push(puckLamp(k, p, L.lampY, L.baseTop, mesh));
    }

    const depth = back + rG;
    const info: Message[] = [
      { key: 'info.outer', vars: { x: round(L.power?.outerX ?? 2 * L.xHalf), y: round(L.power?.outerY ?? depth), z: round(L.panelTop + (L.power ? L.power.height - L.power.seat : 0)) } },
      { key: 'info.arc', vars: { w: round(L.width), h: round(L.height), t: L.thick, r: round(L.rOut), a: Math.round((2 * L.half * 180) / Math.PI) } },
    ];
    pushPowerInfo(info, L.power, p);
    return { parts, slots: [slot], warnings, info };
  },
};

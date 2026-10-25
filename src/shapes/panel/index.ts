// Flat panel: one lithophane, on its own, on an open stand, or at the front of a light box.
// The open stand is a foot with the picture in a groove at the front and an upright holder
// behind it whose cup holds a puck light facing the picture; the holder plugs into the foot.
// The light box is a base (lamp seat, steel disc, cable, text, like the box's) and a hood
// (side walls, back wall and top in one piece) that sits on a ledge round the base. The
// picture stands in a groove in the base and slides into grooves in the hood's front posts
// and top, so the hood holds it; the lamp light bounces round inside the hood onto it.
//
// Model space: millimetres, Z up, centred on x = 0, standing on z = 0, picture facing -Y.
import { bool, num, str, type ShapeDefinition } from '../../core/shape';
import type { BuildResult, Message, PanelSlot, ParamValues, PartOutput } from '../../core/types';
import { box, cylinder, prism, roundedRect, toMeshData, type Kernel, type Manifold } from '../../geometry/kernel';
import { ensureFont } from '../../geometry/text';
import { round } from '../box/layout';
import { cableCuts, cableSlot, frontText, lampCuts, slotMatrix, type CableSlot } from '../common/base';
import { PILLAR, POWER_FIT, POWER_LEDGE, POWER_WALL, powerLayout, powerTextZ, powerUnderside, rectTray, type PowerLayout } from '../common/power';
import { jointGeometry, jointLayout, type JointGeometry, type JointLayout, type LatchFace, type Socket } from '../common/lid';
import { lightBox, lightFrame, lightStand, panelGroups } from './params';
import { hangingLoop } from '../common/outlines';

const COLORS = { base: '#c9ccd3', power: '#9aa3b5', hood: '#e9a23b', holder: '#e9a23b', panel: '#fff4dc', lamp: '#8fb7ff', text: '#3b4150' };

/** Fit of the hood walls on the base ledge. */
const FIT = 0.3;
/** Material behind the picture's edges, so the posts hold it from both sides. */
const LIP = 2;
/** Top plate above the picture's groove. */
const TOP = 3;
/** Minimum printed wall round a closure's socket. */
const WALL = 1.2;
/** The corner blocks are this much larger than the posts: part of each is the hood wall. */
const BLOCK = 2;
/** Stand: foot beyond the picture on each side, and behind the holder. */
const SIDE = 3;
const BACK = 4;
/** Stand: notch in the holder's cup rim for the lamp's cable. */
const NOTCH = 8;
/** Stand: floor of the holder's socket in the foot. */
const SOCKET_FLOOR = 1.2;

export interface PanelLayout {
  outerX: number;
  outerY: number;
  totalHeight: number;
  panelW: number;
  panelH: number;
  thick: number;
  gap: number;
  engage: number;
  wall: number;
  /** Mid-plane of the picture (negative: towards the front). */
  planeY: number;
  /** Centre of the lamp seat along Y. */
  lampY: number;
  baseTop: number;
  /** Bottom of the hood walls, standing on the ledge round the base. */
  hoodBottom: number;
  panelBottom: number;
  panelTop: number;
  /** Underside of the hood's top plate. */
  topInner: number;
  top: number;
  /** Corner blocks inside the hood (behind the front posts, in the back corners): their size. */
  block: number;
  /** The hood's closure on the base: sizes, a socket in each corner block, latch faces on the side walls. */
  joint: JointLayout;
  sockets: Socket[];
  latches: LatchFace[];
  /** Battery tray under the base, as under the box. */
  power: PowerLayout | null;
  cable: CableSlot;
  warnings: Message[];
}

export function panelLayout(p: ParamValues): PanelLayout {
  const warnings: Message[] = [];
  const panelW = num(p, 'panelWidth');
  const panelH = num(p, 'panelHeight');
  const thick = num(p, 'panelThickness');
  const gap = num(p, 'slotClearance') / 2;
  const engage = num(p, 'slotEngage');
  const post = Math.max(num(p, 'postSize'), engage + 2);
  const inset = num(p, 'faceInset');
  const wall = num(p, 'wallThickness');
  const depth = num(p, 'lightDepth');
  const groove = num(p, 'baseGroove');

  const outerX = panelW + 2 * (post - engage);
  const outerY = inset + thick + 2 * gap + LIP + depth + wall;
  const planeY = -outerY / 2 + inset + thick / 2;
  const chamberFront = planeY + thick / 2 + gap + LIP;
  const chamberBack = outerY / 2 - wall;
  const lampY = (chamberFront + chamberBack) / 2;

  const baseTop = num(p, 'baseHeight');
  const panelBottom = baseTop - groove;
  const panelTop = panelBottom + panelH;
  const topInner = panelTop - groove;
  const top = panelTop + TOP;

  if (groove + num(p, 'lampSeatDepth') > baseTop - 1) warnings.push({ key: 'warn.baseTooThin' });
  // the lamp must fit between the picture's lip and the back wall, and between the side walls
  // (and between the corner blocks that hold the hood's closure)
  const block = post + BLOCK;
  const room = Math.min(chamberBack - chamberFront, outerX - 2 * (wall + FIT), outerX - 2 * block) - 2;
  if (num(p, 'lampDiameter') > room)
    warnings.push({ key: 'warn.lampTooBig', vars: { max: round(room) } });
  // the cable hole stops short of the back wall's ledge
  const cable = cableSlot(p, chamberBack - FIT - 1.5 - lampY, warnings);

  // The hood closes on the base like a lid on its posts: a socket in each corner block (whose
  // outer strip is the hood wall standing on the base's ledge), latch arms on the side walls.
  const hx = outerX / 2, hy = outerY / 2;
  const free = block - wall - FIT;
  const sx = hx - (block + wall + FIT) / 2;
  const ys = [chamberFront + block / 2, hy - (block + wall + FIT) / 2];
  const latchWidth = block - 2 * WALL;
  const hoodBottom = baseTop - groove;
  const joint = jointLayout(p, baseTop, free - 2 * WALL, post, latchWidth, warnings);
  // a latch arm hangs from the hood wall into a recess in the base's side: it must end above the floor
  if (joint.joint === 'latch' && hoodBottom - num(p, 'latchLength') - 1.5 < 0.6) warnings.push({ key: 'warn.noRoom' });
  const sockets: Socket[] = [], latches: LatchFace[] = [];
  for (const s of [1, -1])
    for (const y of ys) {
      sockets.push({ x: s * sx, y, rot: 0 });
      latches.push({ x: s * hx, y, nx: s, ny: 0, z: hoodBottom });
    }

  let power: PowerLayout | null = null;
  if (bool(p, 'powerBase')) {
    const grow = 2 * (POWER_WALL + POWER_FIT);
    const corner = (sx: number, sy: number): [number, number] => [sx * (outerX / 2 - PILLAR / 2 - 1), sy * (outerY / 2 - PILLAR / 2 - 1)];
    power = powerLayout(p, {
      size: [outerX + grow, outerY + grow],
      innerW: outerX - 2 * POWER_LEDGE,
      innerL: outerY - 2 * POWER_LEDGE,
      pillars: [corner(1, 1), corner(-1, 1), corner(-1, -1), corner(1, -1)],
      post,
      baseTop,
    }, warnings);
  }

  return {
    outerX, outerY, totalHeight: top, panelW, panelH, thick, gap, engage, wall, planeY, lampY,
    baseTop, hoodBottom, panelBottom, panelTop, topInner, top, block, joint, sockets, latches, power, cable, warnings,
  };
}

export interface StandLayout {
  outerX: number;
  outerY: number;
  totalHeight: number;
  panelW: number;
  panelH: number;
  thick: number;
  gap: number;
  planeY: number;
  baseTop: number;
  panelBottom: number;
  panelTop: number;
  holderW: number;
  /** Front face of the holder, where the cup opens towards the picture. */
  holderFront: number;
  holderBack: number;
  /** Centre height of the cup. */
  lampZ: number;
  holderTop: number;
  warnings: Message[];
}

export function standLayout(p: ParamValues): StandLayout {
  const warnings: Message[] = [];
  const panelW = num(p, 'panelWidth');
  const panelH = num(p, 'panelHeight');
  const thick = num(p, 'panelThickness');
  const gap = num(p, 'slotClearance') / 2;
  const inset = num(p, 'faceInset');
  const wall = num(p, 'wallThickness');
  const groove = num(p, 'baseGroove');
  const baseTop = num(p, 'baseHeight');
  const lampR = num(p, 'lampDiameter') / 2;
  // the cup floor also takes the steel disc recess
  const floor = bool(p, 'steelDisc') ? Math.max(wall, num(p, 'discDepth') + 1.2) : wall;

  const holderW = 2 * (lampR + wall);
  const outerX = Math.max(panelW + 2 * (SIDE + gap), holderW + 2 * SIDE);
  const outerY = inset + thick + 2 * gap + num(p, 'lampDistance') + num(p, 'holderDepth') + floor + BACK;
  const planeY = -outerY / 2 + inset + thick / 2;
  const holderFront = planeY + thick / 2 + gap + num(p, 'lampDistance');
  const holderBack = holderFront + num(p, 'holderDepth') + floor;

  const panelBottom = baseTop - groove;
  const panelTop = panelBottom + panelH;
  // the lamp faces the middle of the picture, but never lower than the holder allows
  const lampZ = Math.max((panelBottom + panelTop) / 2, baseTop + lampR + wall);
  const holderTop = lampZ + lampR + wall;

  if (groove > baseTop - 1 || baseTop < SOCKET_FLOOR + 3) warnings.push({ key: 'warn.baseTooThin' });

  return {
    outerX, outerY, totalHeight: Math.max(panelTop, holderTop), panelW, panelH, thick, gap, planeY, baseTop,
    panelBottom, panelTop, holderW, holderFront, holderBack, lampZ, holderTop, warnings,
  };
}

/** Cylinder along +Y from y0 to y1, centred on (x, z). */
function cylY(k: Kernel, x: number, y0: number, y1: number, z: number, r: number): Manifold {
  return cylinder(k, 0, 0, 0, y1 - y0, r).rotate([-90, 0, 0]).translate([x, y0, z]);
}

/** The holder's tenon, which sits in the socket in the foot. */
function tenon(k: Kernel, p: ParamValues, S: StandLayout, grow: number): Manifold {
  const w = S.holderW / 2 - num(p, 'wallThickness') + grow;
  return box(k, [-w, S.holderFront + 0.8 - grow, SOCKET_FLOOR - grow], [w, S.holderBack - 0.8 + grow, S.baseTop + (grow > 0 ? 1 : 0.01)]);
}

function buildStandFoot(k: Kernel, p: ParamValues, S: StandLayout): Manifold {
  const foot = prism(roundedRect(k, S.outerX, S.outerY, num(p, 'cornerRadius')), 0, S.baseTop);
  return foot.subtract(k.Manifold.union([standGroove(k, S), tenon(k, p, S, FIT / 2)]));
}

function standGroove(k: Kernel, S: StandLayout): Manifold {
  const g = S.gap;
  return box(k, [-S.panelW / 2 - g, S.planeY - S.thick / 2 - g, S.panelBottom - g], [S.panelW / 2 + g, S.planeY + S.thick / 2 + g, S.baseTop + 1]);
}

function buildHolder(k: Kernel, p: ParamValues, S: StandLayout): Manifold {
  const lampR = num(p, 'lampDiameter') / 2;
  const seat = num(p, 'holderDepth');
  const hw = S.holderW / 2;
  // upright post with a round top round the cup
  const post = box(k, [-hw, S.holderFront, S.baseTop], [hw, S.holderBack, S.lampZ]).add(cylY(k, 0, S.holderFront, S.holderBack, S.lampZ, hw));
  const cuts = [
    cylY(k, 0, S.holderFront - 1, S.holderFront + seat, S.lampZ, lampR),
    // the cable leaves the cup downwards
    box(k, [-NOTCH / 2, S.holderFront - 1, S.baseTop], [NOTCH / 2, S.holderFront + seat, S.lampZ]),
  ];
  if (bool(p, 'steelDisc')) cuts.push(cylY(k, 0, S.holderFront + seat - 0.01, S.holderFront + seat + num(p, 'discDepth'), S.lampZ, num(p, 'discDiameter') / 2 + 0.2));
  return post.add(tenon(k, p, S, 0)).subtract(k.Manifold.union(cuts));
}

/** The picture plus its clearance: the groove it slides into. */
function envelope(k: Kernel, L: PanelLayout): Manifold {
  const g = L.gap;
  return box(k, [-L.panelW / 2 - g, L.planeY - L.thick / 2 - g, L.panelBottom - g], [L.panelW / 2 + g, L.planeY + L.thick / 2 + g, L.panelTop + g]);
}

function footprint(k: Kernel, p: ParamValues, L: PanelLayout) {
  return roundedRect(k, L.outerX, L.outerY, num(p, 'cornerRadius'));
}

function buildBase(k: Kernel, p: ParamValues, L: PanelLayout, joint: JointGeometry): Manifold {
  const foot = footprint(k, p, L);
  const base = prism(foot, 0, L.baseTop);
  // ledge round the sides and back where the hood walls stand
  const keep = box(k, [-L.outerX / 2 + L.wall + FIT, -L.outerY / 2 - 1, L.hoodBottom - 1], [L.outerX / 2 - L.wall - FIT, L.outerY / 2 - L.wall - FIT, L.baseTop + 2]);
  const ledge = prism(foot, L.hoodBottom, L.baseTop + 1).subtract(keep);
  const cuts = [ledge, envelope(k, L), ...lampCuts(k, p, L.lampY, L.baseTop), ...cableCuts(k, p, L.cable, L.lampY, L.baseTop, L.outerY / 2), ...joint.bodyCuts];
  if (L.power) cuts.push(...powerUnderside(k, p, L.power));
  const body = joint.bodyAdds.length ? base.add(k.Manifold.union(joint.bodyAdds)) : base;
  return body.subtract(k.Manifold.union(cuts));
}

function buildHood(k: Kernel, p: ParamValues, L: PanelLayout, joint: JointGeometry): Manifold {
  const foot = footprint(k, p, L);
  const hx = L.outerX / 2, hy = L.outerY / 2;
  // side walls, back wall and top plate; open at the front and the bottom
  const shell = prism(foot, L.hoodBottom, L.top).subtract(box(k, [-hx + L.wall, -hy - 1, L.hoodBottom - 1], [hx - L.wall, hy - L.wall, L.topInner]));
  // front posts with the picture's side grooves, from the front face to behind the picture
  const postIn = L.panelW / 2 - L.engage;
  const postBack = L.planeY + L.thick / 2 + L.gap + LIP;
  const tall = prism(foot, L.baseTop, L.topInner + 0.01);
  const posts = [1, -1].map((s) => tall.intersect(box(k, [s > 0 ? postIn : -hx - 1, -hy - 1, L.baseTop - 1], [s > 0 ? hx + 1 : -postIn, postBack, L.topInner + 1])));
  // corner blocks for the closure: behind each front post and in the back corners
  const b = L.block;
  const blocks = [1, -1].flatMap((s) =>
    [[postBack - 0.01, postBack + b], [hy - b, hy + 1]].map(([y0, y1]) => tall.intersect(box(k, [s > 0 ? hx - b : -hx - 1, y0, L.baseTop - 1], [s > 0 ? hx + 1 : -hx + b, y1, L.topInner + 1]))),
  );
  let hood = k.Manifold.union([shell, ...posts, ...blocks]).subtract(envelope(k, L));
  if (joint.lidAdds.length) hood = hood.add(k.Manifold.union(joint.lidAdds));
  if (joint.lidCuts.length) hood = hood.subtract(k.Manifold.union(joint.lidCuts));
  return hood;
}

export const panelShape: ShapeDefinition = {
  id: 'panel',
  groups: panelGroups,
  presets: [
    { id: 'square', values: { panelWidth: 150, panelHeight: 150 } },
    { id: 'landscape', values: { panelWidth: 180, panelHeight: 120 } },
    { id: 'portrait', values: { panelWidth: 120, panelHeight: 180 } },
  ],
  validate: (p) => (lightBox(p) ? panelLayout(p).warnings : lightStand(p) ? standLayout(p).warnings : []),
  async prepare(p) {
    if ((lightBox(p) || lightStand(p)) && str(p, 'baseText').trim()) await ensureFont(str(p, 'textFont'));
  },
  build(k, p): BuildResult {
    const W = num(p, 'panelWidth'), H = num(p, 'panelHeight'), T = num(p, 'panelThickness');
    const panelInfo: Message = { key: 'info.panel', vars: { w: W, h: H, t: T } };

    if (lightStand(p)) return buildStand(k, p, panelInfo);
    if (lightFrame(p)) return buildFrame(k, p, panelInfo);
    if (!lightBox(p)) {
      // the lithophane on its own, standing on the ground
      const slot: PanelSlot = { id: 'front', width: W, height: H, thickness: T, matrix: slotMatrix([0, 0, H / 2], [1, 0, 0], [0, 0, 1], [0, -1, 0]) };
      const stand = box(k, [-W / 2, -T / 2, 0], [W / 2, T / 2, H]);
      const parts: PartOutput[] = [{ id: 'panel-front', mesh: toMeshData(stand), color: COLORS.panel, explode: [0, 0, 0], printRotation: [0, 0, 0], preview: true, ghost: true }];
      if (bool(p, 'loop')) {
        // printed with the picture as one object (standing, like the picture), in its panel space
        const ring = hangingLoop(k, { high: H / 2, low: H / 2 }, T, num(p, 'loopHole'));
        parts.push({ id: 'loop', object: 'litho-front', mesh: toMeshData(ring), matrix: slot.matrix, color: COLORS.panel, explode: [0, 0, 0], printRotation: [90, 0, 0] });
      }
      return { parts, slots: [slot], warnings: [], info: [panelInfo] };
    }

    const L = panelLayout(p);
    const warnings = [...L.warnings];
    const joint = jointGeometry(k, p, L.joint, L.sockets, L.latches);
    let base = buildBase(k, p, L, joint);
    const parts: PartOutput[] = [];

    // with a battery tray the base text goes on the tray's front, as on the box
    const P = L.power;
    const r = num(p, 'cornerRadius');
    let tray = P ? rectTray(k, p, L.outerX, L.outerY, P) : null;
    const text = P
      ? frontText(k, p, -P.outerY / 2, powerTextZ(P), P.outerX - 2 * (r + POWER_WALL + POWER_FIT) - 8, P.inner - 4)
      : frontText(k, p, -L.outerY / 2, L.baseTop / 2, L.outerX - 2 * r - 8, L.baseTop - 2);
    if (text?.shrunk) warnings.push({ key: 'warn.textShrunkBase' });
    if (tray) {
      if (text?.cut) tray = tray.subtract(text.cut);
      if (text?.add) tray = tray.add(text.add);
    } else {
      if (text?.cut) base = base.subtract(text.cut);
      if (text?.add) base = base.add(text.add);
    }

    parts.push(
      { id: 'base', mesh: toMeshData(base), color: COLORS.base, explode: [0, 0, 0], printRotation: [0, 0, 0] },
      // printed upside down: the top plate on the bed, the walls standing up
      { id: 'hood', mesh: toMeshData(buildHood(k, p, L, joint)), color: COLORS.hood, explode: [0, 0, 120], printRotation: [180, 0, 0] },
    );
    if (tray) parts.push({ id: 'power', mesh: toMeshData(tray), color: COLORS.power, explode: [0, 0, -70], printRotation: [0, 0, 0] });
    if (text?.volume) parts.push({ id: 'text-base', object: tray ? 'power' : 'base', extruder: 2, mesh: toMeshData(text.volume), color: COLORS.text, explode: [0, 0, 0], printRotation: [0, 0, 0] });

    const zc = (L.panelBottom + L.panelTop) / 2;
    const slot: PanelSlot = { id: 'front', width: W, height: H, thickness: T, matrix: slotMatrix([0, L.planeY, zc], [1, 0, 0], [0, 0, 1], [0, -1, 0]) };
    const stand = box(k, [-W / 2, L.planeY - T / 2, L.panelBottom], [W / 2, L.planeY + T / 2, L.panelTop]);
    parts.push({ id: 'panel-front', mesh: toMeshData(stand), color: COLORS.panel, explode: [0, -70, 0], printRotation: [0, 0, 0], preview: true, ghost: true });
    const lampR = num(p, 'lampDiameter') / 2 - 2;
    const lamp = cylinder(k, 0, L.lampY, L.baseTop - num(p, 'lampSeatDepth'), 30, lampR * 0.85, lampR);
    parts.push({ id: 'lamp', mesh: toMeshData(lamp), color: COLORS.lamp, explode: [0, 0, 20], printRotation: [0, 0, 0], preview: true, ghost: true });

    const info: Message[] = [
      { key: 'info.outer', vars: { x: round(P?.outerX ?? L.outerX), y: round(P?.outerY ?? L.outerY), z: round(L.totalHeight + (P ? P.height - P.seat : 0)) } },
      panelInfo,
    ];
    if (P) info.push({ key: 'info.power', vars: { t: round(P.inner - 1) } });
    if (P && str(p, 'powerJoint') === 'magnets') info.push({ key: 'info.powerMagnets', vars: { d: num(p, 'magnetDiameter'), h: num(p, 'magnetHeight') } });
    if (L.joint.magnetsFit) info.push({ key: 'info.magnets', vars: { n: 8, d: num(p, 'magnetDiameter'), h: num(p, 'magnetHeight') } });
    return { parts, slots: [slot], warnings, info };
  },
};

function buildStand(k: Kernel, p: ParamValues, panelInfo: Message): BuildResult {
  const S = standLayout(p);
  const warnings = [...S.warnings];
  const W = S.panelW, H = S.panelH, T = S.thick;
  let foot = buildStandFoot(k, p, S);
  // a battery tray under the foot, as under the light box; the base text then goes on its front
  let P: PowerLayout | null = null;
  if (bool(p, 'powerBase')) {
    const grow = 2 * (POWER_WALL + POWER_FIT);
    const corner = (sx: number, sy: number): [number, number] => [sx * (S.outerX / 2 - PILLAR / 2 - 1), sy * (S.outerY / 2 - PILLAR / 2 - 1)];
    P = powerLayout(p, {
      size: [S.outerX + grow, S.outerY + grow],
      innerW: S.outerX - 2 * POWER_LEDGE,
      innerL: S.outerY - 2 * POWER_LEDGE,
      pillars: [corner(1, 1), corner(-1, 1), corner(-1, -1), corner(1, -1)],
      post: PILLAR,
      baseTop: S.baseTop,
    }, warnings);
    foot = foot.subtract(k.Manifold.union(powerUnderside(k, p, P)));
  }
  const r = num(p, 'cornerRadius');
  let tray = P ? rectTray(k, p, S.outerX, S.outerY, P) : null;
  const text = P
    ? frontText(k, p, -P.outerY / 2, powerTextZ(P), P.outerX - 2 * (r + POWER_WALL + POWER_FIT) - 8, P.inner - 4)
    : frontText(k, p, -S.outerY / 2, S.baseTop / 2, S.outerX - 2 * r - 8, S.baseTop - 2);
  if (text?.shrunk) warnings.push({ key: 'warn.textShrunkBase' });
  if (tray) {
    if (text?.cut) tray = tray.subtract(text.cut);
    if (text?.add) tray = tray.add(text.add);
  } else {
    if (text?.cut) foot = foot.subtract(text.cut);
    if (text?.add) foot = foot.add(text.add);
  }

  const parts: PartOutput[] = [
    { id: 'base', mesh: toMeshData(foot), color: COLORS.base, explode: [0, 0, 0], printRotation: [0, 0, 0] },
    // printed on its back, the cup facing up
    { id: 'holder', mesh: toMeshData(buildHolder(k, p, S)), color: COLORS.holder, explode: [0, 30, 40], printRotation: [-90, 0, 0] },
  ];
  if (tray) parts.push({ id: 'power', mesh: toMeshData(tray), color: COLORS.power, explode: [0, 0, -70], printRotation: [0, 0, 0] });
  if (text?.volume) parts.push({ id: 'text-base', object: tray ? 'power' : 'base', extruder: 2, mesh: toMeshData(text.volume), color: COLORS.text, explode: [0, 0, 0], printRotation: [0, 0, 0] });

  const zc = (S.panelBottom + S.panelTop) / 2;
  const slot: PanelSlot = { id: 'front', width: W, height: H, thickness: T, matrix: slotMatrix([0, S.planeY, zc], [1, 0, 0], [0, 0, 1], [0, -1, 0]) };
  const stand = box(k, [-W / 2, S.planeY - T / 2, S.panelBottom], [W / 2, S.planeY + T / 2, S.panelTop]);
  parts.push({ id: 'panel-front', mesh: toMeshData(stand), color: COLORS.panel, explode: [0, -70, 0], printRotation: [0, 0, 0], preview: true, ghost: true });
  // a puck light in the cup, its face a little in front of the holder
  const seat = num(p, 'holderDepth');
  const lampR = num(p, 'lampDiameter') / 2 - 2;
  const lampFront = S.holderFront + seat - Math.min(16, seat + num(p, 'lampDistance') - 2);
  const lamp = cylY(k, 0, lampFront, S.holderFront + seat, S.lampZ, lampR);
  // the puck stands upright, so its light comes from its face, not its top
  parts.push({ id: 'lamp', mesh: toMeshData(lamp), color: COLORS.lamp, explode: [0, 30, 40], printRotation: [0, 0, 0], preview: true, ghost: true, light: [0, lampFront, S.lampZ] });

  const info: Message[] = [{ key: 'info.outer', vars: { x: round(P?.outerX ?? S.outerX), y: round(P?.outerY ?? S.outerY), z: round(S.totalHeight + (P ? P.height - P.seat : 0)) } }, panelInfo];
  if (P) info.push({ key: 'info.power', vars: { t: round(P.inner - 1) } });
  if (P && str(p, 'powerJoint') === 'magnets') info.push({ key: 'info.powerMagnets', vars: { d: num(p, 'magnetDiameter'), h: num(p, 'magnetHeight') } });
  return { parts, slots: [slot], warnings, info };
}

/** LED strip frame: lip over the picture's margin at the front, walls round the back. */
const FRAME_LIP = 2;
const FRAME_LIP_OVER = 3;
const FRAME_BACK = 2.4;
const FRAME_INSERT = 2;
const FRAME_FIT = 0.2;
/** Foot: height, groove depth, how far it reaches in front of and behind the frame. */
const FOOT_H = 8;
const FOOT_GROOVE = 5;
const FOOT_REACH = 20;

/**
 * A slim frame lit by an LED strip: the picture goes in from the back against the front lip; a
 * back plate's insert presses it there and carries the strip in a groove round its inside, with
 * a notch for the cable at the bottom and keyholes to hang it. On an optional foot.
 */
function buildFrame(k: Kernel, p: ParamValues, panelInfo: Message): BuildResult {
  const W = num(p, 'panelWidth'), H = num(p, 'panelHeight'), T = num(p, 'panelThickness');
  const g = num(p, 'slotClearance') / 2;
  const rim = num(p, 'frameRim'), D = num(p, 'frameDepth'), strip = num(p, 'stripWidth');
  const foot = bool(p, 'frameFoot');
  const Wo = W + 2 * rim, Ho = H + 2 * rim;
  const z0 = foot ? FOOT_H - FOOT_GROOVE : 0;
  const zc = z0 + Ho / 2;
  // y: the frame's front at y0, its back (where the back plate starts) at y1
  const y0 = -D / 2, y1 = D / 2 - FRAME_BACK;
  const yPic = y0 + FRAME_LIP + g + T / 2;
  const cav = (grow: number, ya: number, yb: number) => box(k, [-W / 2 - g - grow, ya, zc - H / 2 - g - grow], [W / 2 + g + grow, yb, zc + H / 2 + g + grow]);
  const outer = box(k, [-Wo / 2, y0, z0], [Wo / 2, y1, z0 + Ho]);
  // the window in front, the room for the picture and the insert behind
  const window = box(k, [-W / 2 + FRAME_LIP_OVER, y0 - 1, zc - H / 2 + FRAME_LIP_OVER], [W / 2 - FRAME_LIP_OVER, y0 + FRAME_LIP + 0.01, zc + H / 2 - FRAME_LIP_OVER]);
  const frame = outer.subtract(window).subtract(cav(0, y0 + FRAME_LIP, y1 + 1));
  // the back plate and its insert, pressing the picture against the lip
  const insertFront = yPic + T / 2 + g;
  const plate = box(k, [-Wo / 2, y1, z0], [Wo / 2, y1 + FRAME_BACK, z0 + Ho]);
  const insert = cav(-FRAME_FIT, insertFront, y1 + 0.01).subtract(cav(-FRAME_FIT - FRAME_INSERT, insertFront - 1, y1 + 1));
  // the strip's groove round the insert's inside, half way between the picture and the plate
  const ym = (insertFront + y1) / 2;
  const groove = cav(-FRAME_FIT - FRAME_INSERT + 0.8, ym - strip / 2, ym + strip / 2).subtract(cav(-FRAME_FIT - FRAME_INSERT - 1, ym - strip, ym + strip));
  const cuts: Manifold[] = [groove];
  // the cable leaves at the bottom of the back
  cuts.push(box(k, [-6, ym - 3, zc - H / 2 - g - 1], [6, y1 + FRAME_BACK + 1, zc - H / 2 + 6]));
  if (bool(p, 'frameKeyholes'))
    for (const s of [-1, 1]) {
      // a round hole for the screw head, a slot above it the screw's neck slides up into
      const x = (s * Wo) / 4, z = z0 + Ho - rim - 15;
      cuts.push(cylY(k, x, y1 - 1, y1 + FRAME_BACK + 1, z, 4));
      cuts.push(box(k, [x - 2, y1 - 1, z], [x + 2, y1 + FRAME_BACK + 1, z + 8]).add(cylY(k, x, y1 - 1, y1 + FRAME_BACK + 1, z + 8, 2)));
    }
  const back = plate.add(insert).subtract(k.Manifold.union(cuts));
  const parts: PartOutput[] = [
    // the frame prints face down, the back plate flat on its back
    { id: 'frame', mesh: toMeshData(frame), color: COLORS.hood, explode: [0, 0, 0], printRotation: [90, 0, 0] },
    { id: 'back', mesh: toMeshData(back), color: COLORS.base, explode: [0, 90, 0], printRotation: [-90, 0, 0] },
  ];
  if (foot) {
    const fy0 = y0 - FOOT_REACH, fy1 = y1 + FRAME_BACK + FOOT_REACH;
    const block = prism(roundedRect(k, Wo + 2 * SIDE, fy1 - fy0, num(p, 'cornerRadius')), 0, FOOT_H).translate([0, (fy0 + fy1) / 2, 0]);
    const slotCut = box(k, [-Wo / 2 - g, y0 - g, z0], [Wo / 2 + g, y1 + FRAME_BACK + g, FOOT_H + 1]);
    parts.push({ id: 'foot', mesh: toMeshData(block.subtract(slotCut)), color: COLORS.base, explode: [0, 0, -30], printRotation: [0, 0, 0] });
  }
  const slot: PanelSlot = { id: 'front', width: W, height: H, thickness: T, matrix: slotMatrix([0, yPic, zc], [1, 0, 0], [0, 0, 1], [0, -1, 0]), explode: [0, 45, 0] };
  const stand = box(k, [-W / 2, yPic - T / 2, zc - H / 2], [W / 2, yPic + T / 2, zc + H / 2]);
  parts.push({ id: 'panel-front', mesh: toMeshData(stand), color: COLORS.panel, explode: [0, 45, 0], printRotation: [0, 0, 0], preview: true, ghost: true });
  const info: Message[] = [{ key: 'info.outer', vars: { x: round(Wo), y: round(D), z: round(z0 + Ho) } }, panelInfo, { key: 'info.frameStrip', vars: { l: round(2 * (W + H)) } }];
  return { parts, slots: [slot], warnings: [], info };
}


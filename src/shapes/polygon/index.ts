// Polygon lamp: the box with 3, 5, 6 or 8 flat sides. A body (polygon base plate and a post
// at every corner, printed as one) holds one flat lithophane per side in grooves; a polygon lid,
// open in the middle, holds their top edges and closes on the posts like the box's lid (any of
// the closures in common/lid.ts).
//
// Model space: millimetres, Z up, centred on x = y = 0, standing on z = 0. Side 1 faces -Y
// (the front), the others follow anticlockwise seen from above. The cable leaves towards +Y.
import { bool, num, str, type ShapeDefinition } from '../../core/shape';
import type { BuildResult, Message, PanelSlot, ParamValues, PartOutput } from '../../core/types';
import { box, cylinder, prism, toMeshData, type CrossSection, type Kernel, type Manifold } from '../../geometry/kernel';
import { round } from '../box/layout';
import { cableCuts, cableSlot, frontText, lampCuts, lidText, slotMatrix, type CableSlot } from '../common/base';
import { ensureFont } from '../../geometry/text';
import { buildPowerTray, PILLAR, POWER_FIT, POWER_LEDGE, POWER_WALL, powerLayout, powerTextZ, powerUnderside, type PowerLayout } from '../common/power';
import { jointGeometry, jointLayout, type JointGeometry, type JointLayout, type LatchFace, type Socket } from '../common/lid';
import { polygonGroups } from './params';

const COLORS = { body: '#c9ccd3', lid: '#e9a23b', power: '#9aa3b5', panel: '#fff4dc', lamp: '#8fb7ff', text: '#3b4150' };

const WALL = 1.2; // minimum printed wall around grooves and magnet pockets
/** The lid reaches this far in over the pictures' inner face; the rest of the top is open. */
const LID_LEDGE = 3;
const BIG = 2000;

export interface PolygonLayout {
  n: number;
  /** Half the angle between two neighbouring sides' normals. */
  phi: number;
  panelW: number;
  panelH: number;
  thick: number;
  gap: number;
  engage: number;
  post: number;
  /** Distance from the centre to each picture's mid-plane, and to the outside faces. */
  plane: number;
  apothem: number;
  baseTop: number;
  panelBottom: number;
  panelTop: number;
  lidBottom: number;
  lidTop: number;
  /** Picture on top of the lid: the apothem of its polygon (inside the side pictures' grooves); 0 = none. */
  topR: number;
  /** The closure: its sizes, each post's socket (on the corner's bisector) and latch face. */
  joint: JointLayout;
  sockets: Socket[];
  latches: LatchFace[];
  /** Footprint size along X and Y, and how far it reaches towards +Y (the cable side). */
  sizeX: number;
  sizeY: number;
  backY: number;
  cable: CableSlot;
  /** Battery tray underneath; its outside is the outline grown by `POWER_WALL + POWER_FIT`. */
  power: PowerLayout | null;
  warnings: Message[];
}

/** Outward normal angle of side i (radians); side 0 faces -Y. */
export const sideAngle = (i: number, n: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;

export function polygonLayout(p: ParamValues): PolygonLayout {
  const warnings: Message[] = [];
  const n = Number(p.sides) || 6;
  const phi = Math.PI / n;
  const panelW = num(p, 'panelWidth');
  const panelH = num(p, 'panelHeight');
  const thick = num(p, 'panelThickness');
  const gap = num(p, 'slotClearance') / 2;
  const engage = num(p, 'slotEngage');
  const post = num(p, 'postSize');
  const inset = num(p, 'faceInset');

  // Each side is as long as its picture plus a post on each end (measured at the mid-plane),
  // as on the box; and never so short that two neighbouring grooves cut into each other.
  const r = num(p, 'cornerRadius');
  const geo = (post: number) => {
    const byPosts = (panelW / 2 + post - engage) / Math.tan(phi);
    const byGrooves = thick / 2 + gap + (panelW / 2 + gap) / Math.tan(phi) + WALL / (1 - Math.cos(2 * phi));
    const plane = Math.max(byPosts, byGrooves);
    const apothem = plane + thick / 2 + inset;
    // Each post's socket (plug, magnet, peg) sits on the corner's bisector where the post has
    // the most room: away from the groove's end, the outside faces and the post's inner side.
    const room = (d: number) => Math.min(d * Math.sin(phi) - (panelW / 2 + gap), apothem - d * Math.cos(phi), d * Math.cos(phi) - (apothem - post));
    let socketR = 0;
    for (let i = 0, r0 = 0, r1 = apothem / Math.cos(phi); i < 60; i++) {
      // golden-section search: room() rises, then falls along the bisector
      const a = r1 - (r1 - r0) * 0.618, b = r0 + (r1 - r0) * 0.618;
      if (room(a) < room(b)) r0 = a;
      else r1 = b;
      socketR = (r0 + r1) / 2;
    }
    // a square turned along the bisector fits inside the circle of that room, less a wall
    const socketTop = Math.max(0, Math.SQRT2 * (room(socketR) - WALL));
    // latch arms on the outer face of each corner's first side, past the groove, before the corner
    const t0 = panelW / 2 + gap + WALL, t1 = apothem * Math.tan(phi) - Math.max(r, WALL);
    return { plane, apothem, socketR, socketTop, t0, t1 };
  };
  const { plane, apothem, socketR, socketTop, t0, t1 } = geo(post);

  const baseTop = num(p, 'baseHeight');
  const panelBottom = baseTop - num(p, 'baseGroove');
  const panelTop = panelBottom + panelH;
  const lidGroove = num(p, 'lidGroove');
  const lidBottom = panelTop - lidGroove;
  const lidTop = lidBottom + num(p, 'lidThickness');
  if (num(p, 'baseGroove') + num(p, 'lampSeatDepth') > baseTop - 1) warnings.push({ key: 'warn.baseTooThin' });
  if (lidGroove + 0.6 > num(p, 'lidThickness')) warnings.push({ key: 'warn.lidTooThin' });
  // the top picture's rebate stays a wall inside the side pictures' grooves, as on the box
  const topR = bool(p, 'topPanel') ? Math.max(0, plane - thick / 2 - 2 * gap - WALL) : 0;
  if (topR && thick + 0.2 + 1.2 > num(p, 'lidThickness')) warnings.push({ key: 'warn.lidTooThin' });

  const joint = jointLayout(p, lidBottom, socketTop, post, t1 - t0 - 0.6, warnings);
  // the box's suggestion assumes the socket grows as fast as the post; round a polygon's
  // corner it grows slower, so find the post size that really fits
  const tight = warnings.find((w) => w.key === 'warn.magnetNoFit');
  if (tight) {
    let need = post;
    while (need < post + 60) {
      need += 0.5;
      const g = geo(need);
      if (jointLayout(p, lidBottom, g.socketTop, need, g.t1 - g.t0 - 0.6, []).magnetsFit) break;
    }
    tight.vars = { post: need };
  }
  const sockets: Socket[] = [], latches: LatchFace[] = [];
  for (let i = 0; i < n; i++) {
    const c = sideAngle(i, n) + phi, a = sideAngle(i, n);
    sockets.push({ x: socketR * Math.cos(c), y: socketR * Math.sin(c), rot: (c * 180) / Math.PI });
    const tm = (t0 + t1) / 2;
    latches.push({ x: apothem * Math.cos(a) - tm * Math.sin(a), y: apothem * Math.sin(a) + tm * Math.cos(a), nx: Math.cos(a), ny: Math.sin(a) });
  }

  const corner = apothem / Math.cos(phi);
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = sideAngle(i, n) + phi;
    xs.push(corner * Math.cos(a));
    ys.push(corner * Math.sin(a));
  }
  const sizeX = Math.max(...xs) - Math.min(...xs), sizeY = Math.max(...ys) - Math.min(...ys);

  // inside the grooves: the circle the lamp and the cable hole must stay in
  const inner = plane - thick / 2 - gap;
  const cable = cableSlot(p, inner - 1.5, warnings);
  if (num(p, 'lampDiameter') > 2 * inner - 2) warnings.push({ key: 'warn.lampTooBig', vars: { max: round(2 * inner - 2) } });
  // battery tray: the same polygon grown by the tray's wall, a square pillar in each corner
  let power: PowerLayout | null = null;
  if (bool(p, 'powerBase')) {
    const grow = (POWER_WALL + POWER_FIT) / apothem;
    const open = apothem - POWER_LEDGE;
    const h = PILLAR / 2;
    // on the corner's bisector, turned with it, 1 mm inside the outline
    const pr = (apothem - 1 - h * (Math.cos(phi) + Math.sin(phi))) / Math.cos(phi);
    const pillars: [number, number][] = [], rots: number[] = [];
    for (let i = 0; i < n; i++) {
      const c = sideAngle(i, n) + phi;
      const at: [number, number] = [pr * Math.cos(c), pr * Math.sin(c)];
      // a corner at the back (odd sides) would block the charging slot
      if (bool(p, 'chargeSlot') && at[1] > 0 && Math.abs(at[0]) < 7 + h * Math.SQRT2) continue;
      pillars.push(at);
      rots.push((c * 180) / Math.PI);
    }
    power = powerLayout(p, {
      size: [sizeX * (1 + grow), sizeY * (1 + grow)],
      innerW: 2 * open * Math.tan(phi),
      innerL: open + (Math.max(...ys) * open) / apothem,
      pillars,
      pillarRot: rots,
      post,
      baseTop,
    }, warnings);
  }
  const bed = num(p, 'bedSize');
  const widest = Math.max(sizeX, sizeY, power ? Math.max(power.outerX, power.outerY) : 0);
  if (widest > bed) warnings.push({ key: 'warn.bed', vars: { size: round(widest), bed } });

  return { n, phi, panelW, panelH, thick, gap, engage, post, plane, apothem, baseTop, panelBottom, panelTop, lidBottom, lidTop, topR, joint, sockets, latches, sizeX, sizeY, backY: Math.max(...ys), cable, power, warnings };
}

/** Regular polygon outline whose sides face the sides' normals, `apothem` from the centre. */
function outline(k: Kernel, L: PolygonLayout, apothem: number, r = 0): CrossSection {
  const corner = apothem / Math.cos(L.phi);
  const pts: [number, number][] = [];
  for (let i = 0; i < L.n; i++) {
    const a = sideAngle(i, L.n) + L.phi;
    pts.push([corner * Math.cos(a), corner * Math.sin(a)]);
  }
  const cs = new k.CrossSection([pts]);
  return r > 0 ? cs.offset(-r, 'Miter').offset(r, 'Round') : cs;
}

/** Everything on the far side of a line: points whose projection on direction `angle` is at least `d`. */
function halfSpace(k: Kernel, angle: number, d: number, z0: number, z1: number): Manifold {
  return box(k, [d, -BIG, z0], [d + BIG, BIG, z1]).rotate([0, 0, (angle * 180) / Math.PI]);
}

/** A box in side i's frame (x along the side, y out of it), centred on the side's mid-plane. */
function onSide(k: Kernel, L: PolygonLayout, i: number, w: number, t: number, z0: number, z1: number, out = L.plane): Manifold {
  const a = sideAngle(i, L.n);
  return box(k, [-w / 2, -t / 2, z0], [w / 2, t / 2, z1])
    .rotate([0, 0, (a * 180) / Math.PI + 90])
    .translate([out * Math.cos(a), out * Math.sin(a), 0]);
}

/** The grooves the pictures stand in, from below the picture up to `z1`. */
function grooves(k: Kernel, L: PolygonLayout, z1: number): Manifold[] {
  const g = L.gap;
  return Array.from({ length: L.n }, (_, i) => onSide(k, L, i, L.panelW + 2 * g, L.thick + 2 * g, L.panelBottom - g, z1));
}

function buildBody(k: Kernel, p: ParamValues, L: PolygonLayout, joint: JointGeometry): Manifold {
  const r = num(p, 'cornerRadius');
  const foot = outline(k, L, L.apothem, r);
  const base = prism(foot, 0, L.baseTop);
  // a post at each corner: past the picture's end on both sides, `post` deep from the outside
  const tall = prism(foot, L.baseTop - 0.01, L.lidBottom);
  const t0 = L.panelW / 2 - L.engage;
  const posts = Array.from({ length: L.n }, (_, i) => {
    const a = sideAngle(i, L.n), b = sideAngle(i + 1, L.n);
    const cut = [
      halfSpace(k, a + Math.PI / 2, t0, -1, L.lidBottom + 1),
      halfSpace(k, b - Math.PI / 2, t0, -1, L.lidBottom + 1),
      halfSpace(k, a, L.apothem - L.post, -1, L.lidBottom + 1),
      halfSpace(k, b, L.apothem - L.post, -1, L.lidBottom + 1),
    ];
    return cut.reduce((m, h) => m.intersect(h), tall);
  });
  const cuts = [
    ...grooves(k, L, L.panelTop + 1),
    ...lampCuts(k, p, 0, L.baseTop),
    ...cableCuts(k, p, L.cable, 0, L.baseTop, L.backY),
    ...joint.bodyCuts,
    ...(L.power ? powerUnderside(k, p, L.power) : []),
  ];
  return k.Manifold.union([base, ...posts, ...joint.bodyAdds]).subtract(k.Manifold.union(cuts));
}

/** The battery tray: the polygon grown by its wall, standing in its rim, open inside. */
function buildTray(k: Kernel, p: ParamValues, L: PolygonLayout, P: PowerLayout): Manifold {
  const r = num(p, 'cornerRadius');
  const grow = POWER_WALL + POWER_FIT;
  const scale = (a: number) => (L.backY * a) / L.apothem;
  return buildPowerTray(k, p, P, {
    outer: outline(k, L, L.apothem + grow, r + grow),
    pocket: outline(k, L, L.apothem + POWER_FIT, r + POWER_FIT),
    open: outline(k, L, L.apothem - POWER_LEDGE, Math.max(1, r - 2)),
    front: -(L.apothem + grow),
    back: scale(L.apothem + grow),
    innerBack: scale(L.apothem - POWER_LEDGE),
    clip: true,
  });
}

/** The lid's open middle: a polygon this far from the centre (a ledge over the pictures' inner face). */
const lidOpening = (L: PolygonLayout) => L.plane - L.thick / 2 - L.gap - LID_LEDGE;

function buildLid(k: Kernel, p: ParamValues, L: PolygonLayout, joint: JointGeometry): Manifold {
  const r = num(p, 'cornerRadius');
  let lid = prism(outline(k, L, L.apothem, r), L.lidBottom, L.lidTop);
  const cuts = [...grooves(k, L, L.panelTop + L.gap + 0.3)];
  if (L.topR) {
    // a rebate the top picture lies in (sharp corners, like the picture), on a ledge round the opening
    cuts.push(prism(outline(k, L, L.topR + L.gap), L.lidTop - (L.thick + 0.2), L.lidTop + 1));
    cuts.push(prism(outline(k, L, L.topR - num(p, 'topLedge'), 1), L.lidBottom - 1, L.lidTop + 1));
  } else cuts.push(prism(outline(k, L, lidOpening(L), Math.max(1, r - 2)), L.lidBottom - 1, L.lidTop + 1));
  lid = lid.subtract(k.Manifold.union(cuts));
  if (joint.lidAdds.length) lid = lid.add(k.Manifold.union(joint.lidAdds));
  if (joint.lidCuts.length) lid = lid.subtract(k.Manifold.union(joint.lidCuts));
  return lid;
}

/** The picture on top: a polygon like the lamp's, centred in its bounding box (odd sides are taller one way). */
function topSlot(L: PolygonLayout): PanelSlot {
  const R = L.topR / Math.cos(L.phi);
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < L.n; i++) {
    const a = sideAngle(i, L.n) + L.phi;
    xs.push(R * Math.cos(a));
    ys.push(R * Math.sin(a));
  }
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return {
    id: 'top',
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    thickness: L.thick,
    matrix: slotMatrix([0, cy, L.lidTop - 0.2 - L.thick / 2], [1, 0, 0], [0, 1, 0], [0, 0, 1]),
    outline: { radius: L.topR, sides: L.n, cy: -cy },
  };
}

function panelSlots(L: PolygonLayout): PanelSlot[] {
  const zc = (L.panelBottom + L.panelTop) / 2;
  return Array.from({ length: L.n }, (_, i) => {
    const a = sideAngle(i, L.n);
    const nx = Math.cos(a), ny = Math.sin(a);
    // picture x runs along the side (left to right seen from outside), y up, z out
    return { id: `side${i + 1}`, width: L.panelW, height: L.panelH, thickness: L.thick, matrix: slotMatrix([L.plane * nx, L.plane * ny, zc], [-ny, nx, 0], [0, 0, 1], [nx, ny, 0]) };
  });
}

export const polygonShape: ShapeDefinition = {
  id: 'polygon',
  groups: polygonGroups,
  presets: [
    { id: 'small', values: { sides: '6', panelWidth: 60, panelHeight: 80 } },
    { id: 'medium', values: { sides: '6', panelWidth: 80, panelHeight: 100 } },
    { id: 'lantern', values: { sides: '8', panelWidth: 70, panelHeight: 150 } },
  ],
  validate: (p) => polygonLayout(p).warnings,
  async prepare(p) {
    if (str(p, 'baseText').trim() || str(p, 'topText').trim()) await ensureFont(str(p, 'textFont'));
  },
  build(k, p): BuildResult {
    const L = polygonLayout(p);
    const warnings = [...L.warnings];
    const joint = jointGeometry(k, p, L.joint, L.sockets, L.latches);
    const r = num(p, 'cornerRadius');
    let body = buildBody(k, p, L, joint), lid = buildLid(k, p, L, joint);
    // base text on the front side; lid text on the front strip of the lid's ring
    const side = (apothem: number) => 2 * apothem * Math.tan(L.phi);
    // (with a battery tray, the base text goes on the tray's front, as on the box)
    const P = L.power;
    const trayA = L.apothem + POWER_WALL + POWER_FIT;
    let tray = P ? buildTray(k, p, L, P) : null;
    const base = P
      ? frontText(k, p, -trayA, powerTextZ(P), side(trayA) - 2 * (r + POWER_WALL + POWER_FIT) - 8, P.inner - 4)
      : frontText(k, p, -L.apothem, L.baseTop / 2, side(L.apothem) - 2 * r - 8, L.baseTop - 2);
    if (base?.shrunk) warnings.push({ key: 'warn.textShrunkBase' });
    if (tray) {
      if (base?.cut) tray = tray.subtract(base.cut);
      if (base?.add) tray = tray.add(base.add);
    } else {
      if (base?.cut) body = body.subtract(base.cut);
      if (base?.add) body = body.add(base.add);
    }
    // (round the top picture's rebate when there is one)
    const open = L.topR ? L.topR + L.gap : lidOpening(L);
    const mid = (L.apothem + open) / 2;
    const top = lidText(k, p, L.lidTop, side(mid) - 8, L.apothem - open - 2, (m) => m.translate([0, -mid, 0]));
    if (top?.shrunk) warnings.push({ key: 'warn.textShrunkTop' });
    if (top) lid = lid.subtract(top.cut);
    const parts: PartOutput[] = [
      { id: 'body', mesh: toMeshData(body), color: COLORS.body, explode: [0, 0, 0], printRotation: [0, 0, 0] },
      // solid like the box's lid: infill patterns would cast shadows
      { id: 'lid', mesh: toMeshData(lid), color: COLORS.lid, explode: [0, 0, 130], printRotation: [180, 0, 0], slicer: { sparse_infill_density: '100%' } },
    ];
    if (tray) parts.push({ id: 'power', mesh: toMeshData(tray), color: COLORS.power, explode: [0, 0, -70], printRotation: [0, 0, 0] });
    if (base?.volume) parts.push({ id: 'text-base', object: tray ? 'power' : 'body', extruder: 2, mesh: toMeshData(base.volume), color: COLORS.text, explode: [0, 0, 0], printRotation: [0, 0, 0] });
    if (top?.volume) parts.push({ id: 'text-top', object: 'lid', extruder: 2, mesh: toMeshData(top.volume), color: COLORS.text, explode: [0, 0, 130], printRotation: [180, 0, 0] });
    const slots = panelSlots(L);
    if (L.topR) slots.push(topSlot(L));
    const zc = (L.panelBottom + L.panelTop) / 2;
    slots.slice(0, L.n).forEach((s, i) => {
      const a = sideAngle(i, L.n);
      const stand = onSide(k, L, i, L.panelW, L.thick, zc - L.panelH / 2, zc + L.panelH / 2);
      parts.push({ id: `panel-${s.id}`, mesh: toMeshData(stand), color: COLORS.panel, explode: [Math.cos(a) * 70, Math.sin(a) * 70, 0], printRotation: [0, 0, 0], preview: true, ghost: true });
    });
    if (L.topR) {
      const z1 = L.lidTop - 0.2;
      const stand = prism(outline(k, L, L.topR), z1 - L.thick, z1);
      parts.push({ id: 'panel-top', mesh: toMeshData(stand), color: COLORS.panel, explode: [0, 0, 110], printRotation: [0, 0, 0], preview: true, ghost: true });
    }
    const lampR = num(p, 'lampDiameter') / 2 - 2;
    const lamp = cylinder(k, 0, 0, L.baseTop - num(p, 'lampSeatDepth'), 30, lampR * 0.85, lampR);
    parts.push({ id: 'lamp', mesh: toMeshData(lamp), color: COLORS.lamp, explode: [0, 0, 20], printRotation: [0, 0, 0], preview: true, ghost: true });

    const info: Message[] = [
      { key: 'info.outer', vars: { x: round(L.power?.outerX ?? L.sizeX), y: round(L.power?.outerY ?? L.sizeY), z: round(L.lidTop + (L.power ? L.power.height - L.power.seat : 0)) } },
      { key: 'info.polygon', vars: { n: L.n, w: L.panelW, h: L.panelH, t: L.thick, f: round(2 * L.apothem), c: round((2 * L.apothem) / Math.cos(L.phi)) } },
    ];
    if (L.joint.magnetsFit) info.push({ key: 'info.magnets', vars: { n: 2 * L.n, d: num(p, 'magnetDiameter'), h: num(p, 'magnetHeight') } });
    if (L.power) info.push({ key: 'info.power', vars: { t: round(L.power.inner - 1) } });
    if (L.power && str(p, 'powerJoint') === 'magnets') info.push({ key: 'info.powerMagnets', vars: { d: num(p, 'magnetDiameter'), h: num(p, 'magnetHeight') } });
    return { parts, slots, warnings, info };
  },
};

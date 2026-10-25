// Power base for every shape with a base: an open tray for a battery or power bank, like the
// box's original. The shape stands in the tray's rim on a ledge and on corner pillars; the bank
// lies inside; the shape closes it. Built with its top at z = seat, so the shape (bottom at
// z = 0) stands in it.
//
// A shape gives its outlines (the tray's outside, the pocket it stands in, the open inside),
// the pillar centres, and where the tray's front and back are; the rest is shared.
import { bool, num, str } from '../../core/shape';
import type { Message, ParamValues } from '../../core/types';
import { box, cylinder, prism, roundedRect, squareFrustum, type CrossSection, type Kernel, type Manifold } from '../../geometry/kernel';
import { magnetH, magnetR, pegHeight } from './lid';

export const POWER_WALL = 2.4; // wall of the power base around the shape
export const POWER_FIT = 0.3; // gap between the shape and the power base pocket
export const POWER_LEDGE = 2.5; // ledge inside the power base rim that the shape rests on
export const PILLAR = 12; // pillars the shape rests on

const round = (v: number) => Math.round(v * 10) / 10;

export interface PowerLayout {
  /** Size of the tray's footprint. */
  outerX: number;
  outerY: number;
  height: number;
  /** Depth of the rim pocket the shape stands in (top of the tray is at z = seat). */
  seat: number;
  floor: number;
  /** Free height inside, from the floor up to the shape's underside (z = 0). */
  inner: number;
  /** Wall thickness below the shape: outer wall plus the ledge it rests on. */
  wallT: number;
  /** Pillar centres; magnets or pegs sit on top. */
  pillars: [number, number][];
  /** Turn of each pillar about Z (degrees; 0 = square to the axes). */
  pillarRot: number[];
  pillar: number;
  /** Guide rails for one power bank (advanced): bank size including clearance. */
  pocket: { w: number; l: number } | null;
  /** Switch cut-out on the front wall: shape, size, x offset; null when there is none. */
  switch: { type: 'rocker' | 'slide' | 'round'; w: number; h: number; x: number } | null;
}

/**
 * The tray's sizes and warnings. `size` is its footprint; `innerW` the free width inside along
 * the front wall and `innerL` the free depth inside along the middle (for the switch and the
 * bank); `post` names the post size in the magnet warning.
 */
export function powerLayout(
  p: ParamValues,
  shape: { size: [number, number]; innerW: number; innerL: number; pillars: [number, number][]; pillarRot?: number[]; post: number; baseTop: number },
  warnings: Message[],
): PowerLayout {
  const floor = 2;
  const inner = num(p, 'powerHeight');
  // the shape stands this deep in the tray rim; deeper than the cable channel under the
  // shape, so the channel's notch at the back is hidden (the cable comes up from below)
  const seat = Math.max(4, bool(p, 'cableChannel') ? Math.min(num(p, 'cableChannelDepth'), shape.baseTop - 1) + 1.5 : 0);
  const P: PowerLayout = {
    outerX: shape.size[0],
    outerY: shape.size[1],
    height: floor + inner + seat,
    seat,
    floor,
    inner,
    wallT: POWER_WALL + POWER_FIT + POWER_LEDGE,
    pillars: shape.pillars,
    pillarRot: shape.pillarRot ?? shape.pillars.map(() => 0),
    pillar: PILLAR,
    pocket: null,
    switch: null,
  };
  const { innerW, innerL } = shape;
  if (bool(p, 'bankPocket')) {
    const c = num(p, 'bankClearance');
    P.pocket = { w: num(p, 'bankWidth') + c, l: num(p, 'bankLength') + c };
    // rails must stay clear of the corner pillars
    if (P.pocket.w + 4 > innerW - 2 * PILLAR || P.pocket.l > innerL)
      warnings.push({ key: 'warn.bankTooBig', vars: { w: round(innerW - 2 * PILLAR - 4 - c), l: round(innerL - c) } });
  }
  const magnetPocket = num(p, 'magnetDiameter') + 2 * num(p, 'magnetClearance');
  if (str(p, 'powerJoint') === 'magnets' && magnetPocket + 2 * 1.2 > PILLAR) warnings.push({ key: 'warn.magnetNoFit', vars: { post: round(shape.post) } });
  const st = str(p, 'switchType');
  if (st === 'rocker' || st === 'slide' || st === 'round') {
    const [w, h] =
      st === 'rocker' ? [num(p, 'switchWidth'), num(p, 'switchHeight')]
      : st === 'slide' ? [num(p, 'slideWidth'), num(p, 'slideHeight')]
      : [num(p, 'buttonDiameter'), num(p, 'buttonDiameter')];
    P.switch = { type: st, w, h, x: num(p, 'switchOffset') };
    // screws of a slide switch sit beside the cut-out
    const span = st === 'slide' ? Math.max(w, num(p, 'slideScrewPitch') + 3) : w;
    if (h + 4 > inner || Math.abs(P.switch.x) + span / 2 + 3 > innerW / 2 - PILLAR) warnings.push({ key: 'warn.switchNoFit' });
    if (P.pocket && innerL - P.pocket.l < 22) warnings.push({ key: 'warn.switchBank', vars: { l: round(innerL - 22 - num(p, 'bankClearance')) } });
    if (bool(p, 'ledWindow') && Math.abs(P.switch.x - num(p, 'ledWindowOffset')) < (span + num(p, 'ledWindowWidth')) / 2 + 2)
      warnings.push({ key: 'warn.switchLed' });
  }
  if (bool(p, 'ledWindow') && (num(p, 'ledWindowHeight') + 4 > inner || Math.abs(num(p, 'ledWindowOffset')) + num(p, 'ledWindowWidth') / 2 > innerW / 2 - PILLAR))
    warnings.push({ key: 'warn.ledNoFit' });
  return P;
}

/** A pillar: a square turned `rot` degrees about its centre. */
function pillarSolid(k: Kernel, x: number, y: number, rot: number, h: number, z0: number, z1: number): Manifold {
  const m = box(k, [x - h, y - h, z0], [x + h, y + h, z1]);
  return rot ? m.translate([-x, -y, 0]).rotate([0, 0, rot]).translate([x, y, 0]) : m;
}

/**
 * The tray. `outer`, `pocket` and `open` are the outlines of its outside, of the rim pocket
 * the shape stands in, and of the open inside above the floor; `front` and `back` the y of the
 * front and back walls' outside, `innerBack` the inside of the back wall (where a bank's rails
 * start). With `clip` the pillars are trimmed to the tray (round and odd outlines).
 */
export function buildPowerTray(
  k: Kernel,
  p: ParamValues,
  P: PowerLayout,
  o: { outer: CrossSection; pocket: CrossSection; open: CrossSection; front: number; back: number; innerBack: number; clip?: boolean },
): Manifold {
  const z0 = P.seat - P.height;
  const zFloor = z0 + P.floor;
  let tray = prism(o.outer, z0, P.seat);
  const cuts: Manifold[] = [
    // rim pocket the shape stands in
    prism(o.pocket, 0, P.seat + 1),
    // open inside, leaving a ledge under the shape's edge
    prism(o.open, zFloor, 0.01),
  ];
  // pillars the shape rests on
  let pillars = k.Manifold.union(P.pillars.map(([x, y], i) => pillarSolid(k, x, y, P.pillarRot[i], P.pillar / 2, zFloor - 0.01, 0)));
  if (o.clip) pillars = pillars.intersect(prism(o.outer, zFloor - 1, 1));
  tray = tray.subtract(k.Manifold.union(cuts)).add(pillars);

  const adds: Manifold[] = [];
  const holes: Manifold[] = [];
  const joint = str(p, 'powerJoint');
  for (const [x, y] of P.pillars) {
    if (joint === 'magnets') holes.push(cylinder(k, x, y, -magnetH(p), magnetH(p) + 1, magnetR(p)));
    if (joint === 'pegs') adds.push(squareFrustum(k, x, y, -0.01, pegHeight(p), num(p, 'pegSize'), num(p, 'pegSize') * 0.6));
  }
  const { front, back } = o;
  // slot in the back wall for a charging cable
  if (bool(p, 'chargeSlot')) holes.push(box(k, [-7, back - P.wallT - 1, zFloor + 2], [7, back + 1, zFloor + 2 + Math.min(9, P.inner - 3)]));
  // guide rails for one particular power bank, open to the back so it slides in
  if (P.pocket) {
    const { w, l } = P.pocket;
    const rail = Math.min(8, P.inner - 2);
    const y1 = o.innerBack, y0 = y1 - l;
    for (const s of [-1, 1]) adds.push(box(k, [s * (w / 2) + (s > 0 ? 0 : -2), y0 - 2, zFloor - 0.01], [s * (w / 2) + (s > 0 ? 2 : 0), y1, zFloor + rail]));
    adds.push(box(k, [-w / 2 - 2, y0 - 2, zFloor - 0.01], [w / 2 + 2, y0, zFloor + rail]));
    holes.push(box(k, [-w / 2, y1 - 1, zFloor], [w / 2, back + 1, zFloor + P.inner - 2]));
  }
  // switch in the front wall: thinned to a 2 mm panel around it so snap-in switches fit
  const zc = zFloor + P.inner / 2;
  const SKIN = 2;
  const sw = P.switch;
  if (sw) {
    const pitch = num(p, 'slideScrewPitch');
    const span = sw.type === 'slide' ? Math.max(sw.w, pitch + 3) : sw.w;
    holes.push(box(k, [sw.x - span / 2 - 3, front + SKIN, zc - sw.h / 2 - 3], [sw.x + span / 2 + 3, front + P.wallT + 1, zc + sw.h / 2 + 3]));
    if (sw.type === 'round') holes.push(k.Manifold.cylinder(SKIN + 2, sw.w / 2).rotate([90, 0, 0]).translate([sw.x, front + SKIN + 1, zc]));
    else holes.push(box(k, [sw.x - sw.w / 2, front - 1, zc - sw.h / 2], [sw.x + sw.w / 2, front + SKIN + 0.01, zc + sw.h / 2]));
    if (sw.type === 'slide' && pitch > 0)
      for (const s of [-1, 1]) holes.push(k.Manifold.cylinder(SKIN + 2, 1.1).rotate([90, 0, 0]).translate([sw.x + (s * pitch) / 2, front + SKIN + 1, zc]));
  }
  if (bool(p, 'ledWindow')) {
    const x = num(p, 'ledWindowOffset'), w = num(p, 'ledWindowWidth'), h = num(p, 'ledWindowHeight');
    holes.push(box(k, [x - w / 2, front - 1, zc - h / 2], [x + w / 2, front + P.wallT + 1, zc + h / 2]));
  }
  if (adds.length) {
    // on a curved outline rails could reach past the wall: keep everything inside it
    const a = k.Manifold.union(adds);
    tray = tray.add(o.clip ? a.intersect(prism(o.outer, z0 - 1, P.seat + 1)) : a);
  }
  if (holes.length) tray = tray.subtract(k.Manifold.union(holes));
  return tray;
}

/** Round battery tray under a round base of radius `rBase` (cylinder, shade, ball). */
export function roundTray(k: Kernel, p: ParamValues, rBase: number, P: PowerLayout): Manifold {
  const circle = (r: number) => k.CrossSection.circle(r);
  const grow = POWER_WALL + POWER_FIT;
  return buildPowerTray(k, p, P, {
    outer: circle(rBase + grow),
    pocket: circle(rBase + POWER_FIT),
    open: circle(rBase - POWER_LEDGE),
    front: -(rBase + grow),
    back: rBase + grow,
    innerBack: rBase - POWER_LEDGE,
    clip: true,
  });
}

/** Battery tray round a rounded rectangle outerX by outerY (the box's body, a light box's base). */
export function rectTray(k: Kernel, p: ParamValues, outerX: number, outerY: number, P: PowerLayout): Manifold {
  const r = num(p, 'cornerRadius');
  const rim = (P.outerX - outerX) / 2; // wall + fit around the shape
  return buildPowerTray(k, p, P, {
    outer: roundedRect(k, P.outerX, P.outerY, r + rim),
    pocket: roundedRect(k, outerX + 0.6, outerY + 0.6, r + 0.3),
    open: roundedRect(k, P.outerX - 2 * P.wallT, P.outerY - 2 * P.wallT, Math.max(1, r - 2)),
    front: -P.outerY / 2,
    back: P.outerY / 2,
    innerBack: P.outerY / 2 - P.wallT,
  });
}

/** Magnet pockets or peg holes in the shape's underside, over the tray's pillars. */
export function powerUnderside(k: Kernel, p: ParamValues, P: PowerLayout): Manifold[] {
  const cuts: Manifold[] = [];
  for (const [x, y] of P.pillars) {
    if (str(p, 'powerJoint') === 'magnets') cuts.push(cylinder(k, x, y, -1, magnetH(p) + 1, magnetR(p)));
    if (str(p, 'powerJoint') === 'pegs') cuts.push(squareFrustum(k, x, y, -1, pegHeight(p) + 1.4, num(p, 'pegSize') + 0.6, (num(p, 'pegSize') + 0.3) * 0.6));
  }
  return cuts;
}

/** Height of the middle of the tray's inside, for text on its front. */
export const powerTextZ = (P: PowerLayout) => P.seat - P.height + P.floor + P.inner / 2;

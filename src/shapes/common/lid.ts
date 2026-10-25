// Lid closures for every shape with corner posts (box, polygon, light box): the lid sits on
// the posts and holds with plugs, magnets, plugs with magnets, snap latches or pegs. Each
// closure adds material and cuts to the body (the posts) and to the lid.
//
// A shape says where its posts have room: a square socket per post (centre, turn about Z) and
// a flat outer face per post for a latch arm (a point on the face, its outward direction).
import { num, str } from '../../core/shape';
import type { Message, ParamValues } from '../../core/types';
import { box, cylinder, roundedRect, squareFrustum, type Kernel, type Manifold } from '../../geometry/kernel';

export type LidJoint = 'plugMagnet' | 'plug' | 'magnet' | 'latch' | 'pegs';

const MAGNET_WALL = 0.7; // plug wall around a magnet pocket
const round = (v: number) => Math.round(v * 10) / 10;

/** Sizes of the closure, shared by every post. */
export interface JointLayout {
  joint: LidJoint;
  lidBottom: number;
  /** Free square in each post (side), and how deep the plug socket goes. */
  socketTop: number;
  socketDepth: number;
  plugTop: number;
  plugTip: number;
  plugDepth: number;
  magnetsFit: boolean;
  /** Width of a latch arm along its post's face. */
  latchWidth: number;
}

/** Where one post's socket sits: centre and turn about Z (degrees). */
export interface Socket {
  x: number;
  y: number;
  rot: number;
}

/** A latch arm on a post's outer face: a point on the face (the arm's centre) and its outward direction. */
export interface LatchFace {
  x: number;
  y: number;
  nx: number;
  ny: number;
  /** Where the arm hangs from, when the lid's edge there is not at `lidBottom` (e.g. a hood's walls). */
  z?: number;
}

/**
 * The closure's sizes from the settings and the room in the posts: `socketTop` the free
 * square, `post` the post size (for the warnings), `latchWidth` the free width on a post face.
 */
export function jointLayout(p: ParamValues, lidBottom: number, socketTop: number, post: number, latchWidth: number, warnings: Message[]): JointLayout {
  const joint = str(p, 'lidJoint') as LidJoint;
  const plugJoint = joint === 'plugMagnet' || joint === 'plug';
  const plugDepth = plugJoint && socketTop > 2 ? num(p, 'plugDepth') : 0;
  const plugTop = socketTop - 2 * num(p, 'plugClearance');
  const taper = Math.tan((num(p, 'plugTaper') * Math.PI) / 180);
  const plugTip = Math.max(0.5, plugTop - 2 * plugDepth * taper);
  const socketDepth = plugDepth > 0 ? plugDepth + 0.6 : 0;
  if (plugJoint && plugDepth === 0) warnings.push({ key: 'warn.noRoom' });

  const magnetPocket = num(p, 'magnetDiameter') + 2 * num(p, 'magnetClearance');
  let magnetsFit = false;
  if (joint === 'plugMagnet') {
    magnetsFit = plugDepth > 0 && plugTip >= magnetPocket + 2 * MAGNET_WALL;
    if (!magnetsFit) warnings.push({ key: 'warn.magnetNoFit', vars: { post: round(post + (magnetPocket + 2 * MAGNET_WALL - plugTip)) } });
  } else if (joint === 'magnet') {
    magnetsFit = socketTop >= magnetPocket;
    if (!magnetsFit) warnings.push({ key: 'warn.magnetNoFit', vars: { post: round(post + magnetPocket - socketTop) } });
  }
  if (joint === 'pegs' && socketTop < num(p, 'pegSize') + 2 * num(p, 'plugClearance')) warnings.push({ key: 'warn.noRoom' });
  if (joint === 'latch' && latchWidth < 3) warnings.push({ key: 'warn.noRoom' });
  return { joint, lidBottom, socketTop, socketDepth, plugTop, plugTip, plugDepth, magnetsFit, latchWidth };
}

export const magnetR = (p: ParamValues) => num(p, 'magnetDiameter') / 2 + num(p, 'magnetClearance');
export const magnetH = (p: ParamValues) => num(p, 'magnetHeight') + 0.2; // room for glue
export const pegHeight = (p: ParamValues) => num(p, 'pegSize') * 0.55;

/** Rounded square centred on (x, y), turned `rot` degrees: side w0 at z0, tapering to w1 at z0 + h. */
function taperedRoundSquare(k: Kernel, x: number, y: number, z0: number, h: number, w0: number, w1: number, r: number, rot = 0): Manifold {
  const cs = roundedRect(k, w0, w0, Math.min(r, w0 / 2 - 0.1));
  const m = cs.extrude(h, 0, 0, [w1 / w0, w1 / w0]);
  return (rot ? m.rotate([0, 0, rot]) : m).translate([x, y, z0]);
}

/** Square bar along Y turned 45° about Y: a V-shaped ridge or groove. */
function vRidge(k: Kernel, x: number, y: number, z: number, halfDiag: number, length: number): Manifold {
  const s = halfDiag * Math.SQRT2;
  return k.Manifold.cube([s, length, s], true).rotate([0, 45, 0]).translate([x, y, z]);
}

export interface JointGeometry {
  bodyCuts: Manifold[];
  bodyAdds: Manifold[];
  lidCuts: Manifold[];
  lidAdds: Manifold[];
}

export function jointGeometry(k: Kernel, p: ParamValues, J: JointLayout, sockets: Socket[], latches: LatchFace[]): JointGeometry {
  const g: JointGeometry = { bodyCuts: [], bodyAdds: [], lidCuts: [], lidAdds: [] };
  const r = num(p, 'cornerRadius');
  const clear = num(p, 'plugClearance');
  if (J.joint === 'latch') {
    if (J.latchWidth >= 3) for (const f of latches) latch(k, p, J, f, g);
    return g;
  }
  for (const { x, y, rot } of sockets) {
    switch (J.joint) {
      case 'plugMagnet':
      case 'plug': {
        if (J.plugDepth <= 0) break;
        const rs = Math.max(0.3, r - 1.2);
        // socket: same taper as the plug, grown by the clearance, 1 mm extra above the post
        const slope = (J.plugTop - J.plugTip) / J.plugDepth;
        g.bodyCuts.push(taperedRoundSquare(k, x, y, J.lidBottom - J.socketDepth, J.socketDepth + 1, J.socketTop - slope * J.socketDepth, J.socketTop + slope, rs, rot));
        g.lidAdds.push(taperedRoundSquare(k, x, y, J.lidBottom - J.plugDepth, J.plugDepth + 0.01, J.plugTip, J.plugTop, rs - clear, rot));
        if (J.magnetsFit) {
          g.bodyCuts.push(cylinder(k, x, y, J.lidBottom - J.socketDepth - magnetH(p), magnetH(p) + 0.5, magnetR(p)));
          g.lidCuts.push(cylinder(k, x, y, J.lidBottom - J.plugDepth - 1, magnetH(p) + 1, magnetR(p)));
        }
        break;
      }
      case 'magnet':
        if (!J.magnetsFit) break;
        g.bodyCuts.push(cylinder(k, x, y, J.lidBottom - magnetH(p), magnetH(p) + 1, magnetR(p)));
        g.lidCuts.push(cylinder(k, x, y, J.lidBottom - 1, magnetH(p) + 1, magnetR(p)));
        break;
      case 'pegs': {
        const s = num(p, 'pegSize'), h = pegHeight(p);
        const turn = (m: Manifold) => (rot ? m.translate([-x, -y, 0]).rotate([0, 0, rot]).translate([x, y, 0]) : m);
        g.bodyAdds.push(turn(squareFrustum(k, x, y, J.lidBottom - 0.01, h, s, s * 0.6)));
        g.lidCuts.push(turn(squareFrustum(k, x, y, J.lidBottom - 1, h + 1.4, s + 2 * clear + 0.4, (s + 2 * clear) * 0.6)));
        break;
      }
    }
  }
  return g;
}

/**
 * A snap latch on one post face: an arm hangs from the lid flush with the face and its V hook
 * snaps into a groove in a recess of the post. Built facing +X at the origin, then turned.
 */
function latch(k: Kernel, p: ParamValues, J: JointLayout, f: LatchFace, g: JointGeometry): void {
  const len = num(p, 'latchLength');
  const t = num(p, 'latchThickness');
  const hook = num(p, 'latchHook');
  const w = J.latchWidth;
  const top = f.z ?? J.lidBottom;
  const zTip = top - len;
  const zHook = zTip + hook + 0.4;
  const place = (m: Manifold) => {
    const a = (Math.atan2(f.ny, f.nx) * 180) / Math.PI;
    return (a ? m.rotate([0, 0, a]) : m).translate([f.x, f.y, 0]);
  };
  // recess in the post for the arm, so it sits flush with the outside
  const inner = -(t + 0.3);
  g.bodyCuts.push(place(box(k, [inner, -w / 2 - 0.3, zTip - 1.5], [1, w / 2 + 0.3, top + 1])));
  g.bodyCuts.push(place(vRidge(k, inner, 0, zHook, hook + 0.25, w + 0.6)));
  // arm with a V-shaped hook that snaps into the groove
  const armIn = -t;
  g.lidAdds.push(place(box(k, [armIn, -w / 2, zTip], [0, w / 2, top + 0.01])));
  const ridge = vRidge(k, armIn, 0, zHook, hook, w);
  // keep only the half that points into the post
  g.lidAdds.push(place(ridge.intersect(box(k, [armIn - 5, -w, zTip], [armIn, w, top]))));
}

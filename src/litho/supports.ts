// Breakaway fins that hold a lithophane upright while it prints, so it needs no brim.
// Common practice for lithophanes printed standing (measured from a reference print), own geometry:
// a thin tapered wall at each vertical edge on both faces, touching only the margin, each
// standing on a thin floor pad that does not touch the panel.
//
// Panel space as in mesh.ts (x right, y up, z out); the bed is at y = -height/2.
import { box, cylinder, prism, type Kernel, type Manifold } from '../geometry/kernel';
import type { PanelSpec } from './mesh';

const FIN = 0.8; // wall thickness; within the 2 mm margin, so it never touches the picture
const PAD = 0.4; // floor pad thickness (two layers)
const PAD_GAP = 1.4; // pads stay this far from the panel so they don't fuse to it
const RIB = [0.8, 2]; // stiffening rib on each fin: thickness, width (pointing inwards)
const RIB_AT = 5.6; // rib distance from the panel face
const FOOT = 8; // the fin's back edge rises straight this high before it slopes
/**
 * Bevel between the fin and its pad, on the fin's inner side: [depth from the face, inwards,
 * height] corners on a 156 mm panel. A wedge 8.7 mm high along the wall that runs out 4.8 mm
 * onto the pad; it braces the thin wall at its foot.
 */
const BEVEL = { wall: [0.4, 15.3], top: 8.66, out: 4.77, foot: [1.4, 10.53] };

/** Panel height the sizes below are given for (a 156 mm reference panel). */
const REF_H = 156;

/**
 * Fin and foot sizes on a 156 mm panel, scaled with the panel height: fin depth at the bottom
 * and top, foot length along the panel and away from it. `normal` is the standard size: fins
 * 28.5 and 11.5 mm deep, feet 45 mm along the panel and 39 mm away from it.
 */
export const SUPPORT_SIZES: Record<string, { fin: [number, number]; pad: [number, number] }> = {
  small: { fin: [28.5, 11.5], pad: [30, 33] },
  normal: { fin: [28.5, 11.5], pad: [45, 39] },
  large: { fin: [36, 14], pad: [58, 52] },
};

export function supportFins(k: Kernel, spec: PanelSpec, size = 'normal'): Manifold {
  const { width: W, height: H, thickness: T } = spec;
  const sz = SUPPORT_SIZES[size] ?? SUPPORT_SIZES.normal;
  const s = Math.min(1.5, Math.max(0.5, H / REF_H));
  const depthBottom = Math.max(10, sz.fin[0] * s);
  const depthTop = Math.max(4, sz.fin[1] * s);
  const foot = Math.min(FOOT * s, H / 4);
  const finW = Math.min(FIN, spec.margin);
  // feet along the panel stop short of the middle so the two sides never meet
  const padW = Math.min(sz.pad[0] * s, W / 2 - 2);
  const padD = Math.max(sz.pad[1] * s, depthBottom + 4);
  // the rib runs up as far as the fin is deep enough to carry it
  const ribAt = RIB_AT * s;
  const ribTop = Math.min(H / 2, -H / 2 + foot + ((H - foot) * (depthBottom - ribAt - RIB[0])) / (depthBottom - depthTop));
  const bottom = -H / 2;
  const parts: Manifold[] = [];
  for (const side of [-1, 1])
    for (const face of [-1, 1]) {
      const x0 = side > 0 ? W / 2 - finW : -W / 2;
      const x1 = x0 + finW;
      const z0 = (face * T) / 2;
      // (depth from the face, inwards from the fin's inner side, height above the bed) to panel space
      const xIn = side > 0 ? x0 : x1;
      const at = (d: number, i: number, h: number): [number, number, number] => [xIn - side * i, bottom + h, z0 + face * d];
      const pts: [number, number, number][] = [];
      for (const x of [x0, x1])
        pts.push([x, bottom, z0], [x, bottom, z0 + face * depthBottom], [x, bottom + foot, z0 + face * depthBottom], [x, H / 2, z0 + face * depthTop], [x, H / 2, z0]);
      parts.push(k.Manifold.hull(pts));
      if (ribTop > bottom + 5) {
        const rx0 = side > 0 ? W / 2 - RIB[1] : -W / 2, rx1 = rx0 + RIB[1];
        const rz0 = z0 + face * ribAt, rz1 = z0 + face * (ribAt + RIB[0]);
        parts.push(box(k, [rx0, bottom, Math.min(rz0, rz1)], [rx1, ribTop, Math.max(rz0, rz1)]));
      }
      const b = BEVEL;
      parts.push(
        k.Manifold.hull([
          ...b.wall.flatMap((d) => [at(d * s, -finW / 2, 0), at(d * s, -finW / 2, b.top * s), at(d * s, 0, 0), at(d * s, 0, b.top * s)]),
          ...b.foot.map((d) => at(d * s, b.out * s, 0)),
          ...b.foot.map((d) => at(d * s, b.out * s, PAD)),
        ]),
      );
      const pz0 = z0 + face * PAD_GAP, pz1 = z0 + face * (PAD_GAP + padD);
      const px0 = side > 0 ? W / 2 - padW : -W / 2, px1 = px0 + padW;
      parts.push(box(k, [px0, bottom, Math.min(pz0, pz1)], [px1, bottom + PAD, Math.max(pz0, pz1)]));
    }
  return k.Manifold.union(parts);
}

/**
 * The same fins for a picture bent into an arc (`spec.wrapRadius`, `spec.wrapOpen`): each side's
 * fins as for a flat panel, turned onto the arc's end so they meet its margin the same way. The
 * curve bends away from the floor pads on the inside, so a ring round the curve is kept clear
 * (except at the ends, where the fins hold on).
 */
export function arcFins(k: Kernel, spec: PanelSpec, size = 'normal'): Manifold {
  const { width: W, height: H, thickness: T } = spec;
  const R = spec.wrapRadius!, rMid = R + T / 2;
  const half = W / 2 / rMid;
  const flat = supportFins(k, spec, size);
  const big = W + H + 400;
  const sides = [-1, 1].map((side) => {
    const part = flat.intersect(box(k, [side > 0 ? 0 : -big, -big, -big], [side > 0 ? big : 0, big, big]));
    // the panel's end to the arc's end: move the edge to the axis, out to the mid radius, turn
    return part.translate([(-side * W) / 2, 0, rMid]).rotate([0, (side * half * 180) / Math.PI, 0]);
  });
  // a ring round the curve, PAD_GAP clear of both faces, over all but the last few mm at each end
  const keep = 6 / rMid;
  const a = half - keep;
  const ring = cylinder(k, 0, 0, -H / 2 - 1, H + 2, R + T + PAD_GAP).subtract(cylinder(k, 0, 0, -H / 2 - 2, H + 4, R - PAD_GAP));
  const pts: [number, number][] = [[0, 0]];
  const n = Math.max(2, Math.ceil((a * 2 * 180) / Math.PI / 3));
  const rw = (R + T + PAD_GAP) * 1.5;
  for (let i = 0; i <= n; i++) {
    const t = -a + (2 * a * i) / n;
    pts.push([rw * Math.sin(t), -rw * Math.cos(t)]);
  }
  const wedge = prism(new k.CrossSection([pts]), -H / 2 - 1, H / 2 + 1);
  // built round z with the middle towards -y; panel space has the axis along y, middle towards +z
  const clear = ring.intersect(wedge).rotate([-90, 0, 0]);
  return k.Manifold.union(sides).subtract(clear);
}

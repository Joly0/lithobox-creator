// Outlines for pictures that are not rectangles (ornaments, a heart), and the hanging loop that
// goes on top of them. Outlines are in panel space (x right, y up), centred on the origin.
import type { Outline } from '../../core/types';
import { box, cylinder, type Kernel, type Manifold } from '../../geometry/kernel';
import { outlinePoints } from '../../litho/mesh';

export const OUTLINES = ['circle', 'star', 'hexagon', 'heart'];

/** Area of a polygon: positive when its corners run anticlockwise. */
const area = (pts: [number, number][]) => pts.reduce((s, [x, y], i) => s + x * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * y, 0) / 2;

/** The same polygon, anticlockwise and centred on its bounding box. */
function tidy(pts: [number, number][]): [number, number][] {
  const p = area(pts) < 0 ? [...pts].reverse() : pts;
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return p.map(([x, y]) => [x - cx, y - cy]);
}

/** A five-pointed star with one point up, `size` across its points' circle. */
export function starPoints(size: number, points = 5, inner = 0.45): [number, number][] {
  const r = size / 2, out: [number, number][] = [];
  for (let i = 0; i < 2 * points; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / points, rr = i % 2 ? r * inner : r;
    out.push([rr * Math.cos(a), rr * Math.sin(a)]);
  }
  return tidy(out);
}

/**
 * A heart `width` wide and `height` tall (the classic curve), its point cut flat to `flat` mm
 * wide so it can stand (0: pointed). About 60 corners.
 */
export function heartPoints(width: number, height: number, flat = 0): [number, number][] {
  const raw: [number, number][] = [];
  for (let i = 0; i < 60; i++) {
    const t = (i * 2 * Math.PI) / 60;
    raw.push([16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)]);
  }
  let pts = raw;
  if (flat > 0) {
    // the height where the heart is `flat` wide (in the curve's own units), found from below
    const xs = raw.map((q) => q[0]), w0 = Math.max(...xs) - Math.min(...xs);
    const want = (flat / width) * w0;
    const widthAt = (y: number) => {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < raw.length; i++) {
        const [x0, y0] = raw[i], [x1, y1] = raw[(i + 1) % raw.length];
        if ((y0 - y) * (y1 - y) <= 0 && y0 !== y1) {
          const x = x0 + ((y - y0) * (x1 - x0)) / (y1 - y0);
          lo = Math.min(lo, x);
          hi = Math.max(hi, x);
        }
      }
      return hi - lo;
    };
    let a = Math.min(...raw.map((q) => q[1])), b = 0;
    for (let i = 0; i < 50; i++) {
      const m = (a + b) / 2;
      if (widthAt(m) < want) a = m;
      else b = m;
    }
    pts = clipBelow(raw, (a + b) / 2);
  }
  // scale to the size asked for
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const sx = width / (Math.max(...xs) - Math.min(...xs)), sy = height / (Math.max(...ys) - Math.min(...ys));
  return tidy(pts.map(([x, y]) => [x * sx, y * sy]));
}

/** The part of a polygon above y = c (one cut, Sutherland-Hodgman). */
function clipBelow(pts: [number, number][], c: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const pIn = p[1] >= c, qIn = q[1] >= c;
    if (pIn) out.push(p);
    if (pIn !== qIn) out.push([p[0] + ((c - p[1]) * (q[0] - p[0])) / (q[1] - p[1]), c]);
  }
  return out;
}

/** An outline `size` across for one of OUTLINES (a heart is as tall as wide, pointed). */
export function outlineFor(kind: string, size: number, flat = 0): Outline {
  if (kind === 'star') return { radius: size / 2, cy: 0, points: starPoints(size) };
  if (kind === 'heart') return { radius: size / 2, cy: 0, points: heartPoints(size, size * 0.9, flat) };
  // a hexagon with a flat top and bottom, `size` across its corners
  if (kind === 'hexagon') return { radius: (size / 2) * Math.cos(Math.PI / 6), sides: 6, cy: 0 };
  return { radius: size / 2, cy: 0 };
}

/** Width and height of an outline's bounding box (from its corners, as the relief is cut). */
export function outlineSize(o: Outline): [number, number] {
  const pts = outlinePoints(o);
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
}

/** How high the outline reaches at x (its top edge there). */
function topAt(o: Outline, pts: [number, number][], x: number): number {
  let top = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    if ((x0 <= x && x1 >= x) || (x0 >= x && x1 <= x)) top = Math.max(top, x0 === x1 ? Math.max(y0, y1) : y0 + ((x - x0) * (y1 - y0)) / (x1 - x0));
  }
  return Number.isFinite(top) ? top : o.cy + o.radius;
}

/** The top edge across a loop `width` wide: its highest and lowest point (beside and in a heart's dip). */
export function loopAnchor(o: Outline, pts: [number, number][], width: number): { high: number; low: number } {
  let high = -Infinity, low = Infinity;
  for (let i = 0; i <= 10; i++) {
    const t = topAt(o, pts, -width / 2 + (i * width) / 10);
    high = Math.max(high, t);
    low = Math.min(low, t);
  }
  return { high, low };
}

/** The loop's width for a hole (its ring's outside). */
export const loopWidth = (hole: number) => hole + 2 * Math.max(2.5, hole * 0.5);

/**
 * A hanging loop in panel space, as thick as the picture: a tab from below the outline's top edge
 * (`at.low`, `overlap` into the picture's margin) up to a ring whose hole (`hole` mm) starts 1 mm
 * above the edge's highest point, so a ribbon always goes through, whatever the outline.
 * With the `outline` given, the loop keeps off the picture: it covers only the margin band
 * (`overlap` wide) inside the edge, also beside a dip such as a heart's, where the edge rises.
 */
export function hangingLoop(k: Kernel, at: { high: number; low: number }, thick: number, hole: number, overlap = 2, outline?: [number, number][]): Manifold {
  const r = loopWidth(hole) / 2;
  const cy = at.high + 1 + hole / 2;
  const tab = box(k, [-r, at.low - overlap, -thick / 2], [r, cy, thick / 2]);
  const loop = cylinder(k, 0, cy, -thick / 2, thick, r).add(tab).subtract(cylinder(k, 0, cy, -thick / 2 - 1, thick + 2, hole / 2));
  if (!outline) return loop;
  const picture = new k.CrossSection([outline]).offset(-overlap, 'Round').extrude(thick + 2).translate([0, 0, -thick / 2 - 1]);
  return loop.subtract(picture);
}

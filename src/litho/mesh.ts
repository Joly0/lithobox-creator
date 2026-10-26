// Lithophane panel meshes, built directly from a height map: a relief grid on the
// outside, a flat back on the inside and side walls between them. No booleans, so
// even a million-triangle panel builds in well under a second and is always closed.
//
// Panel space: x right, y up, z out of the box (towards the viewer), origin at the
// panel centre. The back is at z = -thickness/2, the relief rises towards +z.
import type { MeshData, Outline } from '../core/types';
import { toLight } from './colour';

export interface PanelSpec {
  /** Outer size including the margin (= the slot size). */
  width: number;
  height: number;
  /** Full thickness: margin and the darkest picture areas. */
  thickness: number;
  /** Solid frame around the picture, full thickness. */
  margin: number;
  /** Thickness of the brightest picture areas. */
  minThickness: number;
  /**
   * How brightness becomes thickness. 'light' (the default): thickness chosen so the light let
   * through matches the photo's brightness; 'linear': thickness straight from brightness.
   */
  curve?: 'light' | 'linear';
  /** Grid spacing in mm. */
  resolution: number;
  /** Runs all the way round a cylinder with this back radius (see wrapMesh): no side margins. */
  wrapRadius?: number;
  /** With wrapRadius: only part of the way round (an arc), with side margins. */
  wrapOpen?: boolean;
  /**
   * With wrapRadius: a cone instead of a cylinder. The back's radius grows this much per mm up
   * (negative: narrower at the top); wrapRadius is the back's radius half way up, `height` is
   * measured along the slant and the relief stands at right angles to the wall.
   */
  coneSlope?: number;
  /** Not rectangular: the picture stays this outline's margin inside it (the mesh is cut to it later). */
  outline?: Outline;
  /**
   * With wrapRadius: a ball, the back's radius `wrapRadius`, rows along the meridian from below
   * the bottom cut (`edge`, the cut's height in panel y) up to the pole; `sMid` is the panel's
   * middle measured along the meridian from the equator. Only the band between `band` (panel y)
   * is picture; the caps are plain and thin, the cut edge keeps a full-thickness margin.
   */
  sphere?: SphereWrap;
}

export interface SphereWrap {
  sMid: number;
  band: [number, number];
  edge: number;
  /** The flat cut's height relative to the centre: the bottom row's points lie on it. */
  cutY: number;
  /** A round hole through the wall (panel x, y, radius along the surface), e.g. for a cable. */
  hole?: { x: number; y: number; r: number };
  /**
   * How the photo is laid on the ball (default 'band'); for 'front', `half` is half the picture's
   * width (radians) and `blend` how far from seen-from-the-front (0) towards shape-true (1).
   */
  projection?: SphereProjection;
  half?: number;
  blend?: number;
  /** 'band' and 'conformal': how far round the picture reaches (radians, up to a full turn). */
  around?: number;
  /** 'front': a second picture on the back half (see heightMap's `back`). */
  back?: boolean;
}

/**
 * How a photo is laid on a ball, between the band's two latitudes:
 * - 'band': the photo's width all the way round, its height along the meridian (squeezed sideways
 *   away from the middle, where the way round is shorter);
 * - 'conformal': all the way round, rows spaced like a Mercator map, so shapes keep their
 *   proportions everywhere (things further from the middle come out smaller);
 * - 'front': centred on the front: between exactly as seen from straight ahead (orthographic,
 *   blend 0) and shape-true round the picture's middle (stereographic, blend 1).
 */
export type SphereProjection = 'band' | 'conformal' | 'front';

const mercator = (phi: number) => Math.log(Math.tan(Math.PI / 4 + phi / 2));

/**
 * A 'front' picture's distance from its middle (on a unit ball) for a point `c` radians away
 * from it: sin c as seen from far in front, 2 tan(c / 2) shape-true, or in between.
 */
const frontRadius = (c: number, blend: number) => (1 - blend) * Math.sin(c) + blend * 2 * Math.tan(c / 2);

/**
 * The band evened out for viewing from in front of its middle: an angle `a` from the middle
 * counts as (1 - blend) a + blend sin a, so towards the sides more of the ball holds the same
 * part of the photo (from the front it then looks as wide as in the photo). Past 90° the sine
 * stays at 1: the picture keeps running round, only less evened out.
 */
const evened = (a: number, blend: number) => (1 - blend) * a + blend * Math.sign(a) * Math.sin(Math.min(Math.abs(a), Math.PI / 2));

/** The 'front' picture's middle: half way up the band. */
const frontMiddle = (lat: [number, number]) => (lat[0] + lat[1]) / 2;

/**
 * Where a point of the ball (longitude `lam` from the front, latitude `phi`, radians) lies in the
 * photo, (0, 0) its top left; null outside the picture. `lat` is the band's latitudes.
 */
export function sphereUV(projection: SphereProjection, lat: [number, number], half: number, lam: number, phi: number, blend = 0, around = 2 * Math.PI): [number, number] | null {
  const [p0, p1] = lat;
  if (projection === 'front') {
    // the point seen from the picture's middle: how far away (c) and in which direction (east, up)
    const pm = frontMiddle(lat);
    const d = [Math.cos(phi) * Math.sin(lam), Math.sin(phi), Math.cos(phi) * Math.cos(lam)];
    const along = d[1] * Math.sin(pm) + d[2] * Math.cos(pm);
    const east = d[0], up = d[1] * Math.cos(pm) - d[2] * Math.sin(pm);
    const c = Math.acos(Math.min(1, Math.max(-1, along)));
    if (c > Math.min(Math.PI * 0.95, 2 * half)) return null;
    const side = Math.hypot(east, up);
    const k = side > 1e-12 ? frontRadius(c, blend) / side : 1;
    const [w, h] = [frontRadius(half, blend), frontRadius((p1 - p0) / 2, blend)];
    const u = (east * k) / w / 2 + 0.5, v = 0.5 - (up * k) / h / 2;
    return u < 0 || u > 1 || v < 0 || v > 1 ? null : [u, v];
  }
  if (phi < p0 || phi > p1) return null;
  if (projection === 'band') {
    // centred on the front, `around` of the way round, evened out towards the front by `blend`
    const pm = frontMiddle(lat);
    const u = evened(lam, blend) / evened(around / 2, blend) / 2 + 0.5;
    if (u < 0 || u > 1) return null;
    const top = evened(p1 - pm, blend), bottom = evened(p0 - pm, blend);
    return [u, (top - evened(phi - pm, blend)) / (top - bottom)];
  }
  // centred on the front, `around` of the way round
  const u = lam / around + 0.5;
  if (u < 0 || u > 1) return null;
  if (projection === 'conformal') return [u, (mercator(p1) - mercator(phi)) / (mercator(p1) - mercator(p0))];
  return [u, (p1 - phi) / (p1 - p0)];
}

/** The picture's size in mm for a projection on a ball of radius r (where its picture is measured). */
export function spherePicture(projection: SphereProjection, lat: [number, number], half: number, r: number, blend = 0, around = 2 * Math.PI): [number, number] {
  const [p0, p1] = lat;
  if (projection === 'front') return [2 * r * frontRadius(half, blend), 2 * r * frontRadius((p1 - p0) / 2, blend)];
  if (projection === 'conformal') return [around * r, r * (mercator(p1) - mercator(p0))];
  const pm = frontMiddle(lat);
  return [2 * r * evened(around / 2, blend), r * (evened(p1 - pm, blend) - evened(p0 - pm, blend))];
}

/** Whether (x, y) lies inside an outline shrunk by `inset`. */
export function insideOutline(o: Outline, x: number, y: number, inset = 0): boolean {
  if (o.points) return insidePolygon(o.points, x, y, inset);
  const dy = y - o.cy;
  if (!o.sides) return Math.hypot(x, dy) <= o.radius - inset;
  for (let i = 0; i < o.sides; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / o.sides;
    if (x * Math.cos(a) + dy * Math.sin(a) > o.radius - inset) return false;
  }
  return true;
}

/** Whether (x, y) lies inside a polygon and at least `inset` from its edges. */
export function insidePolygon(pts: [number, number][], x: number, y: number, inset = 0): boolean {
  let inside = false, near = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    // distance to this edge
    const dx = xj - xi, dy = yj - yi, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / l2)) : 0;
    near = Math.min(near, Math.hypot(x - xi - t * dx, y - yi - t * dy));
  }
  return inside && near >= inset;
}

/** The outline's corners (a circle as many short sides), in panel space. */
export function outlinePoints(o: Outline): [number, number][] {
  if (o.points) return o.points;
  const n = o.sides ?? 96;
  // a circle's points sit on it; a polygon's corners lie between its sides' normals
  const r = o.sides ? o.radius / Math.cos(Math.PI / n) : o.radius;
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + ((i + (o.sides ? 0.5 : 0)) * 2 * Math.PI) / n;
    return [r * Math.cos(a), o.cy + r * Math.sin(a)];
  });
}

/** Grayscale picture, 0 = black, 1 = white, row 0 at the top. */
export interface Luminance {
  cols: number;
  rows: number;
  data: Float32Array;
  /** Colour pictures: the samples' colours (sRGB 0..1, 3 per sample), toned like `data`. */
  rgb?: Float32Array;
}

export interface HeightMap {
  cols: number;
  rows: number;
  /** Thickness per grid point in mm, row 0 at the top (y = +height/2). */
  data: Float32Array;
}

function sample(lum: Luminance, u: number, v: number): number {
  // bilinear, u and v in [0, 1]
  const x = Math.min(Math.max(u, 0), 1) * (lum.cols - 1);
  const y = Math.min(Math.max(v, 0), 1) * (lum.rows - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, lum.cols - 1), y1 = Math.min(y0 + 1, lum.rows - 1);
  const fx = x - x0, fy = y - y0;
  const d = lum.data, w = lum.cols;
  const top = d[y0 * w + x0] * (1 - fx) + d[y0 * w + x1] * fx;
  const bottom = d[y1 * w + x0] * (1 - fx) + d[y1 * w + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Grid size for a panel: points along x and y (at least 2 each). */
export function gridSize(spec: PanelSpec): { cols: number; rows: number } {
  return {
    cols: Math.max(2, Math.round(spec.width / spec.resolution) + 1),
    rows: Math.max(2, Math.round(spec.height / spec.resolution) + 1),
  };
}

/** How much light 1 mm of white PLA swallows (natural log); the lamp shader's green channel. */
export const ABSORB_PER_MM = 1.55;

/**
 * Thickness for a brightness l (0 black, 1 white) between t0 (white) and T (black). On the light
 * curve the light let through, which falls off exponentially with thickness, is the photo's
 * light scaled into what the plastic can show: from all of it at t0 down to what T lets through.
 */
export function thicknessFor(l: number, t0: number, T: number, curve: PanelSpec['curve'] = 'light'): number {
  l = Math.min(1, Math.max(0, l));
  if (curve === 'linear' || T <= t0) return t0 + (1 - l) * (T - t0);
  const floor = Math.exp(-ABSORB_PER_MM * (T - t0));
  return t0 - Math.log(floor + (1 - floor) * toLight(l)) / ABSORB_PER_MM;
}

/** Thickness at every grid point: dark = thick. Without a picture the panel is plain white. */
export function heightMap(spec: PanelSpec, lum: Luminance | null, back: Luminance | null = null): HeightMap {
  const { cols, rows } = gridSize(spec);
  const data = new Float32Array(cols * rows);
  const { width: W, height: H, margin: m, thickness: T, minThickness: t0 } = spec;
  // a picture that runs all the way round has no left and right edge, so no side margins
  const round = !!spec.wrapRadius && !spec.wrapOpen;
  const mx = round ? 0 : m;
  const pw = Math.max(W - 2 * mx, 1e-6), ph = Math.max(H - 2 * m, 1e-6);
  // a ball: radius halfway through the wall and the band's latitudes, the same for every point
  const sph = spec.sphere;
  const rm = (spec.wrapRadius ?? 0) + T / 2;
  const lat: [number, number] = sph ? [(sph.band[0] + sph.sMid) / rm, (sph.band[1] + sph.sMid) / rm] : [0, 0];
  for (let j = 0; j < rows; j++) {
    const y = H / 2 - (j * H) / (rows - 1);
    for (let i = 0; i < cols; i++) {
      const x = -W / 2 + (i * W) / (cols - 1);
      if (sph) {
        // a ball: the picture where the projection puts it, plain thin elsewhere, a margin at the cut
        // a second picture on the back half: the ball turned half round, so it reads from behind
        let lam = x / rm, pic = lum;
        if (sph.back && back && Math.abs(lam) > Math.PI / 2) (lam -= Math.sign(lam) * Math.PI), (pic = back);
        const uv = sphereUV(sph.projection ?? 'band', lat, sph.half ?? 0, lam, (y + sph.sMid) / rm, sph.blend ?? 0, sph.around);
        let t = y < sph.edge + m ? T : t0;
        if (uv) t = thicknessFor(pic ? sample(pic, uv[0], uv[1]) : 1, t0, T, spec.curve);
        data[j * cols + i] = t;
        continue;
      }
      // round a cylinder every column is picture, the seam column included
      const inPicture = (!spec.outline || insideOutline(spec.outline, x, y, m)) && (round || Math.abs(x) < W / 2 - mx - 1e-9) && Math.abs(y) < H / 2 - m - 1e-9;
      let t = T;
      if (inPicture) {
        const l = lum ? sample(lum, (x + pw / 2) / pw, (ph / 2 - y) / ph) : 1;
        t = thicknessFor(l, t0, T, spec.curve);
      }
      data[j * cols + i] = t;
    }
  }
  return { cols, rows, data };
}

/** Closed triangle mesh of the panel. */
export function panelMesh(spec: PanelSpec, hm: HeightMap): MeshData {
  const { cols: n, rows: m } = hm;
  const W = spec.width, H = spec.height, back = -spec.thickness / 2;
  const border = 2 * (n + m) - 4;
  const vCount = n * m + border + 1;
  const pos = new Float32Array(vCount * 3);
  const xs = (i: number) => -W / 2 + (i * W) / (n - 1);
  const ys = (j: number) => H / 2 - (j * H) / (m - 1);

  // relief vertices
  for (let j = 0; j < m; j++)
    for (let i = 0; i < n; i++) {
      const k = (j * n + i) * 3;
      pos[k] = xs(i);
      pos[k + 1] = ys(j);
      pos[k + 2] = back + hm.data[j * n + i];
    }

  // boundary loop (clockwise seen from +z): top row left to right, right column down,
  // bottom row right to left, left column up
  const loop: number[] = [];
  for (let i = 0; i < n; i++) loop.push(i);
  for (let j = 1; j < m; j++) loop.push(j * n + n - 1);
  for (let i = n - 2; i >= 0; i--) loop.push((m - 1) * n + i);
  for (let j = m - 2; j > 0; j--) loop.push(j * n);
  const backBase = n * m;
  loop.forEach((g, b) => {
    const k = (backBase + b) * 3;
    pos[k] = pos[g * 3];
    pos[k + 1] = pos[g * 3 + 1];
    pos[k + 2] = back;
  });
  const centre = backBase + border;
  pos[centre * 3 + 2] = back;

  const tCount = 2 * (n - 1) * (m - 1) + border /* back fan */ + 2 * border; /* walls */
  const idx = new Uint32Array(tCount * 3);
  let t = 0;
  const tri = (a: number, b: number, c: number) => {
    idx[t++] = a;
    idx[t++] = b;
    idx[t++] = c;
  };
  // relief, facing +z
  for (let j = 0; j < m - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      tri(a, c, b);
      tri(b, c, d);
    }
  // back, facing -z: a fan around the centre
  for (let b = 0; b < border; b++) tri(centre, backBase + b, backBase + ((b + 1) % border));
  // side walls between the relief rim and the back rim, facing outwards
  for (let b = 0; b < border; b++) {
    const b1 = (b + 1) % border;
    const top0 = loop[b], top1 = loop[b1];
    const bk0 = backBase + b, bk1 = backBase + b1;
    tri(top0, top1, bk1);
    tri(top0, bk1, bk0);
  }
  return { positions: pos, indices: idx };
}

/**
 * Closed tube of a picture that runs all the way round a cylinder: axis along y, the picture's
 * middle (x = 0) facing +z, the smooth back inside at `spec.wrapRadius`, the relief outside.
 * The grid's last column is its first again (x = -W/2 and +W/2 meet), so it is left out and
 * the tube closes on itself: no seam, no side walls. Vertex order: the relief grid first
 * (cols - 1 by rows), then the back grid.
 * With `spec.wrapOpen` it is an arc instead: every column is kept, x is the distance round at
 * half the thickness, and side walls close the two ends.
 */
export function wrapMesh(spec: PanelSpec, hm: HeightMap): MeshData {
  const open = !!spec.wrapOpen;
  const n = open ? hm.cols : hm.cols - 1, m = hm.rows;
  const W = spec.width, H = spec.height, R = spec.wrapRadius!;
  // an arc's x is the distance round at half the thickness; closed, the width is exactly that
  // circumference
  const rMid = R + spec.thickness / 2;
  // a cone: rows run along the slant, the relief stands out at right angles to the wall
  const slope = spec.coneSlope ?? 0, sl = Math.sqrt(1 + slope * slope);
  // a ball: latitude from the meridian; its last row stops half a row short of the pole, which
  // two extra vertices (relief and back) close like a fan
  const sph = spec.sphere;
  const dPhi = H / (m - 1) / rMid;
  const grid = n * m;
  const extra = sph ? 2 : 0;
  const pos = new Float32Array((grid * 2 + extra) * 3);
  const local = new Float32Array((grid * 2 + extra) * 3);
  for (let j = 0; j < m; j++) {
    const y = H / 2 - (j * H) / (m - 1);
    const yv = y / sl, rb = R + slope * yv;
    const phi = sph ? Math.min((y + sph.sMid) / rMid, Math.PI / 2 - dPhi / 2) : 0;
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (i * W) / (hm.cols - 1);
      const a = open ? x / rMid : (2 * Math.PI * x) / W, s = Math.sin(a), c = Math.cos(a);
      const t = hm.data[j * hm.cols + i];
      for (const [base, out, tt] of [[0, t, t], [grid, 0, 0]]) {
        const r = rb + out / sl;
        const k = (base + j * n + i) * 3;
        if (sph) {
          // out from the ball's centre; the bottom row's points on the flat cut
          const rr = R + out;
          const lat = j === m - 1 ? Math.asin(Math.max(-1, sph.cutY / rr)) : phi;
          pos[k] = rr * Math.cos(lat) * s;
          pos[k + 1] = rr * Math.sin(lat);
          pos[k + 2] = rr * Math.cos(lat) * c;
        } else {
          pos[k] = r * s;
          pos[k + 1] = yv - (out * slope) / sl;
          pos[k + 2] = r * c;
        }
        local[k] = x;
        local[k + 1] = y;
        local[k + 2] = tt;
      }
    }
  }
  // an arc has one quad fewer per row (no column joins the last to the first) and two end walls
  const q = open ? n - 1 : n;
  const out: number[] = [];
  const tri = (a: number, b: number, c: number) => out.push(a, b, c);
  // cells (row j, column i) left out for a hole, measured along the surface (across the seam)
  const hole = sph?.hole;
  const gone = (j: number, i: number) => {
    if (!hole || j < 0 || j >= m - 1) return false;
    const cx = -W / 2 + ((i + 0.5) * W) / (hm.cols - 1), cy = H / 2 - ((j + 0.5) * H) / (m - 1);
    const dx = Math.abs(cx - hole.x) % W;
    // x is measured round the equator; at this height the way round is shorter, by the cosine
    // of the latitude, or the hole comes out taller than wide low on a ball
    const across = sph ? Math.cos((cy + sph.sMid) / rMid) : 1;
    return Math.hypot(Math.min(dx, W - dx) * across, cy - hole.y) < hole.r;
  };
  const col = (i: number) => (i + q) % q;
  for (let j = 0; j < m - 1; j++)
    for (let i = 0; i < q; i++) {
      if (gone(j, i)) continue;
      const i1 = (i + 1) % n;
      const a = j * n + i, b = j * n + i1, c = a + n, d = b + n;
      // relief facing outwards, back facing the axis
      tri(a, c, b);
      tri(b, c, d);
      tri(grid + a, grid + b, grid + c);
      tri(grid + b, grid + d, grid + c);
      if (!hole) continue;
      // walls where a hole begins next to this cell, between the relief and the back
      if (gone(j, col(i + 1))) {
        tri(b, d, grid + b);
        tri(d, grid + d, grid + b);
      }
      if (gone(j, col(i - 1))) {
        tri(a, grid + a, c);
        tri(c, grid + a, grid + c);
      }
      if (gone(j - 1, i)) {
        tri(a, b, grid + a);
        tri(b, grid + b, grid + a);
      }
      if (gone(j + 1, i)) {
        tri(c, grid + c, d);
        tri(d, grid + c, grid + d);
      }
    }
  // top and bottom rings between the relief and the back; a ball closes its top at the pole
  const last = (m - 1) * n;
  const pole = 2 * grid;
  if (sph) {
    const tp = hm.data[0];
    for (const [v, r, tt] of [[pole, R + tp, tp], [pole + 1, R, 0]]) {
      pos[v * 3 + 1] = r;
      local[v * 3 + 1] = H / 2;
      local[v * 3 + 2] = tt;
    }
  }
  for (let i = 0; i < q; i++) {
    const i1 = (i + 1) % n;
    if (sph) {
      tri(pole, i, i1);
      tri(pole + 1, grid + i1, grid + i);
    } else {
      tri(i, i1, grid + i);
      tri(i1, grid + i1, grid + i);
    }
    tri(last + i, grid + last + i, last + i1);
    tri(last + i1, grid + last + i, grid + last + i1);
  }
  // an arc's two ends, facing away from the picture
  if (open)
    for (let j = 0; j < m - 1; j++) {
      const a = j * n, c = a + n, b = a + n - 1, d = b + n;
      tri(a, grid + a, c);
      tri(c, grid + a, grid + c);
      tri(b, d, grid + b);
      tri(d, grid + d, grid + b);
    }
  const idx = new Uint32Array(out);
  return { positions: pos, indices: idx, local };
}

/** Rough triangle count, for size estimates before building. */
export function triangleEstimate(spec: PanelSpec): number {
  const { cols, rows } = gridSize(spec);
  // wrapped (see wrapMesh): the back is a grid too, plus the top and bottom rings and an arc's ends
  if (spec.wrapRadius) return 4 * (cols - 1) * rows + (spec.wrapOpen ? 4 * (rows - 1) : 0);
  return 2 * (cols - 1) * (rows - 1) + 6 * (cols + rows);
}

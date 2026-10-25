// How photos are laid on a ball: shapes keep their proportions (shape-true), or the picture is
// what you see from the front (from the front, evened out towards shape-true); the simple band
// squeezes them.
import { describe, expect, it } from 'vitest';
import { heightMap, sphereUV, spherePicture, type Luminance, type PanelSpec, type SphereProjection } from '../src/litho/mesh';

const R = 100;
const LAT: [number, number] = [(-40 * Math.PI) / 180, (55 * Math.PI) / 180];
const HALF = (50 * Math.PI) / 180;
const MID = (LAT[0] + LAT[1]) / 2;
const rad = (d: number) => (d * Math.PI) / 180;

/** Where a point of the ball lands in the photo, in mm of the picture. */
function inPhoto(projection: SphereProjection, lam: number, phi: number, blend = 0): [number, number] {
  const uv = sphereUV(projection, LAT, HALF, lam, phi, blend)!;
  const [w, h] = spherePicture(projection, LAT, HALF, R, blend);
  return [uv[0] * w, uv[1] * h];
}

/** How far a small step east and a small step north on the ball move in the photo, and the angle between them. */
function steps(projection: SphereProjection, lam: number, phi: number, blend = 0) {
  const ds = 0.01;
  const p = inPhoto(projection, lam, phi, blend);
  const e = inPhoto(projection, lam + ds / (R * Math.cos(phi)), phi, blend);
  const n = inPhoto(projection, lam, phi + ds / R, blend);
  const de = [e[0] - p[0], e[1] - p[1]], dn = [n[0] - p[0], n[1] - p[1]];
  const le = Math.hypot(de[0], de[1]), ln = Math.hypot(dn[0], dn[1]);
  return { ratio: le / ln, cos: (de[0] * dn[0] + de[1] * dn[1]) / (le * ln), scale: (le + ln) / 2 / ds };
}

describe('photos on a ball', () => {
  it('all round, shape-true: every small shape keeps its proportions on the band', () => {
    for (const phiDeg of [-35, -10, 0, 25, 50])
      for (const lamDeg of [-170, -60, 0, 90]) {
        const s = steps('conformal', rad(lamDeg), rad(phiDeg));
        expect(s.ratio, `at ${lamDeg}°, ${phiDeg}°`).toBeCloseTo(1, 2);
        expect(Math.abs(s.cos)).toBeLessThan(1e-3);
      }
  });

  it('the simple band squeezes shapes sideways away from the middle', () => {
    // a step east covers more of the photo than a step north: wide faces up there
    expect(steps('band', 0, rad(50)).ratio).toBeGreaterThan(1.4);
    expect(steps('band', 0, 0).ratio).toBeCloseTo(1, 2);
  });

  it('from the front, not evened out: the photo is the ball as seen from straight in front of the picture', () => {
    for (const [lamDeg, phiDeg] of [[0, 0], [30, 20], [-45, -30], [40, 50]]) {
      const lam = rad(lamDeg), phi = rad(phiDeg);
      // seen along the picture's middle (half way up the band): the point's place on that plane
      const d = [Math.cos(phi) * Math.sin(lam), Math.sin(phi), Math.cos(phi) * Math.cos(lam)];
      const seen = [R * d[0], R * (d[1] * Math.cos(MID) - d[2] * Math.sin(MID))];
      const p = inPhoto('front', lam, phi), o = inPhoto('front', 0, MID);
      expect(p[0] - o[0]).toBeCloseTo(seen[0], 6);
      // the photo's rows run down, the view's height up
      expect(-(p[1] - o[1])).toBeCloseTo(seen[1], 6);
    }
    // the back of the ball and beyond the picture's width stay plain
    expect(sphereUV('front', LAT, HALF, Math.PI, 0)).toBeNull();
    expect(sphereUV('front', LAT, HALF, rad(60), MID)).toBeNull();
  });

  it('from the front, fully evened out: small shapes keep their proportions everywhere on the picture', () => {
    for (const [lamDeg, phiDeg] of [[0, 10], [35, 0], [-40, 30], [20, -30], [45, 45]]) {
      const s = steps('front', rad(lamDeg), rad(phiDeg), 1);
      expect(s.ratio, `at ${lamDeg}°, ${phiDeg}°`).toBeCloseTo(1, 2);
      expect(Math.abs(s.cos)).toBeLessThan(1e-3);
    }
  });

  it('evening out takes the stretch off the sides step by step', () => {
    // at the picture's side: how much wider a step east is than a step north, for 0 %, 50 %, 100 %
    const stretch = [0, 0.5, 1].map((b) => {
      const s = steps('front', rad(45), MID, b);
      return Math.max(s.ratio, 1 / s.ratio);
    });
    expect(stretch[0]).toBeGreaterThan(stretch[1]);
    expect(stretch[1]).toBeGreaterThan(stretch[2]);
    expect(stretch[2]).toBeCloseTo(1, 2);
    // and near the middle a face is the same size whatever the setting
    const near = [0, 0.5, 1].map((b) => steps('front', rad(2), MID, b).scale);
    expect(near[1]).toBeCloseTo(near[0], 1);
    expect(near[2]).toBeCloseTo(near[0], 1);
  });

  it('the relief puts a dark spot in the photo where the projection says', () => {
    // a dark square in the middle of a white photo
    const n = 64, data = new Float32Array(n * n).fill(1);
    for (let j = 28; j < 36; j++) for (let i = 28; i < 36; i++) data[j * n + i] = 0;
    const lum: Luminance = { cols: n, rows: n, data };
    const rIn = R - 1.6, T = 3.2, sMid = 20, H = 260;
    for (const blend of [0, 0.5, 1]) {
      const spec: PanelSpec = {
        width: 2 * Math.PI * R, height: H, thickness: T, margin: 2, minThickness: 1, resolution: 2, wrapRadius: rIn,
        sphere: { sMid, band: [LAT[0] * R - sMid, LAT[1] * R - sMid], edge: -H / 2, cutY: -80, projection: 'front', half: HALF, blend },
      };
      const hm = heightMap(spec, lum);
      let count = 0;
      for (let j = 0; j < hm.rows; j++)
        for (let i = 0; i < hm.cols; i++) {
          if (hm.data[j * hm.cols + i] < T - 0.01) continue;
          const x = -spec.width / 2 + (i * spec.width) / (hm.cols - 1), y = H / 2 - (j * H) / (hm.rows - 1);
          if (y < spec.sphere!.edge + 2) continue; // the cut's margin
          count++;
          // in the photo it is inside the dark square (give or take a grid step), at the front
          const uv = sphereUV('front', LAT, HALF, x / R, (y + sMid) / R, blend)!;
          for (const c of uv) {
            expect(c).toBeGreaterThan(27 / 63 - 0.02);
            expect(c).toBeLessThan(36 / 63 + 0.02);
          }
          expect(Math.abs(x / R)).toBeLessThan(0.2);
        }
      expect(count, `blend ${blend}`).toBeGreaterThan(4);
    }
  });

  it('round the ball, as far as set: a narrower picture leaves the rest plain', () => {
    const around = rad(120);
    expect(sphereUV('band', LAT, HALF, rad(55), 0, 0, around)).not.toBeNull();
    expect(sphereUV('band', LAT, HALF, rad(65), 0, 0, around)).toBeNull();
    expect(spherePicture('band', LAT, HALF, R, 0, around)[0]).toBeCloseTo(around * R, 6);
  });

  it('seen from the side at eye level, a round face on the band stays round; true-on-the-surface flattens it', () => {
    // a circle in the middle of the picture: its outline seen from in front of it, horizontally
    const look = (projection: SphereProjection, r: number) => {
      const [w, h] = spherePicture(projection, LAT, HALF, R);
      const at = (dx: number, dy: number) => {
        // the photo point back onto the ball: search the latitude along the middle column
        const u = 0.5 + dx / w, v0 = sphereUV(projection, LAT, HALF, 0, MID)![1] - dy / h;
        let lo = LAT[0], hi = LAT[1];
        for (let i = 0; i < 60; i++) {
          const m = (lo + hi) / 2;
          if (sphereUV(projection, LAT, HALF, 0, m)![1] > v0) lo = m;
          else hi = m;
        }
        const lam = (u - 0.5) * 2 * Math.PI, phi = (lo + hi) / 2;
        // seen horizontally from in front of the circle's middle (at its height)
        const d = [Math.cos(phi) * Math.sin(lam), Math.sin(phi), Math.cos(phi) * Math.cos(lam)];
        return [d[0], d[1] * Math.cos(MID) - d[2] * Math.sin(MID)];
      };
      const wide = at(r, 0)[0] - at(-r, 0)[0], tall = at(0, r)[1] - at(0, -r)[1];
      return wide / tall;
    };
    for (const r of [10, 30, 60]) {
      expect(look('band', r), `band, ${r} mm`).toBeCloseTo(1, 1);
      expect(look('conformal', r), `true on the surface, ${r} mm`).toBeGreaterThan(look('band', r) - 1e-9);
    }
  });

  it('round the ball, evened out: seen from in front of its middle, the picture is as wide and tall as the photo', () => {
    const around = rad(180), photo = (lam: number, phi: number, b: number) => {
      const uv = sphereUV('band', LAT, HALF, lam, phi, b, around)!;
      const [w, h] = spherePicture('band', LAT, HALF, R, b, around);
      return [(uv[0] - 0.5) * w, -(uv[1] - sphereUV('band', LAT, HALF, 0, MID, b, around)![1]) * h];
    };
    // along the middle row and the middle column, seen from in front: photo position = seen position
    for (const a of [10, 30, 60, 85]) {
      const lam = rad(a);
      expect(photo(lam, MID, 1)[0], `row, ${a}°`).toBeCloseTo(R * Math.sin(lam), 6);
    }
    for (const a of [-40, -20, 20, 40]) {
      const phi = MID + rad(a);
      expect(photo(0, phi, 1)[1], `column, ${a}°`).toBeCloseTo(R * Math.sin(rad(a)), 6);
    }
    // half way: between the plain band and fully evened out
    const x = (b: number) => photo(rad(60), MID, b)[0] / photo(rad(10), MID, b)[0];
    expect(x(0.5)).toBeLessThan(x(0));
    expect(x(0.5)).toBeGreaterThan(x(1));
  });
});

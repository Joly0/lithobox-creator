// A picture that runs all the way round a cylinder: a closed tube with the relief outside,
// no seam and no side margins, and the lamp view's per-vertex data.
import { describe, expect, it } from 'vitest';
import { loadKernel, withScope } from '../src/geometry/kernel';
import { heightMap, wrapMesh, type Luminance, type PanelSpec } from '../src/litho/mesh';
import { arcFins } from '../src/litho/supports';

const R = 46.8, T = 3.2, H = 120;
const spec: PanelSpec = { width: 2 * Math.PI * (R + T / 2), height: H, thickness: T, margin: 2, minThickness: 0.8, resolution: 1, wrapRadius: R };
// black on the left half, white on the right: the seam at the back joins black and white
const pic: Luminance = { cols: 2, rows: 2, data: Float32Array.from([0, 1, 0, 1]) };

describe('wrapped lithophane', () => {
  it('is a closed tube between the back radius and the relief', async () => {
    const k = await loadKernel();
    const hm = heightMap(spec, pic);
    const mesh = wrapMesh(spec, hm);
    withScope(() => {
      const m = new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }));
      expect(m.status()).toBe('NoError');
      expect(m.genus()).toBe(1);
      // between a plain tube of the thinnest and of the full thickness
      const tube = (t: number) => Math.PI * ((R + t) ** 2 - R ** 2) * H;
      expect(m.volume()).toBeGreaterThan(tube(0.8));
      expect(m.volume()).toBeLessThan(tube(T) * 1.001);
      const b = m.boundingBox();
      expect(b.max[1] - b.min[1]).toBeCloseTo(H, 3);
      expect(b.max[0]).toBeCloseTo(R + T, 0);
    });
  });

  it('has no side margins, only top and bottom', () => {
    const hm = heightMap(spec, { cols: 2, rows: 2, data: Float32Array.from([1, 1, 1, 1]) });
    const mid = Math.floor(hm.rows / 2) * hm.cols;
    // white picture: thinnest right up to the seam on both sides, full thickness at the rims
    expect(hm.data[mid]).toBeCloseTo(0.8);
    expect(hm.data[mid + hm.cols - 1]).toBeCloseTo(0.8);
    expect(hm.data[0]).toBeCloseTo(T);
    expect(hm.data[hm.data.length - 1]).toBeCloseTo(T);
  });

  it('gives the lamp view each vertex place in the picture and its thickness', () => {
    const hm = heightMap(spec, pic);
    const mesh = wrapMesh(spec, hm);
    const n = (hm.cols - 1) * hm.rows;
    expect(mesh.local!.length).toBe(mesh.positions.length);
    for (let i = 0; i < n; i += 997) {
      const [x, y, t] = [mesh.local![i * 3], mesh.local![i * 3 + 1], mesh.local![i * 3 + 2]];
      const [px, py, pz] = [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]];
      // relief vertex: at radius back + thickness, at the angle its x maps to
      expect(Math.hypot(px, pz)).toBeCloseTo(R + t, 3);
      expect(Math.atan2(px, pz)).toBeCloseTo((2 * Math.PI * x) / spec.width, 3);
      expect(py).toBeCloseTo(y, 4);
    }
    // back vertices sit on the back radius with zero thickness
    expect(Math.hypot(mesh.positions[n * 3], mesh.positions[n * 3 + 2])).toBeCloseTo(R, 3);
    expect(mesh.local![n * 3 + 2]).toBe(0);
  });
});

describe('arc lithophane (open wrap)', () => {
  const R = 146.8, T = 3.2, W = 150, H = 100;
  const arc: PanelSpec = { width: W, height: H, thickness: T, margin: 2, minThickness: 1, resolution: 1, wrapRadius: R, wrapOpen: true };
  const half = W / 2 / (R + T / 2);

  it('is a closed solid over the arc, with end walls', async () => {
    const k = await loadKernel();
    const hm = heightMap(arc, null);
    const mesh = wrapMesh(arc, hm);
    withScope(() => {
      const m = new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }));
      // a plain white picture: thin inside the margins, full thickness at the margins
      const sector = (t: number) => half * ((R + t) ** 2 - R * R) * H;
      expect(m.volume()).toBeGreaterThan(sector(1));
      expect(m.volume()).toBeLessThan(sector(T));
      expect(m.genus()).toBe(0);
    });
  });

  it('has side margins like a flat panel', () => {
    const hm = heightMap(arc, null);
    const mid = Math.floor(hm.rows / 2) * hm.cols;
    expect(hm.data[mid]).toBeCloseTo(T);
    expect(hm.data[mid + hm.cols - 1]).toBeCloseTo(T);
    expect(hm.data[mid + Math.floor(hm.cols / 2)]).toBeCloseTo(1);
  });

  it('gets fins at both ends that only touch the margin', async () => {
    const k = await loadKernel();
    const mesh = wrapMesh(arc, heightMap(arc, null));
    withScope(() => {
      const litho = new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }));
      const fins = arcFins(k, arc);
      expect(fins.volume()).toBeGreaterThan(1000);
      // touching, not cutting in: well under a cubic millimetre shared
      expect(litho.intersect(fins).volume()).toBeLessThan(0.5);
      // both ends hold on: fins reach the end walls' angle on each side
      const pos = fins.getMesh().vertProperties;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < pos.length; i += 3) {
        const a = Math.atan2(pos[i], pos[i + 2]);
        lo = Math.min(lo, a);
        hi = Math.max(hi, a);
      }
      expect(hi).toBeGreaterThan(half - 0.01);
      expect(lo).toBeLessThan(-half + 0.01);
      // standing on the same floor as the picture
      expect(fins.boundingBox().min[1]).toBeCloseTo(-H / 2, 4);
    });
  });

  it('spans the angle its width gives, at half the thickness', () => {
    const mesh = wrapMesh(arc, heightMap(arc, null));
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const a = Math.atan2(mesh.positions[i], mesh.positions[i + 2]);
      lo = Math.min(lo, a);
      hi = Math.max(hi, a);
    }
    expect(hi).toBeCloseTo(half, 4);
    expect(lo).toBeCloseTo(-half, 4);
  });
});

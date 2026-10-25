import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toStl } from '../src/export/stl';
import { bounds } from '../src/export/transform';
import { loadKernel, withScope } from '../src/geometry/kernel';
import { heightMap, panelMesh, type Luminance, type PanelSpec } from '../src/litho/mesh';
import { supportFins } from '../src/litho/supports';
import { orientGroup } from '../src/export/transform';
import { toMeshData } from '../src/geometry/kernel';

/** Test picture without any photo: a radial gradient with a dark ring and a white square. */
function testPicture(cols: number, rows: number): Luminance {
  const data = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const dx = x / cols - 0.5, dy = y / rows - 0.5;
      const r = Math.hypot(dx, dy);
      let l = Math.min(1, r * 1.6);
      if (Math.abs(r - 0.3) < 0.03) l = 0;
      if (Math.abs(dx) < 0.08 && Math.abs(dy) < 0.08) l = 1;
      data[y * cols + x] = l;
    }
  return { cols, rows, data };
}

const spec: PanelSpec = { width: 156, height: 156, thickness: 3.2, margin: 2, minThickness: 0.8, resolution: 1 };

describe('lithophane mesh', () => {
  it('is a closed solid with the slot size and the thickness range', async () => {
    const k = await loadKernel();
    const hm = heightMap(spec, testPicture(200, 200));
    const mesh = panelMesh(spec, hm);
    const ok = withScope(() => {
      const m = new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }));
      return { status: m.status(), volume: m.volume() };
    });
    expect(ok.status).toBe('NoError');
    expect(ok.volume).toBeGreaterThan(156 * 156 * 0.8);
    expect(ok.volume).toBeLessThan(156 * 156 * 3.2);
    const b = bounds(mesh.positions);
    expect(b.max[0] - b.min[0]).toBeCloseTo(156, 3);
    expect(b.max[1] - b.min[1]).toBeCloseTo(156, 3);
    expect(b.max[2] - b.min[2]).toBeCloseTo(3.2, 3);
    expect(Math.min(...hm.data)).toBeCloseTo(0.8, 2);
    if (process.env.EXPORT_DIR) writeFileSync(`${process.env.EXPORT_DIR}/litho-test.stl`, toStl(mesh.positions, mesh.indices));
  });

  it('builds a fine panel quickly', () => {
    const fine = { ...spec, resolution: 0.2 };
    const t0 = performance.now();
    const mesh = panelMesh(fine, heightMap(fine, testPicture(780, 780)));
    const ms = performance.now() - t0;
    expect(mesh.indices.length / 3).toBeGreaterThan(1_000_000);
    expect(ms).toBeLessThan(3000);
  });

  it('adds closed support fins that only touch the margin', async () => {
    const k = await loadKernel();
    const fins = withScope(() => {
      const m = supportFins(k, spec);
      expect(m.status()).toBe('NoError');
      return toMeshData(m);
    });
    const b = bounds(fins.positions);
    // fins stay inside the panel's outline in x and stand on the bed edge
    expect(b.min[0]).toBeGreaterThanOrEqual(-78 - 1e-4);
    expect(b.max[0]).toBeLessThanOrEqual(78 + 1e-4);
    expect(b.min[1]).toBeCloseTo(-78, 5);
    // inner fin faces lie within the 2 mm margin
    for (let i = 0; i < fins.positions.length; i += 3) {
      const x = Math.abs(fins.positions[i]);
      const z = Math.abs(fins.positions[i + 2]);
      if (z <= 1.6 + 1e-6) expect(x).toBeGreaterThanOrEqual(78 - 0.8 - 1e-4);
    }
    if (process.env.EXPORT_DIR) {
      const panel = panelMesh(spec, heightMap(spec, testPicture(200, 200)));
      const [p, f] = orientGroup([panel, fins], [90, 0, 0]);
      writeFileSync(`${process.env.EXPORT_DIR}/litho-print-panel.stl`, toStl(p, panel.indices));
      writeFileSync(`${process.env.EXPORT_DIR}/litho-print-fins.stl`, toStl(f, fins.indices));
    }
  });

  it('makes larger support feet for the larger size', async () => {
    const k = await loadKernel();
    const area = (size: string) =>
      withScope(() => {
        // the feet are the only parts on the bed layer
        const fins = supportFins(k, spec, size);
        return fins.trimByPlane([0, 1, 0], -78 + 0.3).volume() - fins.trimByPlane([0, 1, 0], -78 + 0.4).volume();
      });
    const [small, normal, large] = ['small', 'normal', 'large'].map(area);
    expect(normal).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(normal);
    // standard feet: four of 45 x 39 mm (the fins and bevels on them add a little)
    expect(normal / 0.1).toBeGreaterThan(4 * 39 * 45 * 0.95);
  });

  it('keeps the margin at full thickness', () => {
    const hm = heightMap(spec, testPicture(50, 50));
    // first row is the top edge of the margin
    for (let i = 0; i < hm.cols; i++) expect(hm.data[i]).toBeCloseTo(3.2, 5);
  });
});

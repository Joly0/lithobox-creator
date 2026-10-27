import { describe, expect, it } from 'vitest';
import { defaultValues, sanitize } from '../src/core/shape';
import { loadKernel, withScope } from '../src/geometry/kernel';
import { addLithophanes, pictureArea, QUALITY_RES } from '../src/litho/build';
import { shapes } from '../src/shapes';
import { MAX_BUFFER, splitMesh } from '../src/ui/chunks';
import { reliefView } from '../src/ui/reliefview';

describe('meshes in pieces for the GPU', () => {
  it('shades a relief as three.js would: normals, picture place and thickness', () => {
    // two triangles of a flat panel, one corner raised
    const part = { relief: true, mesh: { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0.5]), indices: new Uint32Array([0, 1, 2, 1, 3, 2]) } } as never;
    const v = reliefView(part);
    expect(v.pieces).toHaveLength(1);
    const [c] = v.pieces;
    // the first corner only touches the flat triangle: straight up
    expect([...c.normal.slice(0, 3)]).toEqual([0, 0, 1]);
    expect([...c.plocal]).toEqual([0, 0, 1, 0, 0, 1, 1, 1]);
    expect([...c.thick]).toEqual([0, 0, 0, 0.5]);
    expect([v.minT, v.maxT, ...v.size]).toEqual([0, 0.5, 1, 1]);
  });

  it('keeps every triangle as it was, no buffer over the limit', () => {
    // a mesh whose triangles reach all over its vertices, cut into small pieces
    const n = 5000, tris = 20000;
    const pos = new Float32Array(n * 3).map((_, i) => i * 0.37);
    const uv = new Float32Array(n * 2).map((_, i) => i * 0.11);
    const idx = new Uint32Array(tris * 3).map((_, i) => (i * 7919 + (i % 3) * 104729) % n);
    const max = 4096;
    const chunks = splitMesh(idx, [{ array: pos, size: 3 }, { array: uv, size: 2 }], max);
    let t = 0;
    for (const c of chunks) {
      expect(c.indices.byteLength).toBeLessThanOrEqual(max);
      for (const a of c.attributes) expect(a.byteLength).toBeLessThanOrEqual(max);
      for (let i = 0; i < c.indices.length; i++, t++) {
        const v = idx[t], w = c.indices[i];
        for (let k = 0; k < 3; k++) expect(c.attributes[0][w * 3 + k]).toBe(pos[v * 3 + k]);
        for (let k = 0; k < 2; k++) expect(c.attributes[1][w * 2 + k]).toBe(uv[v * 2 + k]);
      }
    }
    expect(t).toBe(idx.length);
  });

  // the 3D view and the print view draw what this builds: no part may be too big to draw
  it('leaves nothing too big to draw, in any shape and preset at the finest detail', async () => {
    const k = await loadKernel();
    const res = QUALITY_RES.fine;
    let split = 0;
    for (const shape of shapes)
      for (const values of [{}, ...(shape.presets ?? []).map((p) => p.values)]) {
        const p = sanitize(shape, { ...defaultValues(shape), ...values });
        const r = withScope(() => shape.build(k, p));
        const pictures = Object.fromEntries(
          r.slots.map((s) => {
            const a = pictureArea(s, p), cols = Math.max(2, Math.round(a.width / res)), rows = Math.max(2, Math.round(a.height / res));
            return [s.id, { cols, rows, data: new Float32Array(cols * rows).map((_, i) => (i % 13) / 13) }];
          }),
        );
        withScope(() => addLithophanes(k, r, p, pictures, res));
        for (const part of r.parts) {
          const where = `${shape.id} ${JSON.stringify(values)} ${part.id}`;
          if (!part.relief) {
            // drawn with creased normals, unindexed: 3 vertices of position and normal per triangle
            expect(part.mesh.indices.length * 24, where).toBeLessThanOrEqual(MAX_BUFFER);
            continue;
          }
          const view = reliefView(part);
          if (view.pieces.length > 1) split++;
          let tris = 0;
          for (const c of view.pieces) {
            tris += c.indices.length / 3;
            for (const a of [c.indices, c.position, c.normal, c.plocal, c.thick]) expect(a.byteLength, where).toBeLessThanOrEqual(MAX_BUFFER);
          }
          // nothing left out
          expect(tris, where).toBe(part.mesh.indices.length / 3);
        }
      }
    // the large ball at least needs splitting, so this really went through the pieces
    expect(split).toBeGreaterThan(0);
  }, 600000);
});

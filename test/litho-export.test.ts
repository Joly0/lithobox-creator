import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultValues, sanitize } from '../src/core/shape';
import { toBambu3mf } from '../src/export/bambu3mf';
import { orientGroup } from '../src/export/transform';
import { loadKernel, withScope } from '../src/geometry/kernel';
import { addLithophanes, pictureArea, QUALITY_RES } from '../src/litho/build';
import type { Luminance } from '../src/litho/mesh';
import { boxShape } from '../src/shapes/box';

function gradient(cols: number, rows: number): Luminance {
  const data = new Float32Array(cols * rows);
  for (let i = 0; i < data.length; i++) data[i] = ((i % cols) / cols + Math.floor(i / cols) / rows) / 2;
  return { cols, rows, data };
}

describe('lithophane export', () => {
  it('writes a full box with five lithophanes as one 3MF', async () => {
    const k = await loadKernel();
    const p = sanitize(boxShape, { ...defaultValues(boxShape) });
    const res = QUALITY_RES.normal;
    const t0 = performance.now();
    const r = withScope(() => {
      const r = boxShape.build(k, p);
      const pics: Record<string, Luminance> = {};
      for (const s of r.slots) {
        const a = pictureArea(s, p);
        pics[s.id] = gradient(Math.round(a.width / res), Math.round(a.height / res));
      }
      addLithophanes(k, r, p, pics, res);
      return r;
    });
    const groups = new Map<string, typeof r.parts>();
    for (const x of r.parts.filter((x) => !x.preview)) groups.set(x.object ?? x.id, [...(groups.get(x.object ?? x.id) ?? []), x]);
    const objects = [...groups.entries()].map(([name, parts]) => {
      const pos = orientGroup(parts.map((x) => x.mesh), parts[0].printRotation);
      return { name, settings: Object.assign({}, ...parts.map((x) => x.slicer ?? {})), volumes: parts.map((x, i) => ({ name: x.id, positions: pos[i], indices: x.mesh.indices })) };
    });
    const tris = r.parts.reduce((n, x) => n + x.mesh.indices.length / 3, 0);
    const blob = await toBambu3mf(objects, { title: 'litho', bed: [256, 256] });
    const ms = performance.now() - t0;
    console.log(`objects ${objects.length}, triangles ${tris}, 3MF ${(blob.size / 1e6).toFixed(1)} MB, ${Math.round(ms)} ms`);
    expect(objects.length).toBe(7);
    if (process.env.EXPORT_DIR) writeFileSync(`${process.env.EXPORT_DIR}/litho-box.3mf`, new Uint8Array(await blob.arrayBuffer()));
    if (process.env.EXPORT_DIR) {
      const one = await toBambu3mf(objects.filter((o) => o.name === 'litho-front'), { title: 'litho front', bed: [256, 256] });
      writeFileSync(`${process.env.EXPORT_DIR}/litho-front.3mf`, new Uint8Array(await one.arrayBuffer()));
    }
  }, 120000);
});

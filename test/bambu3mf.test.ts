import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultValues, sanitize } from '../src/core/shape';
import { plateOrigin, toBambu3mf } from '../src/export/bambu3mf';
import { orientGroup } from '../src/export/transform';
import { loadKernel, withScope } from '../src/geometry/kernel';
import { boxShape } from '../src/shapes/box';

describe('bambu 3mf', () => {
  it('lays plates out like Bambu Studio', () => {
    expect(plateOrigin(0, 2, [256, 256])).toEqual([0, -0]);
    expect(plateOrigin(1, 2, [256, 256])[0]).toBeCloseTo(307.2);
    expect(plateOrigin(2, 3, [256, 256])).toEqual([0, -307.2]);
  });

  it('writes one object per plate with settings', async () => {
    const k = await loadKernel();
    const p = sanitize(boxShape, { ...defaultValues(boxShape), powerBase: true });
    const r = withScope(() => boxShape.build(k, p));
    const objects = r.parts
      .filter((x) => !x.preview)
      .map((x) => ({ name: x.id, settings: x.slicer, volumes: [{ name: x.id, positions: orientGroup([x.mesh], x.printRotation)[0], indices: x.mesh.indices }] }));
    const blob = await toBambu3mf(objects, { title: 'test', bed: [256, 256], date: '2026-01-01' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    expect(buf.length).toBeGreaterThan(1000);
    if (process.env.EXPORT_DIR) writeFileSync(`${process.env.EXPORT_DIR}/bambu-power.3mf`, buf);
  });
});

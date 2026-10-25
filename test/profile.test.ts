// Optional end-to-end check with a real slicer project: PROFILE_3MF=path/to/project.3mf
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultValues, sanitize } from '../src/core/shape';
import { toBambu3mf } from '../src/export/bambu3mf';
import { profileFromFile } from '../src/export/profile';
import { orientGroup } from '../src/export/transform';
import { loadKernel, withScope } from '../src/geometry/kernel';
import { boxShape } from '../src/shapes/box';

const src = process.env.PROFILE_3MF;

describe.skipIf(!src)('slicer profile', () => {
  it('reads a saved project and writes a project 3MF with plates', async () => {
    const profile = await profileFromFile(new File([readFileSync(src!)], 'p.3mf'));
    expect(profile.printer).not.toBe('');
    const k = await loadKernel();
    const p = sanitize(boxShape, { ...defaultValues(boxShape), powerBase: true });
    const r = withScope(() => boxShape.build(k, p));
    const objects = r.parts
      .filter((x) => !x.preview)
      .map((x) => ({ name: x.id, settings: x.slicer, volumes: [{ name: x.id, positions: orientGroup([x.mesh], x.printRotation)[0], indices: x.mesh.indices }] }));
    const blob = await toBambu3mf(objects, { title: 'profile test', bed: profile.bed, profile });
    if (process.env.EXPORT_DIR) writeFileSync(`${process.env.EXPORT_DIR}/profiled.3mf`, new Uint8Array(await blob.arrayBuffer()));
    console.log(profile.application, profile.orca, profile.printer, profile.print, profile.bed);
  });
});

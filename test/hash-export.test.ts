import { describe, expect, it } from 'vitest';
import { defaultValues } from '../src/core/shape';
import type { BuildResult } from '../src/core/types';
import { boxShape } from '../src/shapes/box';
import { fitFilaments, printFiles, printObjects } from '../src/ui/export';
import { changedValues, hashFor, readHash } from '../src/ui/hash';

describe('share link', () => {
  it('keeps only changed settings and reads them back, text with accents included', () => {
    const values = { ...defaultValues(boxShape), panelThickness: 4.2, text: 'Grüße' };
    const changed = changedValues(boxShape, values);
    expect(changed).toEqual({ panelThickness: 4.2, text: 'Grüße' });
    expect(readHash('#' + hashFor('box', changed))).toEqual({ shape: 'box', params: changed });
  });

  it('a broken link gives no settings, and no hash gives no shape', () => {
    expect(readHash('#s=box&p=%%%')).toEqual({ shape: 'box', params: {} });
    expect(readHash('')).toEqual({ shape: null, params: {} });
  });
});

describe('export grouping', () => {
  const rot = [0, 0, 0];
  const mesh = () => ({ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) });
  const r = {
    parts: [
      { id: 'body', mesh: mesh(), printRotation: rot },
      { id: 'litho-front', mesh: mesh(), printRotation: rot, object: 'body', extruder: 3 },
      { id: 'lamp', mesh: mesh(), printRotation: rot, preview: true },
      { id: 'lid', mesh: mesh(), printRotation: rot },
    ],
  } as unknown as BuildResult;

  it('groups volumes into objects and leaves preview parts out', () => {
    const objects = printObjects(r, (id) => id.toUpperCase());
    expect(objects.map((o) => o.ids)).toEqual([['body', 'litho-front'], ['lid']]);
    expect(objects[0].volumes.map((v) => v.name)).toEqual(['BODY', 'LITHO-FRONT']);
    // a volume for another filament stays a file of its own
    expect(printFiles(r, (id) => id).map((p) => p.id)).toEqual(['body', 'litho-front', 'lid']);
  });

  it('keeps a lithophane and its support fins in one file for STL and plain 3MF', () => {
    const withFins = {
      parts: [
        { id: 'litho-front', mesh: mesh(), printRotation: rot, object: 'litho-front' },
        { id: 'litho-front-fins', mesh: mesh(), printRotation: rot, object: 'litho-front', printOnly: true },
        { id: 'litho-front-cyan', mesh: mesh(), printRotation: rot, object: 'litho-front', extruder: 2, printOnly: true },
      ],
    } as unknown as BuildResult;
    const files = printFiles(withFins, (id) => id);
    expect(files.map((f) => f.id)).toEqual(['litho-front', 'litho-front-cyan']);
    // both triangles, the second one's corners counted after the first's
    expect(Array.from(files[0].indices)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(files[0].positions.length).toBe(18);
  });

  it('moves parts to filament 1 when the profile has fewer filaments', () => {
    const objects = printObjects(r, (id) => id);
    fitFilaments(objects, { filaments: ['PLA', 'PLA'] } as never);
    expect(objects[0].volumes.map((v) => v.extruder)).toEqual([undefined, 1]);
  });
});

import { describe, expect, it } from 'vitest';
import { PROJECT_VERSION, ProjectError, readProject, writeProject, type Project } from '../src/export/project';
import { readZipText } from '../src/export/unzip';
import { zip } from '../src/export/zip';

const bytes = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 255);

const sample = (): Project => ({
  shape: 'box',
  params: { panelWidth: 100, closure: 'magnets', topPicture: true, baseText: 'Für Oma' },
  photos: [
    { id: 'pA', name: 'urlaub.jpg', blob: new Blob([bytes(5000, 1)], { type: 'image/jpeg' }) },
    { id: 'pB', name: 'katze.png', blob: new Blob([bytes(3000, 7)], { type: 'image/png' }) },
  ],
  slots: {
    front: { photo: 'pA', edit: { zoom: 1.4, rotation: 12, flipH: true, exposure: 0.5 } },
    top: { photo: 'pB', edit: { fill: false } },
  },
});

/** A zip with a hand-made manifest, for files the writer would never produce. */
const handMade = (manifest: unknown, extra: { name: string; data: Uint8Array }[] = []) =>
  zip([{ name: 'project.json', data: new TextEncoder().encode(JSON.stringify(manifest)) }, ...extra]);

const failsWith = async (file: Blob, key: string) => {
  const err = await readProject(file).then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(ProjectError);
  expect((err as Error).message).toBe(key);
};

describe('project file', () => {
  it('round trips settings, photos and placements', async () => {
    const p = sample();
    const { project, missing } = await readProject(await writeProject(p));
    expect(missing).toBe(0);
    expect(project.shape).toBe('box');
    expect(project.params).toEqual(p.params);
    expect(project.slots).toEqual(p.slots);
    expect(project.photos.map((x) => [x.id, x.name, x.blob.type])).toEqual([
      ['pA', 'urlaub.jpg', 'image/jpeg'],
      ['pB', 'katze.png', 'image/png'],
    ]);
    for (const [i, x] of project.photos.entries())
      expect(new Uint8Array(await x.blob.arrayBuffer())).toEqual(new Uint8Array(await p.photos[i].blob.arrayBuffer()));
  });

  it('writes a versioned manifest', async () => {
    const m = JSON.parse((await readZipText(await writeProject(sample()), 'project.json'))!);
    expect(m.format).toBe('lithobox');
    expect(m.version).toBe(PROJECT_VERSION);
    expect(m.photos.map((x: { file: string }) => x.file)).toEqual(['photos/1.jpg', 'photos/2.png']);
  });

  it('refuses files from a newer version', async () => {
    await failsWith(await handMade({ format: 'lithobox', version: PROJECT_VERSION + 1, shape: 'box' }), 'project.errNewer');
  });

  it('refuses things that are not project files', async () => {
    await failsWith(new Blob([bytes(500, 3)]), 'project.errInvalid');
    await failsWith(await zip([{ name: '3D/3dmodel.model', data: bytes(10, 1) }]), 'project.errInvalid');
    await failsWith(await handMade({ format: 'other', version: 1 }), 'project.errInvalid');
    await failsWith(await handMade({ format: 'lithobox', version: 0 }), 'project.errInvalid');
    await failsWith(await handMade({ format: 'lithobox' }), 'project.errInvalid');
  });

  it('leaves out photos that are missing and the sides that used them', async () => {
    const file = await handMade(
      {
        format: 'lithobox', version: 1, shape: 'box', params: {},
        photos: [
          { id: 'a', name: 'a.jpg', type: 'image/jpeg', file: 'photos/1.jpg' },
          { id: 'b', name: 'b.jpg', type: 'image/jpeg', file: 'photos/2.jpg' },
        ],
        slots: { front: { photo: 'a', edit: {} }, back: { photo: 'b', edit: {} }, left: { photo: 'nope' } },
      },
      [{ name: 'photos/1.jpg', data: bytes(100, 2) }],
    );
    const { project, missing } = await readProject(file);
    expect(missing).toBe(1);
    expect(project.photos.map((p) => p.id)).toEqual(['a']);
    expect(Object.keys(project.slots)).toEqual(['front']);
  });
});

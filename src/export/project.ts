// The .lithobox project file: one zip with all settings, the photos placed on a side (the
// original files, unchanged) and each side's crop and tone. Nothing is uploaded: the browser
// saves and opens the file, and it travels however the person sends it.
//
// Layout: `project.json` (the manifest below) plus `photos/1.jpg`, `photos/2.png`, ...
import type { ParamValues } from '../core/types';
import type { PictureEdit } from '../litho/image';
import { readZipBytes, readZipText } from './unzip';
import { zip, type ZipEntry } from './zip';

/** Raise when the manifest changes, and add a step to `migrate` that lifts older files. */
export const PROJECT_VERSION = 1;
export const PROJECT_EXT = '.lithobox';
const MANIFEST = 'project.json';

export interface ProjectPhoto {
  id: string;
  name: string;
  blob: Blob;
}

export interface ProjectSlot {
  photo: string;
  edit: Partial<PictureEdit>;
}

export interface Project {
  shape: string;
  params: Partial<ParamValues>;
  photos: ProjectPhoto[];
  /** Slot id to the photo placed there, with that side's crop and tone. */
  slots: Record<string, ProjectSlot>;
}

interface Manifest {
  format: 'lithobox';
  version: number;
  created: string;
  shape: string;
  params: Partial<ParamValues>;
  photos: { id: string; name: string; type: string; file: string }[];
  slots: Record<string, ProjectSlot>;
}

/** Why a file could not be opened; the message is an i18n key. */
export class ProjectError extends Error {}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/avif': 'avif', 'image/heic': 'heic', 'image/heif': 'heif', 'image/bmp': 'bmp',
};
// compressing these again only costs time
const PACKED = /^image\/(jpeg|png|webp|gif|avif|heic|heif)$/;

export async function writeProject(p: Project): Promise<Blob> {
  const photos = p.photos.map((ph, i) => ({ id: ph.id, name: ph.name, type: ph.blob.type, file: `photos/${i + 1}.${EXT[ph.blob.type] ?? 'bin'}` }));
  const manifest: Manifest = {
    format: 'lithobox', version: PROJECT_VERSION, created: new Date().toISOString(),
    shape: p.shape, params: p.params, photos, slots: p.slots,
  };
  const entries: ZipEntry[] = [{ name: MANIFEST, data: new TextEncoder().encode(JSON.stringify(manifest, null, 1)) }];
  for (const [i, ph] of p.photos.entries())
    entries.push({ name: photos[i].file, data: new Uint8Array(await ph.blob.arrayBuffer()), store: PACKED.test(ph.blob.type) });
  return zip(entries);
}

/** Lift an older manifest to the current layout, one version at a time. */
function migrate(m: Record<string, unknown>): Manifest {
  const v = m.version;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new ProjectError('project.errInvalid');
  if (v > PROJECT_VERSION) throw new ProjectError('project.errNewer');
  // e.g. for version 2: if (m.version === 1) { ...rename or convert fields...; m.version = 2; }
  return m as unknown as Manifest;
}

const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown, fallback = '') => (typeof x === 'string' ? x : fallback);

/** Read a project file. `missing` counts photos listed in it that are not there. */
export async function readProject(file: Blob): Promise<{ project: Project; missing: number }> {
  let raw: unknown;
  try {
    raw = JSON.parse((await readZipText(file, MANIFEST)) ?? '');
  } catch {
    throw new ProjectError('project.errInvalid');
  }
  if (!isObject(raw) || raw.format !== 'lithobox') throw new ProjectError('project.errInvalid');
  const m = migrate(raw);

  const photos: ProjectPhoto[] = [];
  let missing = 0;
  for (const ph of Array.isArray(m.photos) ? m.photos : []) {
    const bytes = isObject(ph) && typeof ph.id === 'string' && typeof ph.file === 'string' ? await readZipBytes(file, ph.file).catch(() => null) : null;
    if (!bytes) {
      missing++;
      continue;
    }
    photos.push({ id: ph.id, name: str(ph.name, 'photo'), blob: new Blob([bytes as BlobPart], { type: str(ph.type) }) });
  }
  const ids = new Set(photos.map((p) => p.id));
  const slots: Record<string, ProjectSlot> = {};
  for (const [id, s] of Object.entries(isObject(m.slots) ? m.slots : {}))
    if (isObject(s) && ids.has(s.photo as string)) slots[id] = { photo: s.photo as string, edit: isObject(s.edit) ? s.edit : {} };

  return { project: { shape: str(m.shape), params: isObject(m.params) ? m.params : {}, photos, slots }, missing };
}

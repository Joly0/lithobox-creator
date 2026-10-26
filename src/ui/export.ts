// Turning a build result into files to download: slicer objects, plain 3MF, STL.
import type { BuildResult } from '../core/types';
import { toBambu3mf, type PrintObject } from '../export/bambu3mf';
import type { StoredProfile } from '../export/profile';
import { toStl } from '../export/stl';
import { to3mf } from '../export/threemf';
import { orientGroup } from '../export/transform';
import { zip } from '../export/zip';

export type PartName = (id: string) => string;

/** Printable parts grouped into slicer objects (volumes of one object stay together). */
export function printObjects(r: BuildResult, partName: PartName): (PrintObject & { ids: string[] })[] {
  const groups = new Map<string, typeof r.parts>();
  for (const p of r.parts.filter((x) => !x.preview)) {
    const key = p.object ?? p.id;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.entries()].map(([key, parts]) => {
    const pos = orientGroup(parts.map((p) => p.mesh), parts[0].printRotation);
    return {
      name: partName(key),
      ids: parts.map((p) => p.id),
      settings: Object.assign({}, ...parts.map((p) => p.slicer ?? {})),
      volumes: parts.map((p, i) => ({ name: partName(p.id), positions: pos[i], indices: p.mesh.indices, extruder: p.extruder })),
    };
  });
}

/**
 * Files for formats without parts (STL, plain 3MF): the volumes of one object on its first
 * filament become one mesh, so a lithophane's support fins stay on it; volumes meant for
 * another filament (second-colour text, colour layers) stay files of their own, to be added
 * as parts in the slicer. Named by the object, or by the volume for the separate ones.
 */
export function printFiles(r: BuildResult, partName: PartName) {
  return printObjects(r, partName).flatMap((o, i) => {
    const main = o.volumes.map((v, j) => ({ v, j })).filter(({ v }) => (v.extruder ?? 1) === 1);
    const rest = o.volumes.map((v, j) => ({ v, j })).filter(({ v }) => (v.extruder ?? 1) !== 1);
    const files = rest.map(({ v, j }) => ({ id: o.ids[j], name: v.name, positions: v.positions, indices: v.indices, key: `${i}-${j}` }));
    if (main.length) {
      const count = main.reduce((n, { v }) => n + v.positions.length, 0);
      const positions = new Float32Array(count);
      const indices = new Uint32Array(main.reduce((n, { v }) => n + v.indices.length, 0));
      let pOff = 0, iOff = 0;
      for (const { v } of main) {
        positions.set(v.positions, pOff);
        for (let k = 0; k < v.indices.length; k++) indices[iOff + k] = v.indices[k] + pOff / 3;
        pOff += v.positions.length;
        iOff += v.indices.length;
      }
      // the object's own id: the first volume's, which names the object (a lithophane, a body)
      files.unshift({ id: o.ids[main[0].j], name: o.name, positions, indices, key: `${i}` });
    }
    return files;
  });
}

/** Slicer objects for a profile: parts meant for a filament it doesn't have go to filament 1. */
export function fitFilaments(objects: PrintObject[], profile: StoredProfile): void {
  const count = Math.max(1, profile.filaments.length);
  for (const o of objects) for (const v of o.volumes) if ((v.extruder ?? 1) > count) v.extruder = 1;
}

/** Hand a file to the browser's download. */
export function save(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export interface ExportContext {
  /** The result to export, or null when there is none yet. */
  result: () => Promise<BuildResult | null>;
  partName: PartName;
  /** File name without extension, e.g. lithobox-box. */
  baseName: () => string;
  title: () => string;
  /** The bed from the settings, used when no slicer profile is loaded. */
  bed: () => [number, number];
  profile: () => StoredProfile | null;
}

/** Wire the three export buttons; returns the download for one part's STL (the info list's links). */
export function wireExports(ctx: ExportContext, buttons: { bambu: HTMLElement; plain: HTMLElement; stl: HTMLElement }): (partId: string) => Promise<void> {
  buttons.bambu.addEventListener('click', async () => {
    const r = await ctx.result();
    if (!r) return;
    const objects = printObjects(r, ctx.partName);
    const profile = ctx.profile();
    if (profile) fitFilaments(objects, profile);
    save(await toBambu3mf(objects, { title: ctx.title(), bed: profile?.bed ?? ctx.bed(), profile: profile ?? undefined }), `${ctx.baseName()}.3mf`);
  });
  buttons.plain.addEventListener('click', async () => {
    const r = await ctx.result();
    if (!r) return;
    save(await to3mf(printFiles(r, ctx.partName), ctx.title()), `${ctx.baseName()}-plain.3mf`);
  });
  buttons.stl.addEventListener('click', async () => {
    const r = await ctx.result();
    if (!r) return;
    const files = printFiles(r, ctx.partName).map((p) => ({ name: `${ctx.baseName()}-${p.id}.stl`, data: toStl(p.positions, p.indices) }));
    save(await zip(files), `${ctx.baseName()}-stl.zip`);
  });
  return async (partId) => {
    const r = await ctx.result();
    if (!r) return;
    const p = printFiles(r, ctx.partName).find((x) => x.id === partId);
    if (p) save(new Blob([toStl(p.positions, p.indices) as BlobPart]), `${ctx.baseName()}-${p.id}.stl`);
  };
}

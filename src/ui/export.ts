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

/** Printable parts in print orientation; volumes of one object are oriented together. */
export function printable(r: BuildResult, partName: PartName) {
  return printObjects(r, partName).flatMap((o, i) =>
    o.volumes.map((v, j) => ({ id: o.volumes.length > 1 ? `${o.ids[j]}` : o.ids[0], name: v.name, positions: v.positions, indices: v.indices, key: `${i}-${j}` })),
  );
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
    save(await to3mf(printable(r, ctx.partName), ctx.title()), `${ctx.baseName()}-plain.3mf`);
  });
  buttons.stl.addEventListener('click', async () => {
    const r = await ctx.result();
    if (!r) return;
    const files = printable(r, ctx.partName).map((p) => ({ name: `${ctx.baseName()}-${p.id}.stl`, data: toStl(p.positions, p.indices) }));
    save(await zip(files), `${ctx.baseName()}-stl.zip`);
  });
  return async (partId) => {
    const r = await ctx.result();
    if (!r) return;
    const p = printable(r, ctx.partName).find((x) => x.id === partId);
    if (p) save(new Blob([toStl(p.positions, p.indices) as BlobPart]), `${ctx.baseName()}-${p.id}.stl`);
  };
}

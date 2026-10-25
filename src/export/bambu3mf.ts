// 3MF in the layout Bambu Studio writes (OrcaSlicer reads it too): one slicer
// object per printable object, each on its own named plate, with per-object
// settings and optional extra volumes (e.g. raised text on another filament).
// No printer profile is embedded, so the slicer keeps the user's own presets.
import { meshXml } from './meshxml';
import { bounds } from './transform';
import { zip } from './zip';

export interface PrintVolume {
  name: string;
  /** Already in print orientation; volumes of one object share one frame. */
  positions: Float32Array;
  indices: Uint32Array;
  extruder?: number;
}

export interface PrintObject {
  name: string;
  volumes: PrintVolume[];
  settings?: Record<string, string>;
}

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
const f = (n: number) => (Math.round(n * 1e4) / 1e4).toString();
const uuid = (kind: number, n: number) => `${kind.toString(16).padStart(8, '0')}-${n.toString(16).padStart(4, '0')}-4000-8000-${n.toString(16).padStart(12, '0')}`;

/** Bambu Studio lays plates out in a grid with a fifth of the bed size between them. */
export function plateOrigin(index: number, count: number, bed: [number, number]): [number, number] {
  const cols = Math.ceil(Math.sqrt(count));
  return [(index % cols) * bed[0] * 1.2, -Math.floor(index / cols) * bed[1] * 1.2];
}

/**
 * A slicer project profile taken from a 3MF the user saved in their own slicer. With it,
 * the file opens as a full project (plates, the user's printer and presets); without it,
 * slicers import geometry, names and per-object settings only.
 */
export interface SlicerProfile {
  /** `Application` tag of the source file, e.g. "BambuStudio-02.06.00.51". */
  application: string;
  /** OrcaSlicer version tag, when the source was saved by OrcaSlicer. */
  orca?: string;
  /** Raw `Metadata/project_settings.config` (JSON). */
  settings: string;
}

export async function toBambu3mf(objects: PrintObject[], opts: { title: string; bed: [number, number]; date?: string; profile?: SlicerProfile }): Promise<Blob> {
  const enc = new TextEncoder();
  // mesh objects: written later as a stream, one entry per volume
  const meshes: { id: number; v: PrintVolume }[] = [];
  const objectXml: string[] = [];
  const buildXml: string[] = [];
  const settingsXml: string[] = [];
  const plateXml: string[] = [];
  let meshId = 0;
  let objectId = objects.reduce((n, o) => n + o.volumes.length, 0); // assembly ids follow the mesh ids

  objects.forEach((obj, i) => {
    objectId++;
    // centre the object on its plate
    const all = obj.volumes.map((v) => bounds(v.positions));
    const min = [0, 1, 2].map((a) => Math.min(...all.map((b) => b.min[a])));
    const max = [0, 1, 2].map((a) => Math.max(...all.map((b) => b.max[a])));
    const [px, py] = plateOrigin(i, objects.length, opts.bed);
    const tx = px + opts.bed[0] / 2 - (min[0] + max[0]) / 2;
    const ty = py + opts.bed[1] / 2 - (min[1] + max[1]) / 2;
    const tz = -min[2];

    const components: string[] = [];
    const parts: string[] = [];
    for (const v of obj.volumes) {
      meshId++;
      meshes.push({ id: meshId, v });
      components.push(`<component p:path="/3D/Objects/object_1.model" objectid="${meshId}" p:UUID="${uuid(0x20000, meshId)}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`);
      parts.push(
        `    <part id="${meshId}" subtype="normal_part">\n` +
          `      <metadata key="name" value="${esc(v.name)}"/>\n` +
          `      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n` +
          `      <metadata key="extruder" value="${v.extruder ?? 1}"/>\n` +
          `    </part>`,
      );
    }
    objectXml.push(`<object id="${objectId}" p:UUID="${uuid(0x30000, objectId)}" type="model"><components>${components.join('')}</components></object>`);
    buildXml.push(`<item objectid="${objectId}" p:UUID="${uuid(0x40000, objectId)}" transform="1 0 0 0 1 0 0 0 1 ${f(tx)} ${f(ty)} ${f(tz)}" printable="1"/>`);
    const settings = Object.entries(obj.settings ?? {}).map(([k, v]) => `    <metadata key="${esc(k)}" value="${esc(v)}"/>`);
    settingsXml.push(
      `  <object id="${objectId}">\n    <metadata key="name" value="${esc(obj.name)}"/>\n    <metadata key="extruder" value="1"/>\n` +
        (settings.length ? settings.join('\n') + '\n' : '') +
        parts.join('\n') +
        '\n  </object>',
    );
    plateXml.push(
      `  <plate>\n    <metadata key="plater_id" value="${i + 1}"/>\n    <metadata key="plater_name" value="${esc(obj.name)}"/>\n    <metadata key="locked" value="false"/>\n` +
        `    <model_instance>\n      <metadata key="object_id" value="${objectId}"/>\n      <metadata key="instance_id" value="0"/>\n      <metadata key="identify_id" value="${100 + i}"/>\n    </model_instance>\n  </plate>`,
    );
  });

  const NS = 'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p"';
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  // Slicer tags only with a profile: a tagged file without project settings makes
  // OrcaSlicer show a "geometry data only" warning and drop the plates anyway.
  const pr = opts.profile;
  const tags = pr
    ? ` <metadata name="Application">${esc(pr.application)}</metadata>\n <metadata name="BambuStudio:3mfVersion">1</metadata>` + (pr.orca ? `\n <metadata name="OrcaSlicer">${esc(pr.orca)}</metadata>` : '')
    : '';
  const main = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" ${NS}>
${tags}
 <metadata name="Title">${esc(opts.title)}</metadata>
 <metadata name="Designer">Lithobox Creator</metadata>
 <metadata name="CreationDate">${date}</metadata>
 <metadata name="ModificationDate">${date}</metadata>
 <resources>
${objectXml.join('\n')}
 </resources>
 <build p:UUID="${uuid(0x50000, 1)}">
${buildXml.join('\n')}
 </build>
</model>`;
  function* meshFile(): Generator<Uint8Array> {
    yield enc.encode(`<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" ${NS}>\n <resources>\n`);
    for (const m of meshes) {
      yield enc.encode(`<object id="${m.id}" p:UUID="${uuid(0x10000, m.id)}" type="model">`);
      yield* meshXml(m.v.positions, m.v.indices, enc);
      yield enc.encode('</object>\n');
    }
    yield enc.encode(' </resources>\n <build/>\n</model>');
  }
  const settings = `<?xml version="1.0" encoding="UTF-8"?>
<config>
${settingsXml.join('\n')}
${plateXml.join('\n')}
</config>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
 <Default Extension="config" ContentType="text/xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;
  const modelRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/Objects/object_1.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;
  return zip([
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rels) },
    { name: '3D/3dmodel.model', data: enc.encode(main) },
    { name: '3D/_rels/3dmodel.model.rels', data: enc.encode(modelRels) },
    { name: '3D/Objects/object_1.model', data: meshFile },
    { name: 'Metadata/model_settings.config', data: enc.encode(settings) },
    ...(pr ? [{ name: 'Metadata/project_settings.config', data: enc.encode(pr.settings) }] : []),
  ]);
}

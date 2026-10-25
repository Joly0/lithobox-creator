// 3MF writer (core spec). Each part becomes a named object, laid out side by
// side in print orientation; slicers can re-arrange or split onto plates.
import { meshXml } from './meshxml';
import { bounds } from './transform';
import { zip } from './zip';

export interface PrintPart {
  name: string;
  positions: Float32Array; // already oriented and resting on z = 0
  indices: Uint32Array;
}

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
const f = (n: number) => (Math.round(n * 1e4) / 1e4).toString();

export async function to3mf(parts: PrintPart[], title: string): Promise<Blob> {
  const items: string[] = [];
  let cursorX = 0;
  const gap = 10;
  parts.forEach((p, i) => {
    const id = i + 1;
    const { min, max } = bounds(p.positions);
    const tx = cursorX - min[0];
    items.push(`<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${f(tx)} ${f(-min[1])} 0"/>`);
    cursorX += max[0] - min[0] + gap;
  });
  const enc = new TextEncoder();
  function* model(): Generator<Uint8Array> {
    yield enc.encode(`<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">${esc(title)}</metadata>
<metadata name="Application">Lithobox Creator</metadata>
<resources>`);
    for (const [i, p] of parts.entries()) {
      yield enc.encode(`<object id="${i + 1}" name="${esc(p.name)}" type="model">`);
      yield* meshXml(p.positions, p.indices, enc);
      yield enc.encode('</object>\n');
    }
    yield enc.encode(`</resources>\n<build>${items.join('')}</build>\n</model>`);
  }
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;
  return zip([
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rels) },
    { name: '3D/3dmodel.model', data: model },
  ]);
}

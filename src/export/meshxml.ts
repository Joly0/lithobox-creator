// 3MF <mesh> XML in chunks, for writers that stream into the ZIP.
/** A number for 3MF XML, to 0.0001. */
export const f = (n: number) => (Math.round(n * 1e4) / 1e4).toString();
/** Text for an XML attribute or element. */
export const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
const BATCH = 20000;

export function* meshXml(positions: Float32Array, indices: Uint32Array, enc: TextEncoder): Generator<Uint8Array> {
  yield enc.encode('<mesh><vertices>');
  let buf: string[] = [];
  for (let j = 0; j < positions.length; j += 3) {
    buf.push(`<vertex x="${f(positions[j])}" y="${f(positions[j + 1])}" z="${f(positions[j + 2])}"/>`);
    if (buf.length === BATCH) {
      yield enc.encode(buf.join(''));
      buf = [];
    }
  }
  yield enc.encode(buf.join('') + '</vertices><triangles>');
  buf = [];
  for (let j = 0; j < indices.length; j += 3) {
    buf.push(`<triangle v1="${indices[j]}" v2="${indices[j + 1]}" v3="${indices[j + 2]}"/>`);
    if (buf.length === BATCH) {
      yield enc.encode(buf.join(''));
      buf = [];
    }
  }
  yield enc.encode(buf.join('') + '</triangles></mesh>');
}

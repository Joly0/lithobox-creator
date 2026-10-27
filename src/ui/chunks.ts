// Big meshes in pieces for the GPU. Chrome on Windows (WebGL on Direct3D 11) refuses a buffer
// over 128 MB (or a quarter of the video memory, if more), and the part is then silently not
// drawn: a 25 cm ball at 0.3 mm has a 136 MB index buffer. Each piece keeps its own copy of the
// vertices it uses, so every buffer stays under the limit whatever the mesh looks like.

/** Largest buffer the 3D view hands to the GPU in one piece: half the limit above. */
export const MAX_BUFFER = 64 * 2 ** 20;

/** A vertex attribute: `size` floats per vertex. */
export interface Attribute {
  array: Float32Array;
  size: number;
}

export interface Chunk {
  indices: Uint32Array;
  /** The attributes in the order given, for this piece's vertices only. */
  attributes: Float32Array[];
}

/** True when the mesh needs no splitting: its index buffer and every attribute fit in `maxBytes`. */
export function fitsOneBuffer(indices: Uint32Array, attributes: Attribute[], maxBytes = MAX_BUFFER): boolean {
  return indices.byteLength <= maxBytes && attributes.every((a) => a.array.byteLength <= maxBytes);
}

/**
 * Split a triangle mesh into runs of consecutive triangles, each with its own vertices, so no
 * buffer of a piece (indices or any attribute) is larger than `maxBytes`.
 */
export function splitMesh(indices: Uint32Array, attributes: Attribute[], maxBytes = MAX_BUFFER): Chunk[] {
  // a run of n triangles uses at most 3n vertices
  const widest = Math.max(...attributes.map((a) => a.size * 4), 4);
  const perChunk = Math.max(1, Math.floor(Math.min(maxBytes / 12, maxBytes / (3 * widest))));
  const vertices = Math.max(0, ...attributes.map((a) => a.array.length / a.size));
  const map = new Int32Array(vertices).fill(-1);
  const chunks: Chunk[] = [];
  for (let t0 = 0; t0 < indices.length; t0 += perChunk * 3) {
    const t1 = Math.min(indices.length, t0 + perChunk * 3);
    const local = new Uint32Array(t1 - t0);
    const used: number[] = [];
    for (let i = t0; i < t1; i++) {
      const v = indices[i];
      if (map[v] < 0) {
        map[v] = used.length;
        used.push(v);
      }
      local[i - t0] = map[v];
    }
    const out = attributes.map((a) => {
      const arr = new Float32Array(used.length * a.size);
      for (let j = 0; j < used.length; j++) for (let c = 0; c < a.size; c++) arr[j * a.size + c] = a.array[used[j] * a.size + c];
      return arr;
    });
    for (const v of used) map[v] = -1;
    chunks.push({ indices: local, attributes: out });
  }
  return chunks;
}

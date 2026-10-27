// What the 3D view draws of a relief part, worked out once from its mesh: smooth vertex normals,
// each vertex's place in the flat picture and thickness (for the picture and lamp shading), cut
// into pieces that each fit one GPU buffer (see chunks.ts). No three.js here: the build worker
// runs it, so the page only hands finished buffers to the GPU.
import type { PartOutput, ReliefView } from '../core/types';
import { fitsOneBuffer, splitMesh } from './chunks';

/** Area-weighted vertex normals, as three.js computes them. */
function vertexNormals(pos: Float32Array, idx: Uint32Array): Float32Array {
  const n = new Float32Array(pos.length);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    for (const o of [a, b, c]) {
      n[o] += x;
      n[o + 1] += y;
      n[o + 2] += z;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l;
    n[i + 1] /= l;
    n[i + 2] /= l;
  }
  return n;
}

export function reliefView(part: PartOutput): ReliefView {
  const pos = part.mesh.positions, idx = part.mesh.indices, local = part.mesh.local;
  const count = pos.length / 3;
  // thickness per vertex (the relief is built with its back as the lowest z): shown until the
  // lamp texture arrives; and each vertex's place in the flat picture, for the picture texture
  let minT = Infinity, maxT = 0;
  const thick = new Float32Array(count);
  const plocal = new Float32Array(count * 2);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity;
  for (let i = 0; i < count; i++) {
    minX = Math.min(minX, pos[i * 3]);
    maxX = Math.max(maxX, pos[i * 3]);
    minY = Math.min(minY, pos[i * 3 + 1]);
    maxY = Math.max(maxY, pos[i * 3 + 1]);
    minZ = Math.min(minZ, pos[i * 3 + 2]);
  }
  for (let i = 0; i < count; i++) {
    // curved: the mesh brings its place in the picture and its thickness along
    plocal[i * 2] = local ? local[i * 3] : pos[i * 3];
    plocal[i * 2 + 1] = local ? local[i * 3 + 1] : pos[i * 3 + 1];
    maxT = Math.max(maxT, (thick[i] = local ? local[i * 3 + 2] : pos[i * 3 + 2] - minZ));
  }
  const grid = part.reliefGrid ? part.reliefGrid[0] * part.reliefGrid[1] : count;
  for (let i = 0; i < grid; i++) minT = Math.min(minT, thick[i]);
  // back and side walls: full thickness, so the panel edges stay dark
  for (let i = grid; i < count; i++) thick[i] = maxT;

  const normal = vertexNormals(pos, idx);
  const attrs = [
    { array: pos, size: 3 },
    { array: normal, size: 3 },
    { array: plocal, size: 2 },
    { array: thick, size: 1 },
  ];
  const pieces = fitsOneBuffer(idx, attrs) ? [{ indices: idx, attributes: [pos, normal, plocal, thick] }] : splitMesh(idx, attrs);
  return {
    pieces: pieces.map((c) => ({ indices: c.indices, position: c.attributes[0], normal: c.attributes[1], plocal: c.attributes[2], thick: c.attributes[3] })),
    minT,
    maxT,
    size: [maxX - minX, maxY - minY],
  };
}

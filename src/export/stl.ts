// Binary STL writer.
export function toStl(positions: Float32Array, indices: Uint32Array): Uint8Array {
  const n = indices.length / 3;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, n, true);
  let o = 84;
  for (let t = 0; t < n; t++) {
    const v = [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]].map((i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]);
    const u = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]];
    const w = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
    const nx = u[1] * w[2] - u[2] * w[1], ny = u[2] * w[0] - u[0] * w[2], nz = u[0] * w[1] - u[1] * w[0];
    const len = Math.hypot(nx, ny, nz) || 1;
    for (const c of [nx / len, ny / len, nz / len]) { dv.setFloat32(o, c, true); o += 4; }
    for (const p of v) for (const c of p) { dv.setFloat32(o, c, true); o += 4; }
    o += 2;
  }
  return new Uint8Array(buf);
}

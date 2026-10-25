// Binary STL writer.
export function toStl(positions: Float32Array, indices: Uint32Array): Uint8Array {
  const n = indices.length / 3;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, n, true);
  let o = 84;
  const put = (c: number) => {
    dv.setFloat32(o, c, true);
    o += 4;
  };
  // plain locals, no arrays per triangle: a big export has millions of them
  for (let t = 0; t < n; t++) {
    const a = indices[t * 3] * 3, b = indices[t * 3 + 1] * 3, c = indices[t * 3 + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
    const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const wx = cx - ax, wy = cy - ay, wz = cz - az;
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    put(nx / len); put(ny / len); put(nz / len);
    put(ax); put(ay); put(az);
    put(bx); put(by); put(bz);
    put(cx); put(cy); put(cz);
    o += 2;
  }
  return new Uint8Array(buf);
}

// Put a part into its print orientation and onto the build plate.
import type { MeshData, Vec3 } from '../core/types';

function rotate(src: Float32Array, rotDeg: Vec3): Float32Array {
  const [ax, ay, az] = rotDeg.map((d) => (d * Math.PI) / 180);
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(ax), Math.sin(ax), Math.cos(ay), Math.sin(ay), Math.cos(az), Math.sin(az)];
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    let x = src[i], y = src[i + 1], z = src[i + 2];
    // X, then Y, then Z rotation
    [y, z] = [y * cx - z * sx, y * sx + z * cx];
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    [x, y] = [x * cz - y * sz, x * sz + y * cz];
    out[i] = x; out[i + 1] = y; out[i + 2] = z;
  }
  return out;
}

/**
 * Rotate several meshes that belong together (one slicer object) into print
 * orientation, then move them as one: centred on the XY origin, resting on z = 0.
 */
export function orientGroup(meshes: MeshData[], rotDeg: Vec3): Float32Array[] {
  const out = meshes.map((m) => rotate(m.positions, rotDeg));
  const b = out.map(bounds);
  const ox = (Math.min(...b.map((x) => x.min[0])) + Math.max(...b.map((x) => x.max[0]))) / 2;
  const oy = (Math.min(...b.map((x) => x.min[1])) + Math.max(...b.map((x) => x.max[1]))) / 2;
  const oz = Math.min(...b.map((x) => x.min[2]));
  for (const p of out)
    for (let i = 0; i < p.length; i += 3) {
      p[i] -= ox; p[i + 1] -= oy; p[i + 2] -= oz;
    }
  return out;
}

/** The rotation of orientGroup plus a translation, as a column-major 4 x 4 matrix. */
export function printMatrix(rotDeg: Vec3, t: Vec3): number[] {
  const c = rotate(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), rotDeg);
  return [c[0], c[1], c[2], 0, c[3], c[4], c[5], 0, c[6], c[7], c[8], 0, t[0], t[1], t[2], 1];
}

export function orientForPrint(mesh: MeshData, rotDeg: Vec3): Float32Array {
  return orientGroup([mesh], rotDeg)[0];
}

export function bounds(pos: Float32Array): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3)
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], pos[i + a]);
      max[a] = Math.max(max[a], pos[i + a]);
    }
  return { min, max };
}

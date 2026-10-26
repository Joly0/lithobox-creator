// The print view's layout and the floor the viewer draws its grid on, without three.js so
// every shape can be tested: parts stand on z = 0 both assembled and laid out for printing.
import type { PartOutput, Vec3 } from '../core/types';
import { orientGroup, printMatrix } from '../export/transform';

/** A build plate in the print view: its centre and size, in mm. */
export interface Plate {
  x: number;
  y: number;
  width: number;
  depth: number;
}

/** Plates in a grid, a fifth of the bed apart (as Bambu Studio lays them out), centred on the origin. */
export function plateGrid(count: number, bed: [number, number]): Plate[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / cols);
  const [px, py] = [bed[0] * 1.2, bed[1] * 1.2];
  const ox = ((Math.min(count, cols) - 1) * px) / 2, oy = ((rows - 1) * py) / 2;
  return Array.from({ length: count }, (_, i) => ({ x: (i % cols) * px - ox, y: oy - Math.floor(i / cols) * py, width: bed[0], depth: bed[1] }));
}

/** Lowest point of a part where the viewer shows it: its matrix applied, explode left out. */
export function partMinZ(p: PartOutput): number {
  const pos = p.mesh.positions, m = p.matrix;
  let min = Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const z = m ? m[2] * pos[i] + m[6] * pos[i + 1] + m[10] * pos[i + 2] + m[14] : pos[i + 2];
    if (z < min) min = z;
  }
  return min;
}

/** Height of the floor under the model: the lowest real part, never above z = 0. */
export function groundLevel(parts: Iterable<PartOutput>): number {
  let min = 0;
  for (const p of parts) if (!p.preview) min = Math.min(min, partMinZ(p));
  return min;
}

/**
 * Every slicer object on its own plate, centred, in its print orientation on z = 0, like the
 * 3MF export puts them. The meshes keep their own coordinates and get a matrix, so the lamp
 * view still reads the relief.
 */
export function printLayout(parts: PartOutput[], bed: [number, number] = [256, 256]): { parts: PartOutput[]; plates: Plate[] } {
  const groups = new Map<string, PartOutput[]>();
  // a part without triangles would get a plate of its own with nothing on it: left out, but
  // said in the console, as it means something upstream built nothing
  const empty = parts.filter((x) => !x.preview && x.mesh.indices.length === 0);
  if (empty.length) console.warn('print view: parts without geometry left out:', empty.map((x) => x.id).join(', '));
  for (const p of parts.filter((x) => !x.preview && x.mesh.indices.length > 0)) groups.set(p.object ?? p.id, [...(groups.get(p.object ?? p.id) ?? []), p]);
  const plates = plateGrid(groups.size, bed);
  const placed: { src: PartOutput; rot: Vec3; t: Vec3 }[] = [];
  [...groups.values()].forEach((group, i) => {
    const rot = group[0].printRotation;
    const pos = orientGroup(group.map((p) => p.mesh), rot);
    // the shift orientGroup applied: where the first point went, minus where rotation alone takes it
    const p0 = group[0].mesh.positions;
    const m = printMatrix(rot, [0, 0, 0]);
    const r0 = [0, 1, 2].map((a) => m[a] * p0[0] + m[4 + a] * p0[1] + m[8 + a] * p0[2]);
    const t: Vec3 = [pos[0][0] - r0[0] + plates[i].x, pos[0][1] - r0[1] + plates[i].y, pos[0][2] - r0[2]];
    for (const src of group) placed.push({ src, rot, t });
  });
  return {
    plates,
    parts: placed.map(({ src, rot, t }) => ({
      id: src.id, mesh: src.mesh, color: src.color, explode: [0, 0, 0], printRotation: [0, 0, 0], relief: src.relief, reliefGrid: src.reliefGrid, mask: src.mask, wrapSphere: src.wrapSphere, sphereProjection: src.sphereProjection,
      matrix: printMatrix(rot, t),
    })),
  };
}

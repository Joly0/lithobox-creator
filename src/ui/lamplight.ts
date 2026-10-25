// Where the light comes from in the lamp view, without three.js so every shape can be tested.
// Each lithophane is lit from behind: by the shape's preview lamp when that sits behind the
// picture, otherwise by a virtual lamp straight behind its centre (a plain panel held to a
// light, a part in the print view).
import type { BuildResult, Vec3 } from '../core/types';

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Vec3) => Math.sqrt(dot(a, a));

/** The lamp must shine onto the picture's back at least this steeply (cosine). */
export const MIN_INCIDENCE = 0.15;
/** A virtual lamp sits this far behind the picture, in picture sizes. */
const VIRTUAL_DISTANCE = 0.6;

/** Light point of a preview lamp: its centre, near its top (where a puck's LEDs are). */
export function lampPoint(positions: Float32Array): Vec3 {
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3)
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], positions[i + a]);
      max[a] = Math.max(max[a], positions[i + a]);
    }
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, max[2] - 4];
}

/** Light reaching point p from the lamp, for a picture facing `normal` (as in the shader). */
export function irradiance(p: Vec3, lamp: Vec3, normal: Vec3, reach: number): number {
  const d = sub(p, lamp);
  const dist = Math.max(len(d), 1e-3);
  return Math.max(dot(d, normal) / dist, 0) / (1 + (dist / reach) * (dist / reach));
}

/**
 * The lamp for one picture: `centre` and `normal` (pointing out of the picture's front) in
 * world space, `size` its larger side. Uses the shape's lamp when it lights the back steeply
 * enough, else a virtual one behind the centre. A picture round a cylinder (`wrap`, centre on
 * its axis) is lit from inside: by the shape's lamp, or else from the middle of the axis.
 */
export function lampFor(centre: Vec3, normal: Vec3, lamp: Vec3 | null, size: number, wrap = false): Vec3 {
  if (wrap) return lamp ?? centre;
  if (lamp) {
    const d = sub(centre, lamp);
    if (dot(d, normal) / Math.max(len(d), 1e-3) > MIN_INCIDENCE) return lamp;
  }
  const back = size * VIRTUAL_DISTANCE;
  return [centre[0] - normal[0] * back, centre[1] - normal[1] * back, centre[2] - normal[2] * back];
}

/** The shape's preview lamp, if it has one. */
export function shapeLamp(r: BuildResult): Vec3 | null {
  const lamp = r.parts.find((p) => p.id === 'lamp');
  return lamp ? (lamp.light ?? lampPoint(lamp.mesh.positions)) : null;
}

/**
 * The light point of a lithophane in the exploded view: it moves with the lithophane (its
 * explode offset times the slider), so each picture is still lit as in the assembled lamp.
 */
export function explodedLight(lamp: Vec3, explode: Vec3, f: number): Vec3 {
  return [lamp[0] + explode[0] * f, lamp[1] + explode[1] * f, lamp[2] + explode[2] * f];
}

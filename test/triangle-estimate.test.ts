import { describe, expect, it } from 'vitest';
import { heightMap, panelMesh, triangleEstimate, wrapMesh, type PanelSpec } from '../src/litho/mesh';

const base: PanelSpec = { width: 120, height: 80, thickness: 3, margin: 2, minThickness: 0.8, resolution: 0.5 };
const triangles = (spec: PanelSpec, build: typeof panelMesh) => build(spec, heightMap(spec, null)).indices.length / 3;

describe('triangle estimate before building', () => {
  it('matches the real mesh for flat, wrapped and arc panels', () => {
    expect(triangleEstimate(base) / triangles(base, panelMesh)).toBeCloseTo(1, 2);
    const tube = { ...base, wrapRadius: 40 };
    expect(triangleEstimate(tube)).toBe(triangles(tube, wrapMesh));
    const arc = { ...base, wrapRadius: 40, wrapOpen: true };
    expect(triangleEstimate(arc)).toBe(triangles(arc, wrapMesh));
  });
});

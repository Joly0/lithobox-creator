// The picture on top of the lid, cut to the lamp's outline (polygon, cylinder).
import { describe, expect, it } from 'vitest';
import { defaultValues, num, sanitize, type ShapeDefinition } from '../src/core/shape';
import type { ParamValues } from '../src/core/types';
import { loadKernel, withScope, type Kernel } from '../src/geometry/kernel';
import { addLithophanes } from '../src/litho/build';
import { insideOutline, outlinePoints, type Luminance } from '../src/litho/mesh';
import { cylinderShape } from '../src/shapes/cylinder';
import { polygonShape } from '../src/shapes/polygon';
import { SIDES } from '../src/shapes/polygon/params';

const white: Luminance = { cols: 64, rows: 64, data: new Float32Array(64 * 64).fill(1) };

/** A mesh moved by a column-major 4 x 4 matrix, as a solid. */
function placed(k: Kernel, pos: Float32Array, idx: Uint32Array, m?: number[]) {
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3)
    for (let a = 0; a < 3; a++) out[i + a] = m ? m[a] * pos[i] + m[4 + a] * pos[i + 1] + m[8 + a] * pos[i + 2] + m[12 + a] : pos[i + a];
  return new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: out, triVerts: idx }));
}

/** Area of a polygon given by its corners. */
const area = (pts: [number, number][]) => Math.abs(pts.reduce((s, [x, y], i) => s + x * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * y, 0)) / 2;

const CASES: { name: string; shape: ShapeDefinition; values: ParamValues; lid: string }[] = [
  ...SIDES.map((sides) => ({ name: `polygon ${sides}`, shape: polygonShape, values: { sides, lidJoint: 'magnet', lampDiameter: 40 }, lid: 'lid' })),
  { name: 'cylinder', shape: cylinderShape, values: { lighting: 'base' }, lid: 'ring' },
];

describe('picture on top of the lid', () => {
  for (const c of CASES)
    it(`${c.name}: cut to the outline, lying flat, in the lid's rebate`, async () => {
      const k = await loadKernel();
      const p = sanitize(c.shape, { ...defaultValues(c.shape), ...c.values, topPanel: true });
      withScope(() => {
        const r = c.shape.build(k, p);
        expect(r.warnings.map((w) => w.key)).toEqual([]);
        const slot = r.slots.find((s) => s.id === 'top')!;
        expect(slot.outline).toBeDefined();
        addLithophanes(k, r, p, { top: white }, 0.5);
        const litho = r.parts.find((x) => x.id === 'litho-top')!;
        expect(litho.printRotation, 'prints lying').toEqual([0, 0, 0]);
        expect(r.parts.some((x) => x.id === 'litho-top-fins'), 'no fins').toBe(false);
        const o = slot.outline!;
        const pos = litho.mesh.positions;
        for (let i = 0; i < pos.length; i += 3) expect(insideOutline(o, pos[i], pos[i + 1], -0.01)).toBe(true);
        const solid = placed(k, pos, litho.mesh.indices);
        expect(solid.status()).toBe('NoError');
        // white: the picture is at the thinnest, the margin round it at full thickness
        const m = num(p, 'lithoMargin'), T = slot.thickness, t0 = num(p, 'lithoMinThickness');
        const all = area(outlinePoints(o)), pic = area(outlinePoints({ ...o, radius: o.radius - m }));
        // (within 1.5 %: along the picture's edge the thickness ramps across one grid cell)
        const expected = pic * t0 + (all - pic) * T;
        expect(Math.abs(solid.volume() / expected - 1)).toBeLessThan(0.015);
        // in its place it lies in the lid's rebate without touching the lid
        const lid = placed(k, r.parts.find((x) => x.id === c.lid)!.mesh.positions, r.parts.find((x) => x.id === c.lid)!.mesh.indices);
        expect(lid.status()).toBe('NoError');
        expect(placed(k, pos, litho.mesh.indices, slot.matrix).intersect(lid).volume()).toBeLessThan(1e-3);
        // and is not loose: the ledge is right under it
        const under = placed(k, pos, litho.mesh.indices, slot.matrix).translate([0, 0, -0.3]);
        expect(under.intersect(lid).volume()).toBeGreaterThan(1);
      });
    });
});

import { describe, expect, it } from 'vitest';
import { defaultValues, num, sanitize } from '../src/core/shape';
import type { MeshData } from '../src/core/types';
import { loadKernel, withScope, type Kernel } from '../src/geometry/kernel';
import { addLithophanes } from '../src/litho/build';
import { insideOutline, outlinePoints, type Luminance } from '../src/litho/mesh';
import { OUTLINES, heartPoints, loopAnchor, loopWidth } from '../src/shapes/common/outlines';
import { ornamentShape } from '../src/shapes/ornament';
import { MASK_POINTS } from '../src/ui/viewer';

const grey: Luminance = { cols: 32, rows: 32, data: new Float32Array(32 * 32).fill(0.5) };
const solid = (k: Kernel, m: MeshData) => new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

describe('ornament', () => {
  for (const outline of OUTLINES)
    it(`${outline}: cut to its outline, lying flat, loop joined and open`, async () => {
      const k = await loadKernel();
      const p = sanitize(ornamentShape, { ...defaultValues(ornamentShape), outline });
      withScope(() => {
        const r = ornamentShape.build(k, p);
        const slot = r.slots[0];
        const o = slot.outline!;
        if (o.points) expect(o.points.length).toBeLessThanOrEqual(MASK_POINTS);
        addLithophanes(k, r, p, { picture: grey }, 0.5);
        const litho = r.parts.find((x) => x.id === 'litho-picture')!;
        expect(litho.printRotation).toEqual([0, 0, 0]);
        const s = solid(k, litho.mesh);
        expect(s.status()).toBe('NoError');
        const pos = litho.mesh.positions;
        // inside, or on the edge where it was cut (the inside test may count those either way)
        const edge = outlinePoints(o);
        const onEdge = (x: number, y: number) =>
          edge.some(([ax, ay], i) => {
            const [bx, by] = edge[(i + 1) % edge.length], dx = bx - ax, dy = by - ay;
            const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
            return Math.hypot(x - ax - t * dx, y - ay - t * dy) < 0.01;
          });
        for (let i = 0; i < pos.length; i += 3) expect(insideOutline(o, pos[i], pos[i + 1]) || onEdge(pos[i], pos[i + 1])).toBe(true);
        // the loop: one object with the picture, overlapping it, its hole open
        const loop = r.parts.find((x) => x.id === 'loop')!;
        expect(loop.object).toBe('litho-picture');
        expect(loop.printRotation).toEqual(litho.printRotation);
        const ring = solid(k, loop.mesh);
        expect(ring.status()).toBe('NoError');
        expect(ring.intersect(s).volume(), 'joined to the picture').toBeGreaterThan(1);
        const hole = num(p, 'loopHole'), at = loopAnchor(o, outlinePoints(o), loopWidth(hole));
        const pin = k.Manifold.cylinder(20, hole / 2 - 0.3, hole / 2 - 0.3, 32).translate([0, at.high + 1 + hole / 2, -10]);
        expect(pin.intersect(ring.add(s)).volume(), 'a ribbon goes through').toBeLessThan(1e-3);
      });
    });

  it('a heart can stand: cut flat at its point to the width asked for', () => {
    const pts = heartPoints(80, 72, 25);
    const ys = pts.map((q) => q[1]), low = Math.min(...ys);
    const bottom = pts.filter((q) => Math.abs(q[1] - low) < 1e-6).map((q) => q[0]);
    expect(Math.max(...bottom) - Math.min(...bottom)).toBeCloseTo(25, 0);
    const xs = pts.map((q) => q[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(80, 6);
    expect(Math.max(...ys) - low).toBeCloseTo(72, 6);
  });
});

describe('hanging loop', () => {
  // the relief lies inside the outline, a margin in from its edge: the loop may cover that margin, never the picture
  for (const outline of OUTLINES)
    it(`keeps off the picture of a ${outline}`, async () => {
      const k = await loadKernel();
      const p = sanitize(ornamentShape, { ...defaultValues(ornamentShape), outline, loop: true });
      withScope(() => {
        const r = ornamentShape.build(k, p);
        const loop = solid(k, r.parts.find((x) => x.id === 'loop')!.mesh);
        const o = r.slots[0].outline!, T = r.slots[0].thickness;
        const margin = typeof p.lithoMargin === 'number' ? p.lithoMargin : 2;
        const shape = new k.CrossSection([outlinePoints(o)]);
        const prism = (c: InstanceType<Kernel['CrossSection']>) => c.extrude(T + 2).translate([0, 0, -T / 2 - 1]);
        expect(loop.intersect(prism(shape.offset(-margin - 0.01, 'Round'))).volume(), 'over the picture').toBeLessThan(1e-3);
        expect(loop.intersect(prism(shape)).volume(), 'joined to the margin').toBeGreaterThan(1);
      });
    });
});

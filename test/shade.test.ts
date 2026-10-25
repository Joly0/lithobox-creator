import { describe, expect, it } from 'vitest';
import { defaultValues, sanitize } from '../src/core/shape';
import type { ParamValues, PartOutput } from '../src/core/types';
import { loadKernel, withScope, type Kernel } from '../src/geometry/kernel';
import { addLithophanes } from '../src/litho/build';
import type { Luminance } from '../src/litho/mesh';
import { shadeLayout, shadeShape } from '../src/shapes/shade';

const grey: Luminance = { cols: 64, rows: 64, data: new Float32Array(64 * 64).fill(0.5) };

/** A part where the assembled view shows it (its matrix applied), as a solid. */
function placed(k: Kernel, part: PartOutput) {
  const pos = part.mesh.positions, m = part.matrix;
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3)
    for (let a = 0; a < 3; a++) out[i + a] = m ? m[a] * pos[i] + m[4 + a] * pos[i + 1] + m[8 + a] * pos[i + 2] + m[12 + a] : pos[i + a];
  return new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: out, triVerts: part.mesh.indices }));
}

async function build(values: ParamValues) {
  const k = await loadKernel();
  const p = sanitize(shadeShape, { ...defaultValues(shadeShape), ...values });
  const r = withScope(() => shadeShape.build(k, p));
  return { k, p, r };
}

const SHAPES: ParamValues[] = [{ shadeShape: 'cone' }, { shadeShape: 'cylinder', topDiameter: 160, panelHeight: 160 }];

describe('lampshade', () => {
  for (const shape of SHAPES)
    for (const socket of ['e27', 'e14'])
      for (const spider of ['separate', 'joined'])
        it(`hanging ${shape.shadeShape}, ${socket}, spider ${spider}`, async () => {
          const { k, p, r } = await build({ ...shape, mount: 'pendant', socket, spider });
          expect(r.warnings.map((w) => w.key)).toEqual([]);
          withScope(() => {
            addLithophanes(k, r, p, { round: grey }, 1);
            const byId = (id: string) => r.parts.find((x) => x.id === id)!;
            const shade = byId('litho-round');
            // upside down, the rim (and a joined spider) on the bed, all one object
            expect(shade.printRotation).toEqual([-90, 0, 0]);
            const litho = placed(k, shade);
            expect(litho.status()).toBe('NoError');
            const L = shadeLayout(p);
            // the cone's inside: its radius at the bottom and the top edge
            const v = litho.getMesh().vertProperties;
            let rLow = Infinity, rHigh = Infinity;
            for (let i = 0; i < v.length; i += 3) {
              const rr = Math.hypot(v[i], v[i + 1]);
              if (v[i + 2] < L.bottom + 0.6) rLow = Math.min(rLow, rr);
              if (v[i + 2] > L.top - 0.6) rHigh = Math.min(rHigh, rr);
            }
            expect(rLow).toBeCloseTo(L.rBi, 0);
            expect(rHigh).toBeCloseTo(L.rTi, 0);
            const rim = byId(spider === 'joined' ? 'spider' : 'lip');
            expect(rim.object).toBe('litho-round');
            expect(rim.printRotation).toEqual([-90, 0, 0]);
            // the rim reaches into the wall: it joins the shade
            expect(placed(k, rim).intersect(litho).volume()).toBeGreaterThan(1);
            if (spider === 'separate') {
              const sp = placed(k, byId('spider'));
              expect(sp.status()).toBe('NoError');
              // it passes up inside the shade and sits right under the rim
              expect(sp.intersect(litho).volume()).toBeLessThan(1e-3);
              expect(sp.intersect(placed(k, rim)).volume()).toBeLessThan(1e-3);
              expect(sp.translate([0, 0, 0.5]).intersect(placed(k, rim)).volume()).toBeGreaterThan(1);
            }
          });
        });

  for (const shape of SHAPES)
    for (const tableLamp of ['puck', 'socket'])
      it(`standing ${shape.shadeShape}, ${tableLamp}`, async () => {
        const { k, p, r } = await build({ ...shape, mount: 'table', tableLamp });
        expect(r.warnings.map((w) => w.key)).toEqual([]);
        withScope(() => {
          addLithophanes(k, r, p, { round: grey }, 1);
          const shade = r.parts.find((x) => x.id === 'litho-round')!;
          expect(shade.printRotation).toEqual([90, 0, 0]);
          const base = placed(k, r.parts.find((x) => x.id === 'base')!);
          expect(base.status()).toBe('NoError');
          const litho = placed(k, shade);
          // in the groove: not touching, but resting on its bottom
          expect(litho.intersect(base).volume()).toBeLessThan(1e-3);
          expect(litho.translate([0, 0, -0.5]).intersect(base).volume()).toBeGreaterThan(1);
          expect(r.parts.some((x) => x.id === 'spider' || x.id === 'lip')).toBe(false);
        });
      });

  it('warns when the wall leans out too far to print without supports', async () => {
    const { r } = await build({ shadeShape: 'cone', mount: 'pendant', topDiameter: 60, bottomDiameter: 260, panelHeight: 60 });
    expect(r.warnings.map((w) => w.key)).toContain('warn.shadeSteep');
  });
});

describe('lampshade on a lamp foot', () => {
  for (const edge of ['bottom', 'top'])
    for (const shape of SHAPES)
      it(`${shape.shadeShape}, spokes at the ${edge} edge: the spider holds the shade and carries the socket ring`, async () => {
        const { k, p, r } = await build({ ...shape, mount: 'foot', spiderEdge: edge });
        expect(r.warnings.map((w) => w.key)).toEqual([]);
        withScope(() => {
          const spider = placed(k, r.parts.find((x) => x.id === 'spider')!);
          // the shade itself, and the rim it hangs on at its top edge
          const shade = [r.parts.find((x) => x.id === 'panel-round')!, ...r.parts.filter((x) => x.id === 'lip')].map((x) => placed(k, x));
          const L = shadeLayout(p);
          for (const s of shade) expect(spider.intersect(s).volume(), 'apart').toBeLessThan(1e-3);
          // one piece: the spokes join the ring and the plate
          expect(spider.decompose().length, 'one piece').toBe(1);
          // the shade rests on the spider: under its bottom edge, or its rim on the ring at the top
          const rests = edge === 'bottom' ? shade[0] : shade[1];
          expect(spider.translate([0, 0, 0.3]).intersect(rests).volume(), 'carries the shade').toBeGreaterThan(0.1);
          // the clamped plate's top is ringHeight above the shade's bottom edge
          const b = spider.boundingBox();
          const plateTop = edge === 'bottom' ? b.max[2] : b.min[2] + 3;
          expect(plateTop).toBeCloseTo(L.bottom + (p.ringHeight as number), 1);
          // the socket goes through
          const pin = k.Manifold.cylinder(400, L.hole / 2 - 0.2, L.hole / 2 - 0.2, 32).translate([0, 0, -100]);
          expect(spider.intersect(pin).volume(), 'socket hole').toBeLessThan(1e-3);
        });
      });

  it('warns when the bulb would reach out of the shade, and notes supports for flat spokes', async () => {
    const high = await build({ mount: 'foot', ringHeight: 120 });
    expect(high.r.warnings.map((w) => w.key)).toContain('warn.ringTooHigh');
    const low = await build({ mount: 'foot', ringHeight: 40 });
    expect(low.r.info.map((i) => i.key)).toContain('info.spiderSupports');
    const flat = await build({ mount: 'foot', ringHeight: 0 });
    expect(flat.r.info.map((i) => i.key)).not.toContain('info.spiderSupports');
  });
});

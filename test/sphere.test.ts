import { describe, expect, it } from 'vitest';
import { defaultValues, num, sanitize } from '../src/core/shape';
import type { ParamValues, PartOutput } from '../src/core/types';
import { loadKernel, withScope, type Kernel } from '../src/geometry/kernel';
import { addLithophanes } from '../src/litho/build';
import type { Luminance } from '../src/litho/mesh';
import { sphereLayout, sphereShape } from '../src/shapes/sphere';

const grey: Luminance = { cols: 64, rows: 32, data: new Float32Array(64 * 32).fill(0.5) };

/** A part where the assembled view shows it (its matrix applied), as a solid. */
function placed(k: Kernel, part: PartOutput) {
  const pos = part.mesh.positions, m = part.matrix;
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3)
    for (let a = 0; a < 3; a++) out[i + a] = m ? m[a] * pos[i] + m[4 + a] * pos[i + 1] + m[8 + a] * pos[i + 2] + m[12 + a] : pos[i + a];
  return new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: out, triVerts: part.mesh.indices }));
}

async function ball(values: ParamValues) {
  const k = await loadKernel();
  const p = sanitize(sphereShape, { ...defaultValues(sphereShape), ...values });
  const r = withScope(() => sphereShape.build(k, p));
  withScope(() => addLithophanes(k, r, p, { round: grey }, 1));
  return { k, p, r, L: sphereLayout(p), litho: r.parts.find((x) => x.id === 'litho-round')! };
}

// (whole balls take a few seconds each)
describe('ball lamp', { timeout: 60000 }, () => {
  it('stands on its cut over a lamp fitting, closed, with the opening it names', async () => {
    const { k, p, r, L, litho } = await ball({});
    expect(r.warnings.map((w) => w.key)).toEqual([]);
    expect(litho.printRotation).toEqual([90, 0, 0]);
    withScope(() => {
      const s = placed(k, litho);
      expect(s.status()).toBe('NoError');
      const b = s.boundingBox();
      // flat on the floor, up to the top of the ball (its cap at the thinnest)
      expect(b.min[2]).toBeCloseTo(0, 3);
      expect(b.max[2]).toBeCloseTo(L.c + L.rIn + num(p, 'lithoMinThickness'), 0);
      // the opening at the cut: the inside's radius there
      const cut = s.slice(0.05);
      const inside = cut.toPolygons().map((poly) => Math.min(...poly.map(([x, y]) => Math.hypot(x, y))));
      expect(Math.min(...inside)).toBeCloseTo(L.opening, 0);
      // with the defaults the reference ball's opening: about 95 mm
      expect(2 * L.opening).toBeGreaterThan(90);
      expect(2 * L.opening).toBeLessThan(100);
    });
  });

  it('drills the cable hole low at the back', async () => {
    const { k, litho } = await ball({ cableHole: true });
    const { litho: plain } = await ball({ cableHole: false });
    withScope(() => {
      const a = placed(k, litho), b = placed(k, plain);
      // a 15 mm hole through the plain cap (it lies below the picture band, at the thinnest)
      expect(b.volume() - a.volume()).toBeGreaterThan(0.5 * Math.PI * 7.5 * 7.5 * 1);
      // the hole is where the difference is: behind (+y), near the floor
      const d = b.subtract(a).boundingBox();
      expect(d.min[1]).toBeGreaterThan(0);
      expect(d.max[2]).toBeLessThan(25);
    });
    // two whole balls
  }, 60000);

  it('prints standing without supports: every layer rests mostly on the one below', async () => {
    const { k, L, litho } = await ball({});
    withScope(() => {
      const s = placed(k, litho);
      const top = s.boundingBox().max[2];
      for (let z = 0.3; z < top - 1; z += 2) {
        const a = s.slice(z), below = s.slice(z - 0.2);
        const share = a.intersect(below).area() / a.area();
        expect(share, `layer at ${z.toFixed(1)} mm`).toBeGreaterThan(0.5);
      }
      expect(L.c).toBeGreaterThan(0);
    });
  });

  for (const tableLamp of ['puck', 'socket'])
    it(`sits in its base (${tableLamp})`, async () => {
      const { k, r, litho } = await ball({ mount: 'base', tableLamp, sphereDiameter: 160, sphereHeight: 146 });
      expect(r.warnings.map((w) => w.key)).toEqual([]);
      withScope(() => {
        const base = placed(k, r.parts.find((x) => x.id === 'base')!);
        const s = placed(k, litho);
        expect(base.status()).toBe('NoError');
        expect(s.intersect(base).volume()).toBeLessThan(1e-3);
        expect(s.translate([0, 0, -0.5]).intersect(base).volume()).toBeGreaterThan(1);
      });
    });
});

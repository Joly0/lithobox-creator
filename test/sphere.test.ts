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

  for (const [tableLamp, socketInside] of [['puck', false], ['socket', false], ['socket', true]] as const)
    it(`sits in its base (${tableLamp}${socketInside ? ', inside' : ''})`, async () => {
      // an A60 bulb on its socket needs the 20 cm ball when the socket stands inside it
      const size = socketInside ? { sphereDiameter: 200, sphereHeight: 185 } : { sphereDiameter: 160, sphereHeight: 146 };
      const { k, r, litho } = await ball({ mount: 'base', tableLamp, socketInside, ...size });
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

describe('ball lamp cable hole', () => {
  it('is round on the ball, not taller than wide, low on its side', async () => {
    const { loadKernel, withScope } = await import('../src/geometry/kernel');
    const { defaultValues, sanitize } = await import('../src/core/shape');
    const { addLithophanes } = await import('../src/litho/build');
    const { sphereShape } = await import('../src/shapes/sphere');
    const k = await loadKernel();
    const grey = { cols: 64, rows: 64, data: new Float32Array(64 * 64).fill(0.5) };
    const litho = (cableHole: boolean) => {
      const p = sanitize(sphereShape, { ...defaultValues(sphereShape), sphereDiameter: 200, sphereHeight: 185, mount: 'standalone', cableHole });
      const r = withScope(() => sphereShape.build(k, p));
      withScope(() => addLithophanes(k, r, p, { [r.slots[0].id]: grey }, 1));
      const part = r.parts.find((x) => x.id.startsWith('litho-') && !x.id.endsWith('-fins'))!;
      return new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: part.mesh.positions, triVerts: part.mesh.indices }));
    };
    withScope(() => {
      const full = litho(false), holed = litho(true);
      // the wall's mean thickness: volume over half the surface (outside and inside)
      const t = full.volume() / (full.surfaceArea() / 2);
      const removed = full.volume() - holed.volume();
      // a round hole 15 mm across. The mean thickness counts the full-thickness rim, so even a
      // round hole comes out at about 0.8 of this; squeezed sideways by the cosine of its
      // latitude (about 48°, as before the fix) it was about 0.52
      const share = removed / (Math.PI * 7.5 * 7.5 * t);
      expect(share).toBeGreaterThan(0.7);
      expect(share).toBeLessThan(1.1);
    });
  });
});

describe('ball lamp on feet', () => {
  // every base that can stand on feet: the low plate with the socket inside, the socket's drum, a puck light's disc
  const variants: [string, Partial<ParamValues>][] = [
    ['low plate', sphereShape.presets!.find((x) => x.id === 'globeLow')!.values],
    ['socket drum', { mount: 'base', tableLamp: 'socket', socketInside: false }],
    ['puck', { mount: 'base', tableLamp: 'puck', cableChannel: true }],
  ];
  for (const [name, values] of variants)
    it(`stands on three feet, the ball raised by their height, the cable free underneath (${name})`, async () => {
      const k = await loadKernel();
      const build = (feet: boolean) => {
        const p = sanitize(sphereShape, { ...defaultValues(sphereShape), ...values, baseFeet: feet });
        return { p, r: withScope(() => sphereShape.build(k, p)) };
      };
      const on = build(true), off = build(false);
      expect(on.r.warnings.map((w) => w.key)).toEqual([]);
      const lowest = (r: typeof on.r, id: string) => {
        const pos = r.parts.find((x) => x.id === id)!.mesh.positions;
        let z = Infinity;
        for (let i = 2; i < pos.length; i += 3) z = Math.min(z, pos[i]);
        return z;
      };
      // the ball and its base sit higher by the feet, which stand on the floor
      expect(lowest(on.r, 'base')).toBeCloseTo(0, 6);
      const ball = on.r.parts.find((x) => x.preview && x.id.startsWith('panel'))!.id;
      expect(lowest(on.r, ball) - lowest(off.r, ball)).toBeCloseTo(on.p.footHeight as number, 3);
      withScope(() => {
        const part = on.r.parts.find((x) => x.id === 'base')!;
        const base = new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: part.mesh.positions, triVerts: part.mesh.indices }));
        // just under the base: three separate feet (none lost to the cable notch or channel) and nothing else
        const slice = base.slice((on.p.footHeight as number) - 0.5);
        expect(slice.toPolygons().length).toBe(3);
      });
    }, 60000);
});

describe('ball lamp with the socket inside', () => {
  it('stands on a low plate, the bulb clear of the top', () => {
    const p = sanitize(sphereShape, { ...defaultValues(sphereShape), ...sphereShape.presets!.find((x) => x.id === 'globeLow')!.values });
    const L = sphereLayout(p);
    expect(L.warnings).toEqual([]);
    // feet, the nut's recess, 2 mm, the groove: no tall drum
    expect(L.baseTop).toBeLessThan(20);
    // a socket too tall for the ball brings the bulb near its top
    const tall = sanitize(sphereShape, { ...p, socketHeight: 100 });
    expect(sphereLayout(tall).warnings.map((w) => w.key)).toContain('warn.bulbClose');
  });
});

describe('ball lamp presets', () => {
  it('build the same whichever preset was picked before (none keeps the last one\'s lamp or feet)', () => {
    const presets = sphereShape.presets!;
    const shape = (values: Partial<ParamValues>) => {
      const p = sanitize(sphereShape, { ...defaultValues(sphereShape), ...values });
      const L = sphereLayout(p);
      return { mount: p.mount, lamp: p.mount === 'base' ? p.tableLamp : null, baseTop: L.baseTop, lift: L.lift };
    };
    for (const b of presets)
      for (const a of presets) expect(shape({ ...a.values, ...b.values }), `${b.id} after ${a.id}`).toEqual(shape(b.values));
  });
});

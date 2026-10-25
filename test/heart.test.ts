import { describe, expect, it } from 'vitest';
import { defaultValues, num, sanitize, type ShapeDefinition } from '../src/core/shape';
import type { ParamValues, PartOutput } from '../src/core/types';
import { loadKernel, withScope, type Kernel } from '../src/geometry/kernel';
import { addLithophanes } from '../src/litho/build';
import { outlinePoints, type Luminance } from '../src/litho/mesh';
import { loopAnchor, loopWidth } from '../src/shapes/common/outlines';
import { heartShape } from '../src/shapes/heart';
import { panelShape } from '../src/shapes/panel';

const grey: Luminance = { cols: 32, rows: 32, data: new Float32Array(32 * 32).fill(0.5) };

/** A part where the assembled view shows it (its matrix applied), as a solid. */
function placed(k: Kernel, part: PartOutput) {
  const pos = part.mesh.positions, m = part.matrix;
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3)
    for (let a = 0; a < 3; a++) out[i + a] = m ? m[a] * pos[i] + m[4 + a] * pos[i + 1] + m[8 + a] * pos[i + 2] + m[12 + a] : pos[i + a];
  return new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: out, triVerts: part.mesh.indices }));
}

async function build(shape: ShapeDefinition, values: ParamValues) {
  const k = await loadKernel();
  const p = sanitize(shape, { ...defaultValues(shape), ...values });
  await shape.prepare?.(p);
  const r = withScope(() => shape.build(k, p));
  withScope(() => addLithophanes(k, r, p, { front: grey }, 0.5));
  return { k, p, r, litho: r.parts.find((x) => x.id === 'litho-front')! };
}

describe('heart', () => {
  it("standing: a heart in the foot's groove, lying flat to print", async () => {
    const { k, r, litho } = await build(heartShape, { lighting: 'stand' });
    expect(r.warnings.map((w) => w.key)).toEqual([]);
    expect(r.slots[0].outline?.points).toBeDefined();
    expect(litho.printRotation).toEqual([0, 0, 0]);
    withScope(() => {
      const heart = placed(k, litho);
      expect(heart.status()).toBe('NoError');
      const solids = r.parts.filter((x) => !x.preview && !x.id.startsWith('litho-') && x.id !== 'loop').map((x) => placed(k, x));
      expect(solids.length).toBeGreaterThan(0);
      for (const s of solids) expect(heart.intersect(s).volume(), 'apart').toBeLessThan(1e-3);
      // it rests on the groove's bottom with its flat point
      const down = heart.translate([0, 0, -0.5]);
      expect(solids.reduce((v, s) => v + down.intersect(s).volume(), 0)).toBeGreaterThan(1);
    });
  });

  it('on its own: a loop on top, joined, its hole open', async () => {
    const { k, p, r, litho } = await build(heartShape, { lighting: 'plain' });
    withScope(() => {
      const heart = placed(k, litho), loop = r.parts.find((x) => x.id === 'loop')!;
      expect(loop.object).toBe('litho-front');
      const ring = placed(k, loop);
      expect(ring.intersect(heart).volume()).toBeGreaterThan(1);
      const o = r.slots[0].outline!, hole = num(p, 'loopHole');
      const at = loopAnchor(o, outlinePoints(o), loopWidth(hole));
      // the hole's axis runs front to back (the heart faces -Y), at the slot's height
      const m = r.slots[0].matrix;
      const pin = k.Manifold.cylinder(40, hole / 2 - 0.3, hole / 2 - 0.3, 32).rotate([90, 0, 0]).translate([0, 20, m[14] + at.high + 1 + hole / 2]);
      expect(pin.intersect(ring.add(heart)).volume()).toBeLessThan(1e-3);
    });
  });
});

describe('flat picture on its own', () => {
  it('can hang: a loop on top, printed standing with the picture', async () => {
    const { k, r, litho } = await build(panelShape, { lighting: 'plain', loop: true });
    withScope(() => {
      const loop = r.parts.find((x) => x.id === 'loop')!;
      expect(loop.object).toBe('litho-front');
      expect(loop.printRotation).toEqual(litho.printRotation);
      expect(placed(k, loop).intersect(placed(k, litho)).volume()).toBeGreaterThan(1);
    });
  });
});

describe('heart on the stand', () => {
  it('stands in a groove of its own shape: no room to slide sideways', async () => {
    const { k, r, litho } = await build(heartShape, { lighting: 'stand' });
    withScope(() => {
      const heart = placed(k, litho);
      const foot = placed(k, r.parts.find((x) => x.id === 'base')!);
      expect(heart.intersect(foot).volume(), 'fits').toBeLessThan(1e-3);
      // the old groove was as wide as the heart: some 45 mm of play each side at the foot
      for (const dx of [-1, 1]) expect(heart.translate([dx, 0, 0]).intersect(foot).volume(), `held at ${dx} mm`).toBeGreaterThan(0.1);
    });
  });
});

describe('heart on the open foot', () => {
  it('stands in a heart-shaped groove with the puck lying behind it', async () => {
    const { k, r, litho } = await build(heartShape, { lighting: 'base' });
    expect(r.warnings.map((w) => w.key)).toEqual([]);
    withScope(() => {
      const heart = placed(k, litho);
      const base = placed(k, r.parts.find((x) => x.id === 'base')!);
      const solids = r.parts.filter((x) => !x.preview && !x.id.startsWith('litho-') && x.id !== 'loop').map((x) => placed(k, x));
      for (const s of solids) expect(heart.intersect(s).volume(), 'apart').toBeLessThan(1e-3);
      expect(heart.translate([0, 0, -0.5]).intersect(base).volume(), 'rests in the groove').toBeGreaterThan(0.1);
      for (const dx of [-1, 1]) expect(heart.translate([dx, 0, 0]).intersect(base).volume(), `held at ${dx} mm`).toBeGreaterThan(0.1);
      const lamp = r.parts.find((x) => x.id === 'lamp')!;
      expect(lamp).toBeDefined();
      // the heart faces -Y: the puck lies behind it
      expect(placed(k, lamp).boundingBox().min[1], 'puck behind the heart').toBeGreaterThan(heart.boundingBox().max[1]);
    });
  });
});

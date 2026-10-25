import { describe, expect, it } from 'vitest';
import { defaultValues, sanitize, type ShapeDefinition } from '../src/core/shape';
import type { ParamValues, PartOutput } from '../src/core/types';
import { loadKernel, withScope, type Kernel } from '../src/geometry/kernel';
import { arcLayout, arcShape } from '../src/shapes/arc';

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
  return { k, p, r };
}

describe('arc on the open stand', () => {
  it('default sizes: no warnings, the picture free of foot and holder', async () => {
    const { k, r } = await build(arcShape, { lighting: 'stand' });
    expect(r.warnings.map((w) => w.key)).toEqual([]);
    withScope(() => {
      const picture = placed(k, r.parts.find((x) => x.id === 'panel-arc')!);
      expect(picture.status()).toBe('NoError');
      for (const id of ['base', 'holder'])
        expect(picture.intersect(placed(k, r.parts.find((x) => x.id === id)!)).volume(), id).toBeLessThan(1e-3);
    });
  });

  it('the holder plugs into the foot, free of it in place', async () => {
    const { k, r } = await build(arcShape, { lighting: 'stand' });
    withScope(() => {
      const foot = placed(k, r.parts.find((x) => x.id === 'base')!);
      const holder = placed(k, r.parts.find((x) => x.id === 'holder')!);
      expect(holder.intersect(foot).volume(), 'apart in place').toBeLessThan(1e-3);
      expect(holder.translate([0, 0, -0.5]).intersect(foot).volume(), 'held').toBeGreaterThan(0.1);
    });
  });

  it('the puck stands behind the picture, inside the curve', async () => {
    const { k, p, r } = await build(arcShape, { lighting: 'stand' });
    withScope(() => {
      const lamp = placed(k, r.parts.find((x) => x.id === 'lamp')!);
      // the viewer is at -Y: behind is larger y than the picture's back surface at its middle
      const L = arcLayout(p);
      expect(L.holder).not.toBeNull();
      const shift = (L.rOut + L.gap + L.rim - L.yBack) / 2;
      expect(lamp.boundingBox().min[1], 'lamp behind the picture').toBeGreaterThan(-L.rIn + shift);
    });
  });

  it('a tightly bent arc warns that the holder does not fit', async () => {
    const { r } = await build(arcShape, { lighting: 'stand', arcRadius: 50, arcWidth: 120 });
    expect(r.warnings.map((w) => w.key)).toContain('warn.holderTooBig');
  });
});

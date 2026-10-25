// In the exploded view every lithophane is still lit as in the assembled lamp: its light point
// moves with it (a ball lifted past its bulb was lit from below and turned black).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultValues, sanitize, type ShapeDefinition } from '../src/core/shape';
import type { ParamValues, Vec3 } from '../src/core/types';
import { loadKernel, withScope } from '../src/geometry/kernel';
import { lithoExplode } from '../src/litho/build';
import { shapes } from '../src/shapes';
import { explodedLight, irradiance, lampFor, shapeLamp } from '../src/ui/lamplight';

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Defaults, every preset, and every choice of how the shape is lit or mounted. */
function variants(shape: ShapeDefinition): [string, Partial<ParamValues>][] {
  const out: [string, Partial<ParamValues>][] = [['default', {}]];
  for (const p of shape.presets ?? []) out.push([p.id, p.values]);
  for (const key of ['lighting', 'mount'])
    for (const def of shape.groups.flatMap((g) => g.params))
      if (def.key === key && def.type === 'select') for (const o of def.options) out.push([`${key}=${o}`, { [key]: o }]);
  return out;
}

describe('exploded view lighting', () => {
  for (const shape of shapes)
    for (const [name, over] of variants(shape))
      it(`${shape.id} ${name}: each picture keeps its light when exploded`, async () => {
        const k = await loadKernel();
        const p = sanitize(shape, { ...defaultValues(shape), ...over });
        await shape.prepare?.(p);
        const r = withScope(() => shape.build(k, p));
        const lamp = shapeLamp(r);
        for (const s of r.slots) {
          const m = s.matrix;
          const c: Vec3 = [m[12], m[13], m[14]], n: Vec3 = [m[8], m[9], m[10]];
          const size = Math.max(s.width, s.height);
          const L = lampFor(c, n, lamp, size, !!s.wrap);
          // a point on the picture a little in front of its middle, assembled and exploded
          const at: Vec3 = add(c, [n[0] * 5, n[1] * 5, n[2] * 5]);
          const e = lithoExplode(s);
          const assembled = irradiance(at, L, n, size);
          expect(irradiance(add(at, e), explodedLight(L, e, 1), n, size), s.id).toBeCloseTo(assembled, 9);
        }
      });

  it('the old way (light left where the lamp is) really did change the ball', async () => {
    const k = await loadKernel();
    const ball = shapes.find((s) => s.id === 'sphere')!;
    const r = withScope(() => ball.build(k, sanitize(ball, defaultValues(ball))));
    const s = r.slots[0], m = s.matrix;
    const c: Vec3 = [m[12], m[13], m[14]];
    const L = lampFor(c, [0, -1, 0], shapeLamp(r), s.height, true);
    // the bottom of the ball, facing down and out
    const low: Vec3 = add(c, [0, -60, -70]), n: Vec3 = [0, -0.65, -0.76];
    const e = lithoExplode(s);
    expect(irradiance(low, L, n, 200)).toBeGreaterThan(0);
    expect(irradiance(add(low, e), L, n, 200), 'lit from below: black').toBe(0);
  });

  it('the viewer moves the light point with the part', () => {
    const src = readFileSync('src/ui/viewer.ts', 'utf8');
    expect(src).toContain('explodedLight(v.lampAt');
  });
});

import { describe, expect, it } from 'vitest';
import { defaultValues, sanitize } from '../src/core/shape';
import type { ParamValues } from '../src/core/types';
import { loadKernel, withScope } from '../src/geometry/kernel';
import { addLithophanes } from '../src/litho/build';
import type { Luminance } from '../src/litho/mesh';
import { sphereShape } from '../src/shapes/sphere';

const flat = (v: number): Luminance => ({ cols: 16, rows: 16, data: new Float32Array(256).fill(v) });

/** Thickness of the relief near the middle of the band, in front (x = 0) and behind (half way round). */
async function build(values: ParamValues, pictures: Record<string, Luminance>) {
  const k = await loadKernel();
  const p = sanitize(sphereShape, { ...defaultValues(sphereShape), projection: 'front', ...values });
  const r = withScope(() => sphereShape.build(k, p));
  withScope(() => addLithophanes(k, r, p, pictures, 1));
  const relief = r.parts.find((x) => x.id === 'litho-round');
  const slot = r.slots[0];
  const sph = slot.wrap!.sphere!;
  // middle of the band in panel y, and half way round in panel x
  const yMid = (sph.band[0] + sph.band[1]) / 2 - sph.sMid;
  const xBack = slot.width / 2;
  const at = (x: number) => {
    const l = relief!.mesh.local!;
    let best = Infinity, t = 0;
    for (let i = 0; i < l.length; i += 3) {
      const d = Math.hypot(Math.min(Math.abs(l[i] - x), Math.abs(Math.abs(l[i]) - Math.abs(x))), l[i + 1] - yMid);
      if (d < best) (best = d), (t = l[i + 2]);
    }
    return t;
  };
  return { r, relief, front: () => at(0), back: () => at(xBack - 1) };
}

describe('ball: second photo on the back', () => {
  it('a second slot whose picture goes into the ball', async () => {
    const { r } = await build({ backPhoto: true }, {});
    expect(r.slots.map((s) => [s.id, s.pictureOf])).toEqual([['round', undefined], ['back', 'round']]);
    expect(r.slots[0].wrap!.sphere!.back).toBe(true);
    // only for the front projection
    const { r: band } = await build({ backPhoto: true, projection: 'band' }, {});
    expect(band.slots.map((s) => s.id)).toEqual(['round']);
  });

  it('the front photo in front, the back photo behind', async () => {
    const { r, relief, front, back } = await build({ backPhoto: true }, { round: flat(0), back: flat(1) });
    expect(r.parts.filter((x) => x.id.startsWith('litho-'))).toHaveLength(1);
    const T = r.slots[0].thickness;
    expect(relief).toBeDefined();
    expect(front()).toBeCloseTo(T, 1);
    expect(back()).toBeLessThan(T / 2);
    const swapped = await build({ backPhoto: true }, { round: flat(1), back: flat(0) });
    expect(swapped.front()).toBeLessThan(T / 2);
    expect(swapped.back()).toBeCloseTo(T, 1);
  });

  it('only a back photo: still a relief, white in front', async () => {
    const { r, relief, front, back } = await build({ backPhoto: true }, { back: flat(0) });
    expect(relief).toBeDefined();
    const T = r.slots[0].thickness;
    expect(front()).toBeLessThan(T / 2);
    expect(back()).toBeCloseTo(T, 1);
  });
});

import { describe, expect, it } from 'vitest';
import { ABSORB_PER_MM, thicknessFor } from '../src/litho/mesh';

const light = (t: number, t0: number) => Math.exp(-ABSORB_PER_MM * (t - t0));
const srgb = (l: number) => (l <= 0.04045 ? l / 12.92 : ((l + 0.055) / 1.055) ** 2.4);

describe('brightness curve', () => {
  it('white is the thinnest, black the full thickness, on both curves', () => {
    for (const curve of ['light', 'linear'] as const) {
      expect(thicknessFor(1, 0.8, 3, curve)).toBeCloseTo(0.8, 9);
      expect(thicknessFor(0, 0.8, 3, curve)).toBeCloseTo(3, 9);
    }
  });

  it('darker is always thicker', () => {
    let last = -1;
    for (let l = 1; l >= 0; l -= 0.01) {
      const t = thicknessFor(l, 0.8, 3);
      expect(t).toBeGreaterThan(last);
      last = t;
    }
  });

  it("the light let through follows the photo's brightness", () => {
    const t0 = 0.8, T = 3, floor = light(T, t0);
    for (const l of [0.2, 0.5, 0.8]) expect(light(thicknessFor(l, t0, T), t0)).toBeCloseTo(floor + (1 - floor) * srgb(l), 9);
  });

  it('a panel with no room for relief stays at its thickness', () => {
    expect(thicknessFor(0.5, 2, 2)).toBe(2);
  });
});

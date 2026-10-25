import { describe, expect, it } from 'vitest';
import { defaultValues, num, sanitize } from '../src/core/shape';
import type { ParamValues } from '../src/core/types';
import { shadeLayout, shadeShape } from '../src/shapes/shade';
import { sphereLayout, sphereShape } from '../src/shapes/sphere';

describe('layouts at the edge of the allowed values', () => {
  it('a small conformal sphere keeps its picture band below the pole', () => {
    const p = sanitize(sphereShape, {
      ...defaultValues(sphereShape),
      sphereDiameter: 60, sphereHeight: 40, panelThickness: 8, bandBottom: 70, bandTop: 80, projection: 'conformal',
    } as ParamValues);
    expect(num(p, 'bandBottom')).toBe(70);
    const L = sphereLayout(p);
    expect(L.band[1]).toBeGreaterThan(L.band[0]);
    expect(L.picture.every(Number.isFinite)).toBe(true);
    expect(L.warnings.map((w) => w.key)).toContain('warn.sphereBand');
  });

  it('a pendant shade too thick for its narrow end gets a thinner wall and a warning', () => {
    const p = sanitize(shadeShape, {
      ...defaultValues(shadeShape),
      shadeShape: 'cone', mount: 'pendant', topDiameter: 300, bottomDiameter: 50, panelHeight: 40, panelThickness: 8,
    } as ParamValues);
    const L = shadeLayout(p);
    expect(L.rBi).toBeGreaterThan(0.999);
    expect(L.rTi).toBeGreaterThan(0.999);
    expect(L.thick).toBeLessThan(8);
    expect(L.warnings.map((w) => w.key)).toContain('warn.shadeThick');
  });
});

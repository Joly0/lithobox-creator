import { describe, expect, it } from 'vitest';
import { loadKernel, withScope } from '../src/geometry/kernel';

describe('withScope', () => {
  it('frees results of instance methods, not only static constructors', async () => {
    const { Manifold, CrossSection } = await loadKernel();
    const solid = withScope(() => Manifold.cube([1, 1, 1]).translate([1, 0, 0]).add(Manifold.cube([1, 1, 1])));
    expect(() => solid.volume()).toThrow();
    const shape = withScope(() => new CrossSection([[[0, 0], [1, 0], [0, 1]]]).translate([1, 1]));
    expect(() => shape.area()).toThrow();
    const extruded = withScope(() => CrossSection.square(1).extrude(1));
    expect(() => extruded.volume()).toThrow();
  });

  it('an inner scope frees only what it created', async () => {
    const { Manifold } = await loadKernel();
    withScope(() => {
      const inner = withScope(() => Manifold.cube([1, 1, 1]).translate([0, 0, 1]));
      expect(() => inner.volume()).toThrow();
      const kept = Manifold.cube([2, 2, 2]).translate([0, 0, 1]);
      withScope(() => kept.add(Manifold.cube([1, 1, 1])));
      expect(kept.volume()).toBeCloseTo(8);
    });
  });
});

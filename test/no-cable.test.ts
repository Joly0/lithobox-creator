import { describe, expect, it } from 'vitest';
import { defaultValues, sanitize } from '../src/core/shape';
import type { MeshData, ParamValues } from '../src/core/types';
import { loadKernel, withScope } from '../src/geometry/kernel';
import { shapes } from '../src/shapes';

/** Volume of a closed mesh (sum of signed tetrahedra). */
function volume({ positions: v, indices: t }: MeshData): number {
  let s = 0;
  for (let i = 0; i < t.length; i += 3) {
    const [a, b, c] = [t[i] * 3, t[i + 1] * 3, t[i + 2] * 3];
    s += v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c]) + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c]);
  }
  return s / 6;
}

describe('lamp cable: none', () => {
  for (const shape of shapes.filter((s) => s.groups.some((g) => g.params.some((q) => q.key === 'cableMode'))))
    it(`${shape.id}: no cable hole or channel`, async () => {
      const k = await loadKernel();
      const build = async (over: ParamValues) => {
        const p = sanitize(shape, { ...defaultValues(shape), ...over });
        await shape.prepare?.(p);
        const r = withScope(() => shape.build(k, p));
        return { vol: r.parts.filter((x) => !x.preview).reduce((n, x) => n + volume(x.mesh), 0), warnings: r.warnings.map((w) => w.key) };
      };
      const cable = await build({ cableMode: 'bottom', cableChannel: true });
      const none = await build({ cableMode: 'none', cableChannel: true });
      expect(none.warnings).not.toContain('warn.cableOutside');
      // shapes whose default has no lamp base cut no hole either way
      expect(none.vol).toBeGreaterThanOrEqual(cable.vol - 1e-6);
      if (['box', 'panel', 'polygon'].includes(shape.id)) expect(none.vol).toBeGreaterThan(cable.vol + 10);
    });
});

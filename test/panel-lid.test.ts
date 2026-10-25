import { describe, expect, it } from 'vitest';
import { defaultValues, sanitize } from '../src/core/shape';
import type { MeshData } from '../src/core/types';
import { loadKernel, withScope, type Kernel } from '../src/geometry/kernel';
import { LID_JOINTS } from '../src/shapes/box/params';
import { panelLayout, panelShape } from '../src/shapes/panel';

const solid = (k: Kernel, m: MeshData) => new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

describe('light box hood closures', () => {
  for (const lidJoint of LID_JOINTS)
    it(`${lidJoint}: fits, closed, hood and base apart`, async () => {
      const k = await loadKernel();
      let p = sanitize(panelShape, { ...defaultValues(panelShape), lighting: 'box', lidJoint });
      if (lidJoint === 'latch') {
        // a 10 mm arm reaches through the 10 mm base: it says so, and a shorter one fits
        expect(panelLayout(p).warnings.map((w) => w.key)).toEqual(['warn.noRoom']);
        p = sanitize(panelShape, { ...p, latchLength: 5 });
      }
      expect(panelLayout(p).warnings.map((w) => w.key)).toEqual([]);
      expect(panelLayout(p).joint.magnetsFit).toBe(lidJoint === 'plugMagnet' || lidJoint === 'magnet');
      withScope(() => {
        const r = panelShape.build(k, p);
        const byId = (id: string) => solid(k, r.parts.find((x) => x.id === id)!.mesh);
        const base = byId('base'), hood = byId('hood');
        for (const m of [base, hood]) expect(m.status()).toBe('NoError');
        expect(hood.intersect(base).volume(), 'hood and base').toBeLessThan(1e-3);
        // the picture still slides in freely
        const pic = byId('panel-front');
        expect(pic.intersect(base).volume()).toBeLessThan(1e-3);
        expect(pic.intersect(hood).volume()).toBeLessThan(1e-3);
      });
    });
});

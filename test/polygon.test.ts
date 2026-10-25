import { describe, expect, it } from 'vitest';
import { defaultValues, sanitize } from '../src/core/shape';
import type { MeshData } from '../src/core/types';
import { loadKernel, withScope, type Kernel } from '../src/geometry/kernel';
import { polygonLayout, polygonShape } from '../src/shapes/polygon';
import { SIDES } from '../src/shapes/polygon/params';
import { LID_JOINTS } from '../src/shapes/box/params';

const solid = (k: Kernel, m: MeshData) => new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

describe('polygon lamp', () => {
  for (const sides of SIDES)
    it(`${sides} sides: closed parts, one picture per side, nothing in the pictures' way`, async () => {
      const k = await loadKernel();
      const p = sanitize(polygonShape, { ...defaultValues(polygonShape), sides });
      const L = polygonLayout(p);
      // a triangle with 80 mm sides is too narrow for the 64 mm lamp seat, and its sharp
      // corners leave too little room for plug and magnet in 14 mm posts; it says so
      const tri = sides === '3' ? ['warn.lampTooBig', 'warn.magnetNoFit'] : [];
      expect(L.warnings.map((w) => w.key).sort()).toEqual(tri);
      expect(L.joint.magnetsFit).toBe(sides !== '3');
      withScope(() => {
        const r = polygonShape.build(k, p);
        expect(r.slots.map((s) => s.id)).toEqual(Array.from({ length: Number(sides) }, (_, i) => `side${i + 1}`));
        const real = r.parts.filter((x) => !x.preview);
        expect(real.map((x) => x.id)).toEqual(['body', 'lid']);
        for (const part of real) {
          const m = solid(k, part.mesh);
          expect(m.status(), part.id).toBe('NoError');
          expect(m.volume(), part.id).toBeGreaterThan(1000);
        }
        const body = solid(k, real[0].mesh), lid = solid(k, real[1].mesh);
        const panels = r.parts.filter((x) => x.id.startsWith('panel-')).map((x) => solid(k, x.mesh));
        expect(panels).toHaveLength(Number(sides));
        panels.forEach((a, i) => {
          // pictures stand in their grooves, with the slot clearance all round
          expect(a.intersect(body).volume(), `side ${i + 1} in the body`).toBeLessThan(1e-3);
          expect(a.intersect(lid).volume(), `side ${i + 1} in the lid`).toBeLessThan(1e-3);
          const b = panels[(i + 1) % panels.length];
          expect(a.intersect(b).volume(), `sides ${i + 1} and ${i + 2}`).toBeLessThan(1e-3);
        });
        // the closure's plugs sit in their sockets: lid and body never share material
        expect(lid.intersect(body).volume(), 'lid and body').toBeLessThan(1e-3);
        // the posts hold the pictures: each side's ends reach into the body
        const g = L.gap;
        for (const s of r.slots) {
          const m = s.matrix;
          for (const e of [-1, 1]) {
            const x = (e * (s.width / 2 + g + 1)) as number;
            const at = [m[12] + m[0] * x, m[13] + m[1] * x, m[14]];
            // just past the picture's end, on its mid-plane: the post's material
            const probe = k.Manifold.cube([0.4, 0.4, 0.4], true).translate(at as [number, number, number]);
            expect(probe.intersect(body).volume(), `${s.id} end ${e} held by a post`).toBeGreaterThan(0.05);
          }
        }
      });
    });

  for (const lidJoint of LID_JOINTS)
    for (const sides of SIDES)
      it(`${sides} sides, ${lidJoint}: fits, closed, lid and body apart`, async () => {
        const k = await loadKernel();
        let p = sanitize(polygonShape, { ...defaultValues(polygonShape), sides, lidJoint, lampDiameter: 40 });
        // where a closure does not fit, the post size the warning names makes it fit
        const tight = polygonLayout(p).warnings.find((w) => w.key === 'warn.magnetNoFit');
        if (tight) p = sanitize(polygonShape, { ...p, postSize: Math.ceil(Number(tight.vars!.post) * 2) / 2 });
        expect(polygonLayout(p).warnings.map((w) => w.key)).toEqual([]);
        withScope(() => {
          const r = polygonShape.build(k, p);
          const [body, lid] = r.parts.filter((x) => !x.preview).map((x) => solid(k, x.mesh));
          for (const m of [body, lid]) expect(m.status()).toBe('NoError');
          expect(lid.intersect(body).volume()).toBeLessThan(1e-3);
          // the closure is really there: the lid reaches below its own underside, or has pockets
          const plain = sanitize(polygonShape, { ...p, lidJoint: 'magnet', magnetDiameter: 30 });
          const bare = solid(k, polygonShape.build(k, plain).parts[1].mesh);
          expect(Math.abs(lid.volume() - bare.volume()), 'the closure changes the lid').toBeGreaterThan(1);
        });
      });
});

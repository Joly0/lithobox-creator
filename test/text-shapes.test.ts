// Base and lid text on every shape that has a base or a lid (the box has its own tests).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultValues, num, sanitize, type ShapeDefinition } from '../src/core/shape';
import type { MeshData, ParamValues } from '../src/core/types';
import { loadKernel, withScope, type Kernel } from '../src/geometry/kernel';
import { FONT_URLS, setFontLoader } from '../src/geometry/text';
import { arcShape } from '../src/shapes/arc';
import { cylinderLayout, cylinderShape } from '../src/shapes/cylinder';
import { panelShape } from '../src/shapes/panel';
import { polygonShape } from '../src/shapes/polygon';

setFontLoader(async (id) => {
  const b = readFileSync('.' + FONT_URLS[id].split('?')[0]);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
});

const solid = (k: Kernel, m: MeshData) => new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

const CASES: { shape: ShapeDefinition; values: ParamValues; host: string; lid?: string }[] = [
  { shape: polygonShape, values: {}, host: 'body', lid: 'lid' },
  { shape: cylinderShape, values: { lighting: 'base', topRing: true }, host: 'base', lid: 'ring' },
  { shape: arcShape, values: { lighting: 'base' }, host: 'base' },
  { shape: panelShape, values: { lighting: 'box' }, host: 'base' },
];

async function build(shape: ShapeDefinition, values: ParamValues) {
  const k = await loadKernel();
  const p = sanitize(shape, { ...defaultValues(shape), ...values });
  await shape.prepare?.(p);
  return { k, r: withScope(() => shape.build(k, p)), p };
}

describe('text on every shape', () => {
  for (const c of CASES) {
    it(`${c.shape.id}: base text raised, engraved, inlaid, in a second colour`, async () => {
      const { k, r: plain } = await build(c.shape, c.values);
      for (const [style, second] of [['raised', false], ['engraved', false], ['inlay', false], ['raised', true]] as const) {
        const { r } = await build(c.shape, { ...c.values, baseText: 'Oma 2026', baseTextStyle: style, textSecondColor: second });
        expect(r.warnings.map((w) => w.key), `${style}`).not.toContain('warn.textShrunkBase');
        withScope(() => {
          const host = solid(k, r.parts.find((x) => x.id === c.host)!.mesh);
          const v0 = solid(k, plain.parts.find((x) => x.id === c.host)!.mesh).volume();
          expect(host.status()).toBe('NoError');
          if (style === 'raised' && !second) expect(host.volume(), 'raised adds').toBeGreaterThan(v0 + 1);
          if (style !== 'raised') expect(host.volume(), `${style} cuts`).toBeLessThan(v0 - 1);
          const vol = r.parts.find((x) => x.id === 'text-base');
          expect(!!vol, 'own volume').toBe(style === 'inlay' || second);
          if (vol) {
            expect(vol.object).toBe(c.host);
            const t = solid(k, vol.mesh);
            expect(t.status()).toBe('NoError');
            const b = t.boundingBox(), hb = solid(k, plain.parts.find((x) => x.id === c.host)!.mesh).boundingBox();
            // centred at the front of the base
            expect(Math.abs((b.min[0] + b.max[0]) / 2 - (hb.min[0] + hb.max[0]) / 2), 'centred').toBeLessThan(1);
            expect(b.min[1] - hb.min[1], 'at the front').toBeLessThan(second ? 0 : 1.5);
            expect(b.max[2]).toBeLessThan(hb.max[2] + 0.01);
          }
        });
      }
    });

    if (c.lid)
      it(`${c.shape.id}: lid text engraved and inlaid`, async () => {
        const { k, r: plain } = await build(c.shape, c.values);
        for (const style of ['engraved', 'inlay']) {
          const { r } = await build(c.shape, { ...c.values, topText: 'Hallo', topTextStyle: style });
          expect(r.warnings.map((w) => w.key)).not.toContain('warn.textShrunkTop');
          withScope(() => {
            const lid = solid(k, r.parts.find((x) => x.id === c.lid)!.mesh);
            const before = solid(k, plain.parts.find((x) => x.id === c.lid)!.mesh);
            expect(lid.status()).toBe('NoError');
            expect(lid.volume(), 'engraved into the top').toBeLessThan(before.volume() - 0.5);
            const vol = r.parts.find((x) => x.id === 'text-top');
            expect(!!vol).toBe(style === 'inlay');
            if (vol) {
              expect(vol.object).toBe(c.lid);
              // flush with the lid's top, in front of its middle
              const b = solid(k, vol.mesh).boundingBox();
              expect(b.max[2]).toBeCloseTo(before.boundingBox().max[2], 3);
              expect(b.max[1]).toBeLessThan(0);
            }
          });
        }
      });
  }

  it('cylinder: the base text follows the curve', async () => {
    const values = { lighting: 'base', baseText: 'Oma und Opa', baseTextStyle: 'inlay' };
    const { k, r, p } = await build(cylinderShape, values);
    const R = cylinderLayout(p).rBase, d = num(p, 'textDepth');
    withScope(() => {
      const pos = solid(k, r.parts.find((x) => x.id === 'text-base')!.mesh).getMesh().vertProperties;
      for (let i = 0; i < pos.length; i += 3) {
        const rr = Math.hypot(pos[i], pos[i + 1]);
        expect(rr).toBeGreaterThan(R - d - 0.05);
        expect(rr).toBeLessThan(R + 0.05);
      }
    });
  });
});

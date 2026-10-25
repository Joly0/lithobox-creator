// The battery tray under every shape with a base (the box has its own tests).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultValues, sanitize, type ShapeDefinition } from '../src/core/shape';
import type { MeshData, ParamValues } from '../src/core/types';
import { loadKernel, withScope, type Kernel } from '../src/geometry/kernel';
import { FONT_URLS, setFontLoader } from '../src/geometry/text';
import { arcShape } from '../src/shapes/arc';
import { cylinderShape } from '../src/shapes/cylinder';
import { panelShape } from '../src/shapes/panel';
import { polygonShape } from '../src/shapes/polygon';
import { shadeShape } from '../src/shapes/shade';
import { SIDES } from '../src/shapes/polygon/params';

setFontLoader(async (id) => {
  const b = readFileSync('.' + FONT_URLS[id].split('?')[0]);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
});

const solid = (k: Kernel, m: MeshData) => new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

const CASES: { name: string; shape: ShapeDefinition; values: ParamValues; host: string }[] = [
  ...SIDES.map((sides) => ({ name: `polygon ${sides}`, shape: polygonShape, values: { sides, lampDiameter: 40, lidJoint: 'magnet' }, host: 'body' })),
  { name: 'light box', shape: panelShape, values: { lighting: 'box' }, host: 'base' },
  { name: 'open stand', shape: panelShape, values: { lighting: 'stand' }, host: 'base' },
  { name: 'cylinder', shape: cylinderShape, values: { lighting: 'base' }, host: 'base' },
  { name: 'arc', shape: arcShape, values: { lighting: 'base' }, host: 'base' },
  { name: 'standing lampshade', shape: shadeShape, values: { mount: 'table', tableLamp: 'puck' }, host: 'base' },
];

async function build(shape: ShapeDefinition, values: ParamValues) {
  const k = await loadKernel();
  const p = sanitize(shape, { ...defaultValues(shape), ...values });
  await shape.prepare?.(p);
  const r = withScope(() => shape.build(k, p));
  return { k, r };
}

describe('battery tray on every shape', () => {
  for (const c of CASES)
    for (const powerJoint of ['magnets', 'pegs', 'none'])
      it(`${c.name}, ${powerJoint}: closed, round the shape, the shape stands in it`, async () => {
        const { k, r } = await build(c.shape, { ...c.values, powerBase: true, powerJoint });
        expect(r.warnings.map((w) => w.key)).toEqual([]);
        withScope(() => {
          const tray = solid(k, r.parts.find((x) => x.id === 'power')!.mesh);
          const host = solid(k, r.parts.find((x) => x.id === c.host)!.mesh);
          expect(tray.status()).toBe('NoError');
          expect(tray.volume()).toBeGreaterThan(1000);
          // the shape stands in the rim and on the pillars, pegs in its holes: nothing shared
          expect(tray.intersect(host).volume()).toBeLessThan(1e-3);
          const tb = tray.boundingBox(), hb = host.boundingBox();
          for (const a of [0, 1]) {
            expect(tb.min[a]).toBeLessThan(hb.min[a]);
            expect(tb.max[a]).toBeGreaterThan(hb.max[a]);
          }
          // the shape's bottom (z = 0) is below the tray's rim: it stands in it
          expect(tb.max[2]).toBeGreaterThan(hb.min[2] + 3);
          if (powerJoint !== 'none') {
            // the shape's underside has the pockets or holes for the pillars' magnets or pegs
            const { r: plain } = withScope(() => ({ r: c.shape.build(k, sanitize(c.shape, { ...defaultValues(c.shape), ...c.values })) }));
            expect(host.volume()).toBeLessThan(solid(k, plain.parts.find((x) => x.id === c.host)!.mesh).volume() - 1);
          }
        });
      });

  for (const c of CASES)
    it(`${c.name}: switch and LED window in the front wall, text on the tray`, async () => {
      const base = { ...c.values, powerBase: true, switchOffset: 0, ledWindowOffset: 0 };
      const { k, r: plain } = await build(c.shape, base);
      const { r } = await build(c.shape, { ...base, switchType: 'round', ledWindow: true, ledWindowOffset: 0, switchOffset: 0, buttonDiameter: 10, ledWindowWidth: 10 });
      // a round button and an LED window side by side would overlap at 0: move the window aside
      const { r: both } = await build(c.shape, { ...base, switchType: 'round', buttonDiameter: 10, ledWindow: true, ledWindowWidth: 10, ledWindowOffset: 14 });
      expect(r.warnings.map((w) => w.key)).toContain('warn.switchLed');
      expect(both.warnings.map((w) => w.key)).toEqual([]);
      const { r: text } = await build(c.shape, { ...base, baseText: 'Oma', baseTextStyle: 'engraved' });
      withScope(() => {
        const vol = (x: typeof r, id: string) => solid(k, x.parts.find((q) => q.id === id)!.mesh).volume();
        expect(vol(both, 'power'), 'holes in the front wall').toBeLessThan(vol(plain, 'power') - 10);
        // the base text goes on the tray's front, the shape's base keeps its own
        expect(vol(text, 'power')).toBeLessThan(vol(plain, 'power') - 1);
        expect(vol(text, c.host)).toBeCloseTo(vol(plain, c.host), 3);
      });
    });
});

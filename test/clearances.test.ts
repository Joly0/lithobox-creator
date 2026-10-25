import { describe, expect, it } from 'vitest';
import { allParams, defaultValues, sanitize, type ShapeDefinition } from '../src/core/shape';
import type { ParamValues, PartOutput } from '../src/core/types';
import { loadKernel, withScope, type Kernel } from '../src/geometry/kernel';
import { addLithophanes } from '../src/litho/build';
import type { Luminance } from '../src/litho/mesh';
import { boxLayout } from '../src/shapes/box/layout';
import { heartShape } from '../src/shapes/heart';
import { shapes } from '../src/shapes';

const grey: Luminance = { cols: 32, rows: 32, data: new Float32Array(32 * 32).fill(0.5) };

/** Every clearance and its default: 0.05 mm per side looser than the exact fits used before. */
const DEFAULTS: Record<string, number> = {
  slotClearance: 0.7,
  slotWidthClearance: 0.7,
  plugClearance: 0.2,
  magnetClearance: 0.2,
  bankClearance: 1.1,
  powerTrayClearance: 0.35,
  discClearance: 0.25,
  holderClearance: 0.2,
  hoodClearance: 0.35,
  frameClearance: 0.25,
  spiderClearance: 0.35,
};

function placed(k: Kernel, part: PartOutput) {
  const pos = part.mesh.positions, m = part.matrix;
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3)
    for (let a = 0; a < 3; a++) out[i + a] = m ? m[a] * pos[i] + m[4 + a] * pos[i + 1] + m[8 + a] * pos[i + 2] + m[12 + a] : pos[i + a];
  return new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: out, triVerts: part.mesh.indices }));
}

describe('clearances', () => {
  for (const s of shapes as ShapeDefinition[])
    it(`${s.id}: one clearances category, not advanced, with the shared defaults`, () => {
      const groups = s.groups.filter((g) => g.id === 'clearances');
      if (s.id === 'ornament') return expect(groups).toEqual([]);
      expect(groups.length).toBe(1);
      for (const d of groups[0].params) {
        expect(d.advanced, d.key).toBeFalsy();
        expect(d.default, d.key).toBe(DEFAULTS[d.key]);
      }
      // a clearance lives only in this category
      const elsewhere = s.groups.filter((g) => g.id !== 'clearances').flatMap((g) => g.params).filter((d) => d.key in DEFAULTS);
      expect(elsewhere.map((d) => d.key)).toEqual([]);
      expect(allParams(s).filter((d) => d.key === 'slotClearance').length).toBeLessThanOrEqual(1);
    });

  it('shows the settings the old layout hid: frame lighting, magnets under the stand', () => {
    const panel = shapes.find((s) => s.id === 'panel')!;
    const shown = (v: ParamValues) => {
      const p = sanitize(panel, { ...defaultValues(panel), ...v });
      return allParams(panel).filter((d) => !d.visibleIf || d.visibleIf(p)).map((d) => d.key);
    };
    expect(shown({ lighting: 'frame' })).toEqual(expect.arrayContaining(['slotClearance', 'slotWidthClearance', 'frameClearance']));
    expect(shown({ lighting: 'stand', powerBase: true, powerJoint: 'magnets' })).toEqual(expect.arrayContaining(['magnetDiameter', 'magnetHeight', 'magnetClearance', 'holderClearance']));
    expect(shown({ lighting: 'stand' })).not.toContain('hoodClearance');
  });

  it('the box: the width play is its own setting, the thickness play stays', () => {
    const p = (v: ParamValues) => sanitize(shapes[0], { ...defaultValues(shapes[0]), ...v });
    const a = boxLayout(p({})), b = boxLayout(p({ slotWidthClearance: 1.5 }));
    expect(a.wgap).toBeCloseTo(0.35, 6);
    expect(b.wgap).toBeCloseTo(0.75, 6);
    expect(b.gap).toBeCloseTo(a.gap, 6);
  });

  it('the heart on its stand: room along its edges by the width play, held beyond it', async () => {
    const k = await loadKernel();
    const p = sanitize(heartShape, { ...defaultValues(heartShape), lighting: 'stand' });
    const r = withScope(() => heartShape.build(k, p));
    withScope(() => addLithophanes(k, r, p, { front: grey }, 0.5));
    withScope(() => {
      const heart = placed(k, r.parts.find((x) => x.id === 'litho-front')!);
      const foot = placed(k, r.parts.find((x) => x.id === 'base')!);
      const wg = (p.slotWidthClearance as number) / 2;
      for (const dx of [-1, 1]) {
        expect(heart.translate([dx * (wg - 0.05), 0, 0]).intersect(foot).volume(), 'free within the play').toBeLessThan(1e-3);
        expect(heart.translate([dx * 1, 0, 0]).intersect(foot).volume(), 'held beyond it').toBeGreaterThan(0.1);
      }
    });
  });
});

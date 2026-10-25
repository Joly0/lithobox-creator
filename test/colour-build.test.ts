import { describe, expect, it } from 'vitest';
import { defaultValues, sanitize, type ShapeDefinition } from '../src/core/shape';
import type { ParamValues, PartOutput } from '../src/core/types';
import { loadKernel, withScope, type Kernel } from '../src/geometry/kernel';
import { BASE, LAYER } from '../src/litho/colour';
import { addLithophanes, colourLayers, thinnest } from '../src/litho/build';
import type { Luminance } from '../src/litho/mesh';
import { boxShape } from '../src/shapes/box';
import { cylinderShape } from '../src/shapes/cylinder';
import { ornamentShape } from '../src/shapes/ornament';

/** Left half red, right half mid grey. */
function picture(): Luminance {
  const n = 32, data = new Float32Array(n * n), rgb = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const red = i < n / 2, o = j * n + i;
      data[o] = red ? 0.3 : 0.5;
      rgb.set(red ? [0.9, 0.1, 0.1] : [0.5, 0.5, 0.5], o * 3);
    }
  return { cols: n, rows: n, data, rgb };
}

const solid = (k: Kernel, part: PartOutput) => new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: part.mesh.positions, triVerts: part.mesh.indices }));

async function build(shape: ShapeDefinition, values: ParamValues, slot?: string) {
  const k = await loadKernel();
  const p = sanitize(shape, { ...defaultValues(shape), ...values });
  await shape.prepare?.(p);
  const r = withScope(() => shape.build(k, p));
  withScope(() => addLithophanes(k, r, p, { [slot ?? r.slots[0].id]: picture() }, 0.6));
  return { k, p, r };
}

describe('colour lithophanes', () => {
  it('box: white relief plus nested cyan, magenta, yellow volumes of one object, lying flat', async () => {
    const { k, p, r } = await build(boxShape, { lithoColour: true }, 'front');
    const litho = r.parts.find((x) => x.id === 'litho-front')!;
    const colours = ['yellow', 'magenta', 'cyan'].map((c) => r.parts.find((x) => x.id === `litho-front-${c}`)!);
    // white first, then yellow, magenta, cyan: the slicer lets later volumes win
    const order = r.parts.filter((x) => x.object === 'litho-front').map((x) => x.id);
    expect(order).toEqual(['litho-front', 'litho-front-yellow', 'litho-front-magenta', 'litho-front-cyan']);
    expect(colours.map((c) => c.extruder)).toEqual([4, 3, 2]);
    for (const c of colours) {
      expect(c.printOnly).toBe(true);
      expect(c.printRotation).toEqual([0, 0, 0]);
    }
    expect(litho.printRotation).toEqual([0, 0, 0]);
    expect(litho.slicer?.layer_height).toBe(String(LAYER));
    expect(r.parts.some((x) => x.id === 'litho-front-fins')).toBe(false);
    // shows its back: mirrored in z
    const m = litho.matrix!;
    const det = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
    expect(det).toBeLessThan(0);
    withScope(() => {
      const white = solid(k, litho);
      expect(white.status()).toBe('NoError');
      const slot = r.slots.find((s) => s.id === 'front')!;
      const back = -slot.thickness / 2;
      const top = back + BASE + LAYER * colourLayers(slot, p);
      for (const c of colours) {
        const s = solid(k, c);
        expect(s.status(), c.id).toBe('NoError');
        // inside the white relief, from the base layer up, never above the stack's height
        expect(s.subtract(white).volume(), c.id).toBeLessThan(1e-3);
        const b = s.boundingBox();
        expect(b.min[2]).toBeCloseTo(back + BASE, 6);
        expect(b.max[2]).toBeLessThanOrEqual(top + 1e-6);
      }
      // the relief stays above the stack
      expect(thinnest(slot, p)).toBeGreaterThanOrEqual(BASE + LAYER * colourLayers(slot, p));
      // red half: magenta and yellow layers; the grey half only the skin
      const [yellow, , cyan] = colours.map((c) => solid(k, c));
      const W = slot.width, H = slot.height;
      const half = (s: ReturnType<typeof solid>, left: boolean) => s.intersect(k.Manifold.cube([W / 2 - 3, H - 6, 10]).translate([left ? -W / 2 + 3 : 0, -H / 2 + 3, -5])).volume();
      expect(half(yellow, true)).toBeGreaterThan(50);
      expect(half(yellow, false)).toBeLessThan(0.02 * (W / 2) * H);
      expect(half(cyan, true)).toBeLessThan(0.02 * (W / 2) * H);
    });
  });

  it('ornament: the colour cut to the outline', async () => {
    const { k, r } = await build(ornamentShape, { lithoColour: true, outline: 'star' }, 'picture');
    withScope(() => {
      const white = solid(k, r.parts.find((x) => x.id === 'litho-picture')!);
      for (const c of ['cyan', 'magenta', 'yellow']) {
        const s = solid(k, r.parts.find((x) => x.id === `litho-picture-${c}`)!);
        expect(s.status()).toBe('NoError');
        expect(s.subtract(white).volume()).toBeLessThan(1e-3);
      }
    });
  });

  it('curved pictures have no colour setting and stay mono', async () => {
    expect(defaultValues(cylinderShape).lithoColour).toBeUndefined();
    const { r } = await build(cylinderShape, { lithoColour: true });
    expect(r.parts.some((x) => /-(cyan|magenta|yellow)$/.test(x.id))).toBe(false);
  });

  it('mono pictures are unchanged by the colour settings', async () => {
    const { r } = await build(boxShape, { lithoColour: false, colourLayers: 12 }, 'front');
    expect(r.parts.some((x) => /-(cyan|magenta|yellow)$/.test(x.id))).toBe(false);
    expect(r.parts.find((x) => x.id === 'litho-front')!.printRotation).toEqual([90, 0, 0]);
  });
});

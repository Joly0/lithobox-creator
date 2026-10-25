// The flat picture in a slim frame lit by an LED strip.
import { describe, expect, it } from 'vitest';
import { defaultValues, num, sanitize } from '../src/core/shape';
import type { PartOutput } from '../src/core/types';
import { loadKernel, withScope, type Kernel } from '../src/geometry/kernel';
import { addLithophanes } from '../src/litho/build';
import type { Luminance } from '../src/litho/mesh';
import { panelShape } from '../src/shapes/panel';

const grey: Luminance = { cols: 32, rows: 32, data: new Float32Array(32 * 32).fill(0.5) };

function placed(k: Kernel, part: PartOutput) {
  const pos = part.mesh.positions, m = part.matrix;
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3)
    for (let a = 0; a < 3; a++) out[i + a] = m ? m[a] * pos[i] + m[4 + a] * pos[i + 1] + m[8 + a] * pos[i + 2] + m[12 + a] : pos[i + a];
  return new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: out, triVerts: part.mesh.indices }));
}

describe('LED strip frame', () => {
  for (const frameFoot of [true, false])
    it(`frame, back${frameFoot ? ', foot' : ''}: closed, apart, the picture held, the strip's groove open`, async () => {
      const k = await loadKernel();
      const p = sanitize(panelShape, { ...defaultValues(panelShape), lighting: 'frame', frameFoot });
      const r = withScope(() => panelShape.build(k, p));
      expect(r.warnings).toEqual([]);
      withScope(() => {
        addLithophanes(k, r, p, { front: grey }, 1);
        const get = (id: string) => placed(k, r.parts.find((x) => x.id === id)!);
        const frame = get('frame'), back = get('back'), pic = get('litho-front');
        const solids = [frame, back, ...(frameFoot ? [get('foot')] : [])];
        for (const s of solids) expect(s.status()).toBe('NoError');
        for (let i = 0; i < solids.length; i++)
          for (let j = i + 1; j < solids.length; j++) expect(solids[i].intersect(solids[j]).volume(), `parts ${i} ${j}`).toBeLessThan(1e-3);
        // the picture between the lip and the insert: touching neither, held within the clearance
        for (const s of [frame, back]) expect(pic.intersect(s).volume()).toBeLessThan(1e-3);
        const g = num(p, 'slotClearance');
        expect(pic.translate([0, -g, 0]).intersect(frame).volume(), 'the lip in front').toBeGreaterThan(1);
        expect(pic.translate([0, g, 0]).intersect(back).volume(), 'the insert behind').toBeGreaterThan(1);
        // a strip along the bottom of the insert's inside, in its groove: no material in the way
        const b = back.boundingBox(), fb = frame.boundingBox();
        const W = num(p, 'panelWidth'), strip = num(p, 'stripWidth');
        const inner = pic.boundingBox();
        const ym = (inner.max[1] + 0.3 + (fb.max[1])) / 2;
        const z = inner.min[2] + 0.2 + 2 + 0.3; // the insert's inside, above its 2 mm wall
        const piece = k.Manifold.cube([W - 40, strip - 0.6, 0.6], true).rotate([0, 0, 0]).translate([0, ym, z - 0.4]);
        expect(piece.intersect(back).volume(), 'the strip fits its groove').toBeLessThan(1e-3);
        expect(b.max[1]).toBeGreaterThan(fb.max[1]);
      });
    });
});

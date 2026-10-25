// Every shape stands on the floor the viewer draws, assembled and in the print view (where
// each slicer object must rest on z = 0, side by side without overlapping). New shapes and
// lighting options are covered without writing anything.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultValues, sanitize, type ShapeDefinition } from '../src/core/shape';
import type { ParamValues } from '../src/core/types';
import { loadKernel, withScope } from '../src/geometry/kernel';
import { FONT_URLS, setFontLoader } from '../src/geometry/text';
import { addLithophanes } from '../src/litho/build';
import type { Luminance } from '../src/litho/mesh';
import { shapes } from '../src/shapes';
import { groundLevel, partMinZ, printLayout } from '../src/ui/printlayout';

setFontLoader(async (id) => {
  const b = readFileSync('.' + FONT_URLS[id].split('?')[0]);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
});

function variants(shape: ShapeDefinition): [string, Partial<ParamValues>][] {
  const out: [string, Partial<ParamValues>][] = [['default', {}]];
  for (const p of shape.presets ?? []) out.push([`preset ${p.id}`, p.values]);
  for (const g of shape.groups)
    for (const d of g.params)
      if (d.type === 'select' && (g.id === 'light' || d.key === 'lighting')) for (const o of d.options) out.push([`${d.key}=${o}`, { [d.key]: o }]);
  return out;
}

const picture: Luminance = { cols: 16, rows: 16, data: Float32Array.from({ length: 256 }, (_, i) => (i % 16) / 15) };

function xRange(p: { mesh: { positions: Float32Array }; matrix?: number[] }, a = 0): [number, number] {
  const pos = p.mesh.positions, m = p.matrix;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const x = m ? m[a] * pos[i] + m[4 + a] * pos[i + 1] + m[8 + a] * pos[i + 2] + m[12 + a] : pos[i + a];
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  return [lo, hi];
}

describe('parts stand on the floor', () => {
  for (const shape of shapes)
    for (const [name, over] of variants(shape))
      it(`${shape.id} ${name}`, async () => {
        const k = await loadKernel();
        const p = sanitize(shape, { ...defaultValues(shape), ...over });
        await shape.prepare?.(p);
        const r = withScope(() => {
          const res = shape.build(k, p);
          addLithophanes(k, res, p, Object.fromEntries(res.slots.map((s) => [s.id, picture])), 2);
          return res;
        });
        // assembled: the lowest real part touches the floor
        expect(groundLevel(r.parts)).toBeCloseTo(0, 3);

        // print view: every object on z = 0, the floor at z = 0, no two objects overlapping
        const { parts: laid, plates } = printLayout(r.parts);
        expect(groundLevel(laid)).toBeCloseTo(0, 3);
        const objects = new Map<string, number>();
        const ranges = new Map<string, [number, number, number, number]>();
        const src = new Map(r.parts.map((x) => [x.id, x]));
        for (const part of laid) {
          const key = src.get(part.id)!.object ?? part.id;
          objects.set(key, Math.min(objects.get(key) ?? Infinity, partMinZ(part)));
          const [lo, hi] = xRange(part);
          const [ylo, yhi] = xRange(part, 1);
          const was = ranges.get(key);
          ranges.set(key, was ? [Math.min(was[0], lo), Math.max(was[1], hi), Math.min(was[2], ylo), Math.max(was[3], yhi)] : [lo, hi, ylo, yhi]);
        }
        for (const [key, z] of objects) expect(z, `${key} rests on the bed`).toBeCloseTo(0, 3);
        // one plate per object, each object centred on its own plate
        expect(plates.length).toBe(ranges.size);
        [...ranges.values()].forEach((b, i) => {
          expect((b[0] + b[1]) / 2, 'centred on its plate (x)').toBeCloseTo(plates[i].x, 3);
          expect((b[2] + b[3]) / 2, 'centred on its plate (y)').toBeCloseTo(plates[i].y, 3);
        });
      });
});

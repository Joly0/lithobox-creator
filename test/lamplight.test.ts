// Every shape, preset and lighting option must give each lithophane usable light in the lamp
// view: a lamp behind the picture, enough light at the centre, no corner far off. A new shape
// or lighting option is covered here without writing anything.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultValues, sanitize, type ShapeDefinition } from '../src/core/shape';
import type { ParamValues, Vec3 } from '../src/core/types';
import { orientGroup, printMatrix } from '../src/export/transform';
import { loadKernel, withScope } from '../src/geometry/kernel';
import { FONT_URLS, setFontLoader } from '../src/geometry/text';
import { shapes } from '../src/shapes';
import { irradiance, lampFor, shapeLamp } from '../src/ui/lamplight';

setFontLoader(async (id) => {
  const b = readFileSync('.' + FONT_URLS[id].split('?')[0]);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
});

/** Defaults, each preset, and each option of every select in the shape's light group. */
function variants(shape: ShapeDefinition): [string, Partial<ParamValues>][] {
  const out: [string, Partial<ParamValues>][] = [['default', {}]];
  for (const p of shape.presets ?? []) out.push([`preset ${p.id}`, p.values]);
  for (const g of shape.groups)
    for (const d of g.params)
      if (d.type === 'select' && (g.id === 'light' || d.key === 'lighting')) for (const o of d.options) out.push([`${d.key}=${o}`, { [d.key]: o }]);
  return out;
}

const col = (m: number[], c: number): Vec3 => {
  const v: Vec3 = [m[c * 4], m[c * 4 + 1], m[c * 4 + 2]];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};

export const report: string[] = [];

describe('lamp view light', () => {
  for (const shape of shapes)
    for (const [name, over] of variants(shape))
      it(`${shape.id} ${name}: every picture is lit from behind`, async () => {
        const k = await loadKernel();
        const p = sanitize(shape, { ...defaultValues(shape), ...over });
        await shape.prepare?.(p);
        const r = withScope(() => shape.build(k, p));
        const lamp = shapeLamp(r);
        for (const s of r.slots) {
          const m = s.matrix;
          const c: Vec3 = [m[12], m[13], m[14]];
          const [xa, ya, n] = [col(m, 0), col(m, 1), col(m, 2)];
          const size = Math.max(s.width, s.height);
          const reach = size * 0.9;
          if (s.wrap) {
            // round a cylinder: lit from inside, every side and height gets light
            const L = lampFor(c, n, lamp, size, true);
            const rel = [0, 1, 2].map((a) => L[a] - c[a]);
            const along = rel[0] * ya[0] + rel[1] * ya[1] + rel[2] * ya[2];
            const off = Math.hypot(...rel.map((v, a) => v - along * ya[a]));
            expect(off, `${s.id}: lamp inside the cylinder`).toBeLessThan(s.wrap.radius);
            const r = s.wrap.radius + s.thickness;
            const reachW = Math.max(2 * r, s.height) * 0.9;
            // all the way round, or across an arc's span
            const span = s.wrap.open ? s.width / (s.wrap.radius + s.thickness / 2) : 2 * Math.PI;
            for (let k = 0; k < 8; k++) {
              const ang = s.wrap.open ? span * (k / 7 - 0.5) : (k * Math.PI) / 4;
              const nn = [0, 1, 2].map((a) => Math.sin(ang) * xa[a] + Math.cos(ang) * n[a]) as Vec3;
              const at = (h: number) => [0, 1, 2].map((a) => c[a] + nn[a] * r + ya[a] * h) as Vec3;
              const mid = irradiance(at(0), L, nn, reachW);
              expect(mid, `${s.id}: light at ${Math.round((ang * 180) / Math.PI)} degrees`).toBeGreaterThan(0.05);
              for (const h of [-0.45, 0.45]) {
                const x = irradiance(at(h * s.height), L, nn, reachW) / mid;
                report.push(`${shape.id} ${name} ${s.id} ${Math.round((ang * 180) / Math.PI)}deg ${h}: ${x.toFixed(2)}`);
                expect(x, `${s.id}: top and bottom not too dark`).toBeGreaterThan(0.1);
                expect(x, `${s.id}: top and bottom not too bright`).toBeLessThan(6);
              }
            }
            continue;
          }
          const L = lampFor(c, n, lamp, size);
          const back = (L[0] - c[0]) * n[0] + (L[1] - c[1]) * n[1] + (L[2] - c[2]) * n[2];
          expect(back, `${s.id}: lamp behind the picture`).toBeLessThan(0);
          const e0 = irradiance(c, L, n, reach);
          const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([u, v]) => {
            const q: Vec3 = [0, 1, 2].map((a) => c[a] + (xa[a] * u * s.width) / 2 + (ya[a] * v * s.height) / 2) as Vec3;
            return irradiance(q, L, n, reach) / e0;
          });
          report.push(`${shape.id} ${name} ${s.id}: centre ${e0.toFixed(3)} corners ${corners.map((x) => x.toFixed(2)).join(' ')}`);
          expect(e0, `${s.id}: light at the centre`).toBeGreaterThan(0.05);
          for (const x of corners) {
            expect(x, `${s.id}: corner not too dark`).toBeGreaterThan(0.1);
            expect(x, `${s.id}: corner not too bright`).toBeLessThan(6);
          }
        }
      });

  it('print matrix matches the print orientation', () => {
    const positions = new Float32Array([0, 0, 0, 10, 0, 0, 0, 20, 0, 0, 0, 5, 3, 4, 5]);
    for (const rot of [[90, 0, 0], [-90, 0, 0], [180, 0, 0], [0, 90, 30]] as Vec3[]) {
      const [out] = orientGroup([{ positions, indices: new Uint32Array(0) }], rot);
      const R = printMatrix(rot, [0, 0, 0]);
      const t = [0, 1, 2].map((a) => out[a] - (R[a] * positions[0] + R[4 + a] * positions[1] + R[8 + a] * positions[2]));
      const M = printMatrix(rot, t as Vec3);
      for (let i = 0; i < positions.length; i += 3)
        for (let a = 0; a < 3; a++) expect(M[a] * positions[i] + M[4 + a] * positions[i + 1] + M[8 + a] * positions[i + 2] + M[12 + a]).toBeCloseTo(out[i + a], 4);
    }
  });

  it.skipIf(!process.env.LAMP_REPORT)('report', () => console.log(report.join('\n')));
});

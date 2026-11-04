import { describe, expect, it } from 'vitest';
import { allParams, defaultValues, sanitize, type ShapeDefinition } from '../src/core/shape';
import type { NumberParam, ParamValues } from '../src/core/types';
import { shapes } from '../src/shapes';
import { boxShape } from '../src/shapes/box';
import { boxLayout } from '../src/shapes/box/layout';

const count = (shape: ShapeDefinition, p: ParamValues, warns: string[]) => shape.validate!(p).filter((w) => warns.includes(w.key)).length;

describe('settings that make room for others', () => {
  for (const shape of shapes) {
    it(`${shape.id}: the defaults already leave room`, () => {
      expect(sanitize(shape, {})).toEqual(defaultValues(shape));
    });

    for (const l of shape.limits ?? []) {
      if (!('warns' in l)) continue;
      const def = allParams(shape).find((d) => d.key === l.key) as NumberParam | undefined;
      if (!def) continue;
      it(`${shape.id}: ${l.key} stops at the smallest size that clears its warnings`, () => {
        const p = sanitize(shape, { [l.key]: def.min });
        const v = p[l.key] as number;
        const best = count(shape, { ...p, [l.key]: def.max }, l.warns);
        expect(count(shape, p, l.warns)).toBe(best);
        if (v > def.min) expect(count(shape, { ...p, [l.key]: +(v - def.step).toFixed(4) }, l.warns)).toBeGreaterThan(best);
      });
    }
  }

  for (const lidJoint of ['plugMagnet', 'magnet', 'plug', 'pegs', 'latch'])
    it(`box: a post never shrinks below its ${lidJoint} closure`, () => {
      const p = sanitize(boxShape, { lidJoint, magnetDiameter: 4, magnetHeight: 2, postSize: 8 });
      expect(p.postSize).toBeGreaterThan(8);
      const keys = boxLayout(p).warnings.map((w) => w.key);
      for (const k of ['warn.magnetNoFit', 'warn.noRoom', 'warn.postTooThin']) expect(keys).not.toContain(k);
    });

  it('box: the post grows with a bigger magnet', () => {
    expect(boxLayout(sanitize(boxShape, { magnetDiameter: 10 })).magnetsFit).toBe(true);
  });

  it('box: battery base magnets stay small enough for their pillars', () => {
    const p = sanitize(boxShape, { powerBase: true, powerJoint: 'magnets', magnetDiameter: 15 });
    expect(p.magnetDiameter).toBe(9);
    expect(boxLayout(p).warnings.map((w) => w.key)).not.toContain('warn.magnetNoFit');
  });
});

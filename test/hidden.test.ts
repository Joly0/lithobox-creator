import { describe, expect, it } from 'vitest';
import { defaultValues, sanitize } from '../src/core/shape';
import { loadKernel, withScope } from '../src/geometry/kernel';
import { addLithophanes } from '../src/litho/build';
import type { Luminance } from '../src/litho/mesh';
import { shapes } from '../src/shapes';
import { hiddenParts, isLamp, isLithophane } from '../src/ui/hidden';

const white: Luminance = { cols: 64, rows: 64, data: new Float32Array(64 * 64).fill(1) };

describe('show lithophanes / show lamp toggles', () => {
  for (const shape of shapes)
    for (const photos of [false, true])
      it(`${shape.id} ${photos ? 'with' : 'without'} photos`, async () => {
        const k = await loadKernel();
        const p = sanitize(shape, defaultValues(shape));
        await shape.prepare?.(p);
        const parts = withScope(() => {
          const r = shape.build(k, p);
          if (photos) addLithophanes(k, r, p, { ...Object.fromEntries(r.slots.map((s) => [s.id, white])), back: white }, 2);
          return r.parts.filter((x) => !x.printOnly);
        });
        const lithos = parts.filter(isLithophane).map((x) => x.id);
        const lamps = parts.filter(isLamp).map((x) => x.id);
        expect(lithos.length).toBeGreaterThan(0);
        if (photos) expect(parts.some((x) => x.relief)).toBe(true);

        expect(hiddenParts(parts, true, true)).toEqual([]);
        // every relief is a lithophane, so hiding them hides the photos too
        expect(hiddenParts(parts, false, true)).toEqual(lithos);
        expect(hiddenParts(parts, false, true)).toEqual(expect.arrayContaining(parts.filter((x) => x.relief).map((x) => x.id)));
        expect(hiddenParts(parts, true, false)).toEqual(lamps);
        expect(lamps.every((id) => !lithos.includes(id))).toBe(true);
        // nothing else is hidden
        expect(hiddenParts(parts, false, false).sort()).toEqual([...lithos, ...lamps].sort());
      });
});

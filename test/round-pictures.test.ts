// A wrap all the way round with several photos side by side: a slot per photo, one stitched picture.
import { describe, expect, it } from 'vitest';
import type { PanelSlot } from '../src/core/types';
import { photoSlots, stitchRound } from '../src/litho/build';
import type { Luminance } from '../src/litho/mesh';

const grid = (v: number): Luminance => ({ cols: 4, rows: 2, data: new Float32Array(8).fill(v) });
const slot = (pictures?: number): PanelSlot => ({ id: 'round', width: 300, height: 104, thickness: 3, matrix: [], wrap: { radius: 47 }, pictures });

describe('several pictures round a wrap', () => {
  it('gives each picture a strip of the circumference', () => {
    expect(photoSlots([slot()], { lithoMargin: 2 }).map((s) => [s.id, s.width, s.height])).toEqual([['round', 300, 100]]);
    expect(photoSlots([slot(3)], { lithoMargin: 2 }).map((s) => [s.id, s.width])).toEqual([['round1', 100], ['round2', 100], ['round3', 100]]);
  });

  it('centres the first on the front and fills a missing one with white', () => {
    const g = stitchRound([grid(0.1), undefined, grid(0.3)]);
    expect([g.cols, g.rows]).toEqual([12, 2]);
    // the middle column (u = 0.5) is picture 1, the one to its right after it picture 2 (white)
    const row = Array.from(g.data.slice(0, 12));
    expect(row).toEqual([0.3, 0.3, 0.3, 0.3, 0.1, 0.1, 0.1, 0.1, 1, 1, 1, 1].map(Math.fround));
  });

  it('wraps the strips past the seam for two pictures', () => {
    const row = Array.from(stitchRound([grid(0.1), grid(0.5)]).data.slice(0, 8));
    expect(row).toEqual([0.5, 0.5, 0.1, 0.1, 0.1, 0.1, 0.5, 0.5].map(Math.fround));
  });
});

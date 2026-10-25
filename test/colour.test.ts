import { describe, expect, it } from 'vitest';
import { CELL, DEFAULT_FILAMENTS, colourMap, compensate, hexLight, lightY, separator, toLight } from '../src/litho/colour';

const stackOf = separator(DEFAULT_FILAMENTS, 7);
const total = (n: number[]) => n[0] + n[1] + n[2];

describe('colour separation', () => {
  it('greys get no colour', () => {
    for (const v of [0, 0.2, 0.5, 0.9, 1]) expect(stackOf(v, v, v).n).toEqual([0, 0, 0]);
  });

  it('red is magenta and yellow, cyan is cyan, blue is cyan and magenta', () => {
    const red = stackOf(1, 0, 0).n, cyan = stackOf(0, 0.7, 1).n, blue = stackOf(0, 0, 1).n;
    expect(red[0]).toBe(0);
    expect(red[1]).toBeGreaterThan(0);
    expect(red[2]).toBeGreaterThan(0);
    expect(cyan[0]).toBeGreaterThan(0);
    expect(cyan[1] + cyan[2]).toBeLessThan(cyan[0]);
    expect(blue[0]).toBeGreaterThan(0);
    expect(blue[1]).toBeGreaterThan(0);
  });

  it('never more layers than allowed', () => {
    for (const layers of [3, 7, 10]) {
      const s = separator(DEFAULT_FILAMENTS, layers);
      for (let i = 0; i < 200; i++) expect(total(s(Math.random(), Math.random(), Math.random()).n)).toBeLessThanOrEqual(layers);
    }
  });

  it("the filter leans the photo's way: its strongest channel is the photo's", () => {
    for (const c of [[1, 0.3, 0.2], [0.2, 0.8, 0.3], [0.3, 0.3, 1]] as [number, number, number][]) {
      const f = stackOf(...c).filter;
      expect(f.indexOf(Math.max(...f))).toBe(c.indexOf(Math.max(...c)));
    }
  });

  it('a pale colour gets fewer layers than a strong one', () => {
    expect(total(stackOf(1, 0.85, 0.85).n)).toBeLessThan(total(stackOf(1, 0.2, 0.2).n));
  });

  it("the relief makes up the filter's darkening", () => {
    expect(compensate(0.5, [1, 1, 1])).toBeCloseTo(0.5, 9);
    const f = stackOf(1, 0.2, 0.2).filter, l = 0.3;
    // relief light times filter brightness is the photo's light (when not clamped)
    expect(toLight(compensate(l, f)) * lightY(f)).toBeCloseTo(toLight(l), 6);
    expect(compensate(1, [0.1, 0.1, 0.1])).toBeCloseTo(1, 9);
  });

  it('cells of about a line width over the picture', () => {
    const rgb = new Float32Array(4 * 2 * 3);
    for (let i = 0; i < 8; i++) rgb.set(i % 4 < 2 ? [1, 0, 0] : [0.5, 0.5, 0.5], i * 3);
    const m = colourMap(rgb, 4, 2, 44, 22, stackOf);
    expect([m.cols, m.rows]).toEqual([Math.round(44 / CELL), Math.round(22 / CELL)]);
    // left half red, right half grey
    expect(total([...m.n.slice(0, 3)])).toBeGreaterThan(0);
    const last = (m.cols - 1) * 3;
    expect([...m.n.slice(last, last + 3)]).toEqual([0, 0, 0]);
  });

  it('reads filament colours', () => {
    expect(hexLight('#ffffff')).toEqual([1, 1, 1]);
    expect(hexLight('nonsense')).toEqual([1, 1, 1]);
    expect(hexLight('#000000')).toEqual([0, 0, 0]);
  });
});

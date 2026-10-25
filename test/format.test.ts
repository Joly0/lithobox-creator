import { describe, expect, it } from 'vitest';
import { linkFormat, pictureSize } from '../src/core/format';
import { allParams, defaultValues, sanitize } from '../src/core/shape';
import type { ParamValues } from '../src/core/types';
import { boxShape } from '../src/shapes/box';
import { heartShape } from '../src/shapes/heart';
import { panelShape } from '../src/shapes/panel';
import { polygonShape } from '../src/shapes/polygon';

const params = allParams(boxShape);
const box = (v: Partial<ParamValues>) => sanitize(boxShape, { ...defaultValues(boxShape), ...v });
const link = { width: 'panelWidth', height: 'panelHeight' };

/** Change one setting as the panel does, then let the format follow. */
function change(p: ParamValues, key: string, value: ParamValues[string]): ParamValues {
  const before = { ...p };
  p[key] = value;
  linkFormat(p, params, key, before);
  return p;
}

describe('picture format', () => {
  it('is offered by the box, the polygon and the flat picture, not the heart', () => {
    for (const s of [boxShape, polygonShape, panelShape]) expect(allParams(s).some((d) => d.key === 'picFormat')).toBe(true);
    expect(allParams(heartShape).some((d) => d.key === 'picFormat')).toBe(false);
  });

  it('sets the height from the width, measured on the picture inside the margin', () => {
    // 156 wide: a 152 mm picture, 114 high in 4:3, plus 2 x 2 mm margin
    const p = change(box({ panelWidth: 156 }), 'picFormat', '4:3');
    expect(p.panelWidth).toBe(156);
    expect(p.panelHeight).toBe(118);
    const [w, h] = pictureSize(p, link);
    expect(w / h).toBeCloseTo(4 / 3, 2);
  });

  it('keeps the format whichever side is changed', () => {
    const p = change(box({}), 'picFormat', '16:9');
    change(p, 'panelWidth', 200);
    expect(p.panelWidth).toBe(200);
    expect(p.panelHeight).toBe(114.5); // 196 / 16 * 9 = 110.25, + 4, to the half mm
    change(p, 'panelHeight', 130);
    expect(p.panelHeight).toBe(130);
    expect(p.panelWidth).toBe(228); // 126 * 16 / 9 = 224, + 4
  });

  it('stops at a slider limit and pulls the other side back', () => {
    // 9:16 portrait at 300 wide would need a height past the 300 mm limit
    const p = change(box({ panelWidth: 300 }), 'picFormat', '9:16');
    expect(p.panelHeight).toBe(300);
    expect(p.panelWidth).toBe(170.5); // 296 / 16 * 9 = 166.5, + 4
  });

  it('linked again, keeps the proportions it had', () => {
    const p = change(box({ panelWidth: 150, panelHeight: 100 }), 'picFormat', 'custom');
    expect([p.panelWidth, p.panelHeight]).toEqual([150, 100]);
    change(p, 'panelWidth', 194);
    // 146 x 96 before; 190 wide keeps 146:96, so 124.9 high, + 4
    expect(p.panelHeight).toBe(129);
  });

  it('follows a new margin, the width kept', () => {
    const p = change(box({ panelWidth: 156 }), 'picFormat', '1:1');
    change(p, 'lithoMargin', 5);
    expect(p.panelWidth).toBe(156);
    expect(p.panelHeight).toBe(156);
    const q = change(box({ panelWidth: 156 }), 'picFormat', '4:3');
    change(q, 'lithoMargin', 5);
    expect(q.panelHeight).toBe(119.5); // 146 * 3 / 4 = 109.5, + 10
  });

  it('does nothing while free', () => {
    const p = change(box({ panelWidth: 150, panelHeight: 100 }), 'panelWidth', 200);
    expect([p.panelWidth, p.panelHeight]).toEqual([200, 100]);
  });

  it('loaded with sizes that do not fit, it takes the format they match, or free', () => {
    expect(box({ picFormat: '4:3', panelWidth: 156, panelHeight: 156 }).picFormat).toBe('1:1');
    expect(box({ picFormat: '4:3', panelWidth: 156, panelHeight: 101 }).picFormat).toBe('free');
    expect(box({ picFormat: '4:3', panelWidth: 156, panelHeight: 118 }).picFormat).toBe('4:3');
    // linked to their own proportions: any sizes fit
    expect(box({ picFormat: 'custom', panelWidth: 156, panelHeight: 101 }).picFormat).toBe('custom');
  });
});

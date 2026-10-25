import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultValues, sanitize } from '../src/core/shape';
import type { ParamValues } from '../src/core/types';
import { orientForPrint } from '../src/export/transform';
import { toStl } from '../src/export/stl';
import { loadKernel, withScope } from '../src/geometry/kernel';
import { FONT_URLS, setFontLoader } from '../src/geometry/text';
import { panelLayout, panelShape, standLayout } from '../src/shapes/panel';

// vite's ?url imports resolve to project paths like /src/assets/fonts/x.ttf
setFontLoader(async (id) => {
  const b = readFileSync('.' + FONT_URLS[id].split('?')[0]);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
});

const variants: Record<string, Partial<ParamValues>> = {
  default: {},
  plain: { lighting: 'plain' },
  small: { panelWidth: 60, panelHeight: 60, lampDiameter: 40 },
  landscape: { panelWidth: 180, panelHeight: 120 },
  disc: { steelDisc: true },
  sideCable: { cableMode: 'side' },
  noChannel: { cableChannel: false },
  textRaised: { baseText: 'Oma' },
  textColour: { baseText: 'Oma', textSecondColor: true },
  textEngraved: { baseText: 'Oma', baseTextStyle: 'engraved' },
  deep: { lightDepth: 150 },
  stand: { lighting: 'stand' },
  standDisc: { lighting: 'stand', steelDisc: true },
  standSmall: { lighting: 'stand', panelWidth: 60, panelHeight: 60, lampDiameter: 40 },
  standText: { lighting: 'stand', baseText: 'Oma', baseTextStyle: 'engraved' },
};

describe('panel', () => {
  for (const [name, over] of Object.entries(variants)) {
    it(`builds valid solids: ${name}`, async () => {
      const k = await loadKernel();
      const p = sanitize(panelShape, { ...defaultValues(panelShape), ...over });
      await panelShape.prepare?.(p);
      const r = withScope(() => panelShape.build(k, p));
      const solid = r.parts.filter((x) => !x.preview);
      for (const part of solid) {
        // re-import to check it is a closed manifold
        const ok = withScope(() => {
          const m = new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: part.mesh.positions, triVerts: part.mesh.indices }));
          return m.status() === 'NoError' && m.volume() > (part.id.startsWith('text') ? 1 : 1000);
        });
        expect(ok, `${name}/${part.id}`).toBe(true);
        expect(r.warnings, name).toEqual([]);
        const dir = process.env.EXPORT_DIR;
        if (dir) {
          mkdirSync(dir, { recursive: true });
          writeFileSync(`${dir}/${name}-${part.id}.stl`, toStl(part.mesh.positions, part.mesh.indices));
          writeFileSync(`${dir}/${name}-${part.id}-print.stl`, toStl(orientForPrint(part.mesh, part.printRotation), part.mesh.indices));
        }
      }
      if (p.lighting === 'box') {
        expect(solid.map((s) => s.id)).toContain('base');
        expect(solid.map((s) => s.id)).toContain('hood');
      } else if (p.lighting === 'stand') {
        expect(solid.map((s) => s.id)).toEqual(expect.arrayContaining(['base', 'holder']));
      } else {
        expect(solid).toEqual([]);
      }
      expect(r.slots.length).toBe(1);
      expect(r.slots[0].id).toBe('front');
    });
  }

  it('reports the outer size from panel width, posts and slot engagement', () => {
    const L = panelLayout(defaultValues(panelShape));
    expect(L.outerX).toBe(150 + 2 * (12 - 4));
    expect(L.warnings).toEqual([]);
  });

  it('warns when the lamp does not fit the chamber', () => {
    const p = sanitize(panelShape, { ...defaultValues(panelShape), lampDiameter: 120 });
    expect(panelShape.validate!(p).map((w) => w.key)).toContain('warn.lampTooBig');
  });

  it('sits the picture at the front and previews the lamp', async () => {
    const k = await loadKernel();
    const p = sanitize(panelShape, { ...defaultValues(panelShape) });
    await panelShape.prepare?.(p);
    const r = withScope(() => panelShape.build(k, p));
    expect(r.slots[0].matrix[13]).toBeLessThan(0);
    expect(r.parts.find((x) => x.id === 'lamp')?.preview).toBe(true);
  });
});

describe('panel stand', () => {
  const stand = () => sanitize(panelShape, { ...defaultValues(panelShape), lighting: 'stand' });

  it('has a foot and a holder that fit together without touching the picture', async () => {
    const k = await loadKernel();
    const p = stand();
    const r = withScope(() => panelShape.build(k, p));
    expect(r.parts.filter((x) => !x.preview).map((x) => x.id)).toEqual(['base', 'holder']);
    withScope(() => {
      const solid = (id: string) => {
        const m = r.parts.find((x) => x.id === id)!.mesh;
        return new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
      };
      // the tenon sits in its socket with clearance, and the picture clears the holder
      expect(solid('base').intersect(solid('holder')).volume()).toBeLessThan(1);
      expect(solid('panel-front').intersect(solid('holder')).volume()).toBe(0);
      expect(solid('panel-front').intersect(solid('base')).volume()).toBe(0);
    });
  });

  it('puts the lamp behind the middle of the picture, at the chosen distance', () => {
    const p = stand();
    const S = standLayout(p);
    expect(S.lampZ).toBeCloseTo((S.panelBottom + S.panelTop) / 2);
    expect(S.holderFront - (S.planeY + S.thick / 2 + S.gap)).toBeCloseTo(40);
    const far = standLayout({ ...p, lampDistance: 80 });
    expect(far.outerY - S.outerY).toBeCloseTo(40);
  });

  it('shows stand settings only for the stand', () => {
    const vis = (key: string, lighting: string) => {
      const def = panelShape.groups.flatMap((g) => g.params).find((d) => d.key === key)!;
      return !def.visibleIf || def.visibleIf({ ...defaultValues(panelShape), lighting });
    };
    expect(vis('lampDistance', 'stand')).toBe(true);
    expect(vis('lampDistance', 'box')).toBe(false);
    expect(vis('lightDepth', 'stand')).toBe(false);
    expect(vis('cableMode', 'stand')).toBe(false);
    expect(vis('baseHeight', 'stand')).toBe(true);
    expect(vis('baseHeight', 'plain')).toBe(false);
  });
});

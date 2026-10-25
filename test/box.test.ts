import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultValues, sanitize } from '../src/core/shape';
import type { ParamValues } from '../src/core/types';
import { orientForPrint } from '../src/export/transform';
import { toStl } from '../src/export/stl';
import { loadKernel, withScope } from '../src/geometry/kernel';
import { FONT_IDS, FONT_URLS, setFontLoader } from '../src/geometry/text';
import { boxShape } from '../src/shapes/box';
import { boxLayout } from '../src/shapes/box/layout';

// vite's ?url imports resolve to project paths like /src/assets/fonts/x.ttf
setFontLoader(async (id) => {
  const b = readFileSync('.' + FONT_URLS[id].split('?')[0]);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
});

const variants: Record<string, Partial<ParamValues>> = {
  default: {},
  small100: { panelWidth: 100, panelHeight: 100 },
  odd59x80: { panelWidth: 59, panelHeight: 80, lidJoint: 'plug', lampDiameter: 40 },
  rect: { rectangular: true, sideWidth: 110, panelHeight: 180 },
  noTop: { topPanel: false, plugDepth: 0 },
  sideCable: { cableMode: 'side' },
  plug: { lidJoint: 'plug' },
  magnet: { lidJoint: 'magnet' },
  latch: { lidJoint: 'latch' },
  pegs: { lidJoint: 'pegs' },
  power: { powerBase: true },
  powerRocker: { powerBase: true, switchType: 'rocker', ledWindow: true, ledWindowOffset: -20 },
  powerSlide: { powerBase: true, switchType: 'slide', bankPocket: true, bankLength: 120 },
  powerRound: { powerBase: true, switchType: 'round', switchOffset: -50, powerJoint: 'pegs' },
  powerPlain: { powerBase: true, powerJoint: 'none', chargeSlot: false },
  powerPocket: { powerBase: true, bankPocket: true },
  disc: { steelDisc: true, cableMode: 'side' },
  discOverlap: { steelDisc: true, discKeepClear: false },
  discBottom: { steelDisc: true, discDiameter: 40 },
  mini: { panelWidth: 50, panelHeight: 50, lampDiameter: 40 },
  miniSide: { panelWidth: 50, panelHeight: 50, lampDiameter: 40, cableMode: 'side' },
  xl: { panelWidth: 190, panelHeight: 190 },
  textRaised: { baseText: 'Familie Müller', topText: 'Weihnachten 2026' },
  textColour: { baseText: 'Anna & Ben', textSecondColor: true, topText: 'Für immer', topTextStyle: 'inlay', textFont: 'script' },
  textEngraved: { baseText: 'ÄÖÜ äöü ß', baseTextStyle: 'engraved', textFont: 'serif' },
  textPower: { powerBase: true, baseText: 'Lithobox', baseTextStyle: 'inlay', textFont: 'stencil' },
  textNoTop: { topPanel: false, topText: 'Line one\nLine two\nLine three', topTextSize: 12, textFont: 'rounded' },
};

describe('box', () => {
  for (const [name, over] of Object.entries(variants)) {
    it(`builds valid solids: ${name}`, async () => {
      const k = await loadKernel();
      const p = sanitize(boxShape, { ...defaultValues(boxShape), ...over });
      await boxShape.prepare?.(p);
      const r = withScope(() => boxShape.build(k, p));
      for (const part of r.parts.filter((x) => !x.preview)) {
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
      expect(r.slots.length).toBe(p.topPanel ? 5 : 4);
    });
  }

  it('shrinks text that does not fit and says so', async () => {
    const k = await loadKernel();
    const p = sanitize(boxShape, { ...defaultValues(boxShape), baseText: 'A very long text that will never fit', baseTextSize: 20 });
    await boxShape.prepare?.(p);
    const r = withScope(() => boxShape.build(k, p));
    expect(r.warnings.map((w) => w.key)).toContain('warn.textShrunkBase');
  });

  it('every font renders umlauts', async () => {
    const k = await loadKernel();
    for (const font of FONT_IDS) {
      const p = sanitize(boxShape, { ...defaultValues(boxShape), baseText: 'Müller ÄÖß', textFont: font });
      await boxShape.prepare?.(p);
      const r = withScope(() => boxShape.build(k, p));
      expect(r.warnings, font).toEqual([]);
    }
  });

  it('reports the outer size from panel width, posts and slot depth', () => {
    const L = boxLayout(defaultValues(boxShape));
    expect(L.outerX).toBe(156 + 2 * (14 - 4));
    expect(L.warnings).toEqual([]);
  });
});

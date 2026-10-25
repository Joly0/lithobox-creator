// Turns pictures into lithophane parts for whatever panel slots a shape reports.
// Runs in the geometry worker after the shape's own build.
import type { BuildResult, PanelSlot, ParamValues, PartOutput, Vec3 } from '../core/types';
import { prism, toMeshData, type Kernel } from '../geometry/kernel';
import { BASE, colourMap, compensate, DEFAULT_FILAMENTS, LAYER, separator, type ColourMap, type RGB } from './colour';
import { heightMap, outlinePoints, panelMesh, wrapMesh, type Luminance, type PanelSpec } from './mesh';
import { arcFins, supportFins } from './supports';

/** Grid spacing per quality setting (mm); the live preview always uses PREVIEW_RES. */
export const QUALITY_RES: Record<string, number> = { draft: 0.5, normal: 0.3, fine: 0.2 };
export const PREVIEW_RES = 0.6;

/** Size of the picture area of a slot, for cropping and sampling on the main thread. */
export function pictureArea(slot: { width: number; height: number; wrap?: { open?: boolean; sphere?: { picture: [number, number] } } }, p: ParamValues): { width: number; height: number } {
  // a ball: the picture's size depends on its projection (worked out by the shape)
  const pic = slot.wrap?.sphere?.picture;
  if (pic) return { width: pic[0], height: pic[1] };
  const m = typeof p.lithoMargin === 'number' ? p.lithoMargin : 2;
  // a picture all the way round has no left and right margin
  const mx = slot.wrap && !slot.wrap.open ? 0 : m;
  return { width: Math.max(1, slot.width - 2 * mx), height: Math.max(1, slot.height - 2 * m) };
}

/** The lamp view's numbers for a ball: projection, the band's latitudes, a front picture's half width. */
function sphereProjection(rm: number, s: { band: [number, number]; sMid: number; projection?: 'band' | 'conformal' | 'front'; half?: number; blend?: number; around?: number }) {
  return { projection: s.projection ?? 'band', lat: [(s.band[0] + s.sMid) / rm, (s.band[1] + s.sMid) / rm] as [number, number], half: s.half ?? 0, blend: s.blend ?? 0, around: s.around ?? 2 * Math.PI };
}

/** Where a slot's lithophane moves in the exploded view: its slot's own offset, or out of its face (a top up, a round one up). */
export function lithoExplode(slot: PanelSlot): Vec3 {
  const m = slot.matrix;
  return slot.explode ?? (slot.wrap ? [0, 0, 60] : [m[8] * 70, m[9] * 70, m[10] > 0.5 ? 110 : 0]);
}

/** Colour picture in this slot? Only flat ones: a colour picture prints lying flat, face down. */
export const inColour = (slot: { wrap?: unknown }, p: ParamValues) => p.lithoColour === true && !slot.wrap;

/** Colour layers that fit: the white relief keeps at least 0.3 mm above them, and the 0.2 mm of the margin. */
export function colourLayers(slot: { thickness: number }, p: ParamValues): number {
  const room = Math.floor((slot.thickness - 0.2 - 0.3 - BASE) / LAYER + 1e-6);
  return Math.max(0, Math.min(Number(p.colourLayers ?? 7), room));
}

/** Thickness of the brightest areas; a colour picture's relief stays above its colour stack. */
export function thinnest(slot: { thickness: number; wrap?: unknown }, p: ParamValues): number {
  const t0 = Math.min(p.lithoMinThickness as number, slot.thickness - 0.2);
  if (!inColour(slot, p)) return t0;
  return Math.min(Math.max(t0, BASE + LAYER * colourLayers(slot, p) + 0.3), slot.thickness - 0.2);
}

/**
 * A colour picture of w × h mm: its colour stacks, and the brightness the white relief must
 * show so the light through relief and colour comes out as bright as the photo.
 */
export function colourPicture(lum: Luminance, w: number, h: number, slot: { thickness: number }, p: ParamValues): { lum: Luminance; colour: ColourMap } {
  const filaments = [p.filamentCyan, p.filamentMagenta, p.filamentYellow].map((f, i) => (typeof f === 'string' ? f : DEFAULT_FILAMENTS[i])) as [string, string, string];
  const rgb = lum.rgb ?? new Float32Array(lum.cols * lum.rows * 3).map((_, i) => lum.data[Math.floor(i / 3)]);
  const colour = colourMap(rgb, lum.cols, lum.rows, w, h, separator(filaments, colourLayers(slot, p)));
  const data = new Float32Array(lum.data.length);
  for (let j = 0; j < lum.rows; j++)
    for (let i = 0; i < lum.cols; i++) {
      // the cell this sample falls in (samples at u = i / (cols - 1), as sample() in mesh.ts)
      const ci = Math.min(colour.cols - 1, Math.floor((i / Math.max(lum.cols - 1, 1)) * colour.cols));
      const cj = Math.min(colour.rows - 1, Math.floor((j / Math.max(lum.rows - 1, 1)) * colour.rows));
      const o = (cj * colour.cols + ci) * 3;
      const f: RGB = [colour.filter[o], colour.filter[o + 1], colour.filter[o + 2]];
      data[j * lum.cols + i] = compensate(lum.data[j * lum.cols + i], f);
    }
  return { lum: { cols: lum.cols, rows: lum.rows, data }, colour };
}

/**
 * One filament's part of the colour stack, as a solid over the whole slot (panel space): from
 * BASE above the back up to `layers(cell)` layers. Nested: the cyan solid is the lowest layers,
 * magenta's reaches past it, yellow's past both; in the slicer later volumes win where they
 * overlap, so they go in the order white, yellow, magenta, cyan. Cells without colour keep a
 * 0.01 mm skin, thinner than any layer, so the solid stays closed.
 */
function colourSolid(slot: PanelSlot, area: { width: number; height: number }, c: ColourMap, layers: (o: number) => number) {
  const W = slot.width, H = slot.height;
  const n = Math.max(2, Math.round(W / 0.44) + 1), m = Math.max(2, Math.round(H / 0.44) + 1);
  const data = new Float32Array(n * m);
  for (let j = 0; j < m; j++)
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (i * W) / (n - 1), y = H / 2 - (j * H) / (m - 1);
      const u = (x + area.width / 2) / area.width, v = (area.height / 2 - y) / area.height;
      let t = 0;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        const ci = Math.min(c.cols - 1, Math.floor(u * c.cols)), cj = Math.min(c.rows - 1, Math.floor(v * c.rows));
        t = layers((cj * c.cols + ci) * 3) * LAYER;
      }
      data[j * n + i] = Math.max(t, 0.01);
    }
  const mesh = panelMesh({ width: W, height: H, thickness: 0, margin: 0, minThickness: 0, resolution: 0.44 }, { cols: n, rows: m, data });
  const z0 = -slot.thickness / 2 + BASE;
  for (let i = 2; i < mesh.positions.length; i += 3) mesh.positions[i] += z0;
  return mesh;
}

export function addLithophanes(k: Kernel, r: BuildResult, p: ParamValues, pictures: Record<string, Luminance>, resolution: number): void {
  for (const slot of r.slots) {
    // a slot whose picture goes into another one's relief has none of its own
    if (slot.pictureOf) continue;
    const back = slot.wrap?.sphere?.back ? (pictures.back ?? null) : null;
    let lum = pictures[slot.id];
    if (!lum && !back) continue;
    const colour = inColour(slot, p);
    const area = pictureArea(slot, p);
    let cmap: ColourMap | undefined;
    if (colour) ({ lum, colour: cmap } = colourPicture(lum, area.width, area.height, slot, p));
    const spec: PanelSpec = {
      width: slot.width,
      height: slot.height,
      thickness: slot.thickness,
      margin: p.lithoMargin as number,
      minThickness: thinnest(slot, p),
      curve: p.lithoCurve === 'linear' ? 'linear' : 'light',
      resolution,
      wrapRadius: slot.wrap?.radius,
      wrapOpen: slot.wrap?.open,
      outline: slot.outline,
      coneSlope: slot.wrap?.slope,
      sphere: slot.wrap?.sphere,
    };
    const hm = heightMap(spec, lum ?? null, back);
    let mesh = slot.wrap ? wrapMesh(spec, hm) : panelMesh(spec, hm);
    // a round or polygon picture: the rectangle's relief cut to the outline
    const o = slot.outline;
    const sph = slot.wrap?.sphere;
    if (o) {
      const solid = new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }));
      mesh = toMeshData(solid.intersect(prism(new k.CrossSection([outlinePoints(o)]), -slot.thickness, slot.thickness)));
    }
    // a colour picture shows its flat, coloured back: the panel turned round (mirrored in z, so
    // the picture still reads the right way), lying flat on that back to print
    const m = colour ? slot.matrix.map((v, i) => (i >= 8 && i < 11 ? -v : v)) : slot.matrix;
    // flat panels move out of their face, a cylinder lifts out of its base
    const out = lithoExplode(slot);
    const id = `litho-${slot.id}`;
    // printed standing: panel y (up) becomes z, the bottom margin sits on the bed
    const base: Omit<PartOutput, 'id' | 'mesh'> = {
      object: id,
      color: '#f4ead7',
      matrix: m,
      explode: out,
      // (an outline has no straight bottom edge to stand on, nor straight sides for the fins:
      // it prints lying, the picture up)
      printRotation: o || colour ? [0, 0, 0] : slot.upsideDown ? [-90, 0, 0] : [90, 0, 0],
      slicer: colour
        ? { sparse_infill_density: '100%', layer_height: String(LAYER), brim_type: 'outer_only', brim_width: '5' }
        : { sparse_infill_density: '100%', brim_type: 'no_brim' },
    };
    r.parts = r.parts.filter((x) => x.id !== `panel-${slot.id}`);
    const grid: [number, number] = slot.wrap && !slot.wrap.open ? [hm.cols - 1, hm.rows] : [hm.cols, hm.rows];
    const mask = o ? (o.points ? { ...o, inset: spec.margin } : { ...o, radius: o.radius - spec.margin }) : undefined;
    // (cut to an outline, the vertices are no longer the grid; a ball keeps its grid order)
    r.parts.push({ ...base, id, mesh, relief: true, reliefGrid: o ? undefined : grid, wrapRadius: slot.wrap?.radius, mask, wrapSphere: !!sph, sphereProjection: sph ? sphereProjection(slot.wrap!.radius + slot.thickness / 2, sph) : undefined });
    // a cylinder stands on its own; flat panels and arcs get breakaway fins
    const size = String(p.lithoSupportSize ?? 'normal');
    if (cmap) {
      // white first (the relief, filament 1), then yellow, magenta, cyan: later volumes win
      const names = ['cyan', 'magenta', 'yellow'] as const;
      const filament = [p.filamentCyan, p.filamentMagenta, p.filamentYellow];
      for (const f of [2, 1, 0]) {
        let solid = colourSolid(slot, area, cmap, (c) => cmap!.n[c] + (f > 0 ? cmap!.n[c + 1] : 0) + (f > 1 ? cmap!.n[c + 2] : 0));
        if (o) {
          const s = new k.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: solid.positions, triVerts: solid.indices }));
          solid = toMeshData(s.intersect(prism(new k.CrossSection([outlinePoints(o)]), -slot.thickness, slot.thickness)));
        }
        r.parts.push({ ...base, id: `${id}-${names[f]}`, mesh: solid, color: String(filament[f] ?? DEFAULT_FILAMENTS[f]), extruder: f + 2, printOnly: true });
      }
    }
    if (p.lithoSupports && !o && !colour && !(slot.wrap && !slot.wrap.open)) {
      const fins = slot.wrap ? arcFins(k, spec, size) : supportFins(k, spec, size);
      r.parts.push({ ...base, id: `${id}-fins`, mesh: toMeshData(fins), color: '#8fb7ff', printOnly: true });
    }
  }
}

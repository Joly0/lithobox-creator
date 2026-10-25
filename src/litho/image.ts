// Photos into grayscale grids for the lithophane mesh. Runs on the main thread with a
// canvas; the photo never leaves the browser.
//
// The settings are the usual ones of lithophane tools (scale, rotation, flips, exposure,
// contrast, highlights, shadows) plus sharpness and fit / fill.
import type { Luminance } from './mesh';

export interface PictureEdit {
  /** true: the photo covers the whole area (cropped); false: it fits inside (white bars). */
  fill: boolean;
  /** 1 = covers (or fits) exactly; larger zooms in. */
  zoom: number;
  /** -1 .. 1: how far the photo is moved within the part that sticks out. */
  offsetX: number;
  offsetY: number;
  /** Degrees, clockwise. */
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  /** Stops, -2 .. 2 (+1 doubles the brightness). */
  exposure: number;
  /** -1 .. 1 around middle grey. */
  contrast: number;
  /** -1 .. 1: darken or brighten the light tones only. */
  highlights: number;
  /** -1 .. 1: darken or brighten the dark tones only. */
  shadows: number;
  /** 0 .. 2: unsharp mask; counters the softening by light scattering in the plastic. */
  sharpness: number;
}

export const DEFAULT_EDIT: PictureEdit = {
  fill: true, zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipH: false, flipV: false,
  exposure: 0, contrast: 0, highlights: 0, shadows: 0, sharpness: 0.5,
};

/** A photo in the library. */
export interface Photo {
  id: string;
  name: string;
  bitmap: ImageBitmap;
  /** The original file, kept so the photo can be stored in the browser between visits. */
  blob: Blob;
}

/** A photo placed on one panel slot, with that slot's own crop and tone. */
export interface Placement {
  photo: Photo;
  edit: PictureEdit;
  /** Bumped on every change, so cached samples know when to refresh. */
  version: number;
}

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export async function loadPhoto(file: Blob, name = (file as File).name ?? 'photo', id = newId()): Promise<Photo> {
  // respect the EXIF orientation of phone photos
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  return { id, name, bitmap, blob: file };
}

function canvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Size of the photo after rotation, and the scale that covers / fits a w × h target. */
function layout(pl: Placement, w: number, h: number) {
  const e = pl.edit;
  const iw = pl.photo.bitmap.width, ih = pl.photo.bitmap.height;
  const a = (e.rotation * Math.PI) / 180;
  const rw = Math.abs(iw * Math.cos(a)) + Math.abs(ih * Math.sin(a));
  const rh = Math.abs(iw * Math.sin(a)) + Math.abs(ih * Math.cos(a));
  const base = e.fill ? Math.max(w / rw, h / rh) : Math.min(w / rw, h / rh);
  const s = base * e.zoom;
  return { iw, ih, a, s, maxX: Math.abs(rw * s - w) / 2, maxY: Math.abs(rh * s - h) / 2 };
}

/** How far (in target pixels) the photo can be moved each way. */
export function overflow(pl: Placement, w: number, h: number): { maxX: number; maxY: number } {
  const l = layout(pl, w, h);
  return { maxX: l.maxX, maxY: l.maxY };
}

/** Draw the placed photo so it fills a w × h target (white where it doesn't reach). */
export function drawPlacement(ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, pl: Placement, w: number, h: number): void {
  const e = pl.edit;
  const l = layout(pl, w, h);
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(w / 2 - e.offsetX * l.maxX, h / 2 - e.offsetY * l.maxY);
  ctx.rotate(l.a);
  ctx.scale(e.flipH ? -l.s : l.s, e.flipV ? -l.s : l.s);
  ctx.drawImage(pl.photo.bitmap, -l.iw / 2, -l.ih / 2);
  ctx.restore();
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Exposure, contrast, highlights and shadows on one luminance value (0 black, 1 white). */
export function tone(l: number, e: PictureEdit): number {
  let v = l * Math.pow(2, e.exposure);
  v = (v - 0.5) * (1 + e.contrast) + 0.5;
  v += e.shadows * 0.35 * (1 - smooth(0, 0.55, v));
  v += e.highlights * 0.35 * smooth(0.45, 1, v);
  return Math.min(1, Math.max(0, v));
}

/** Box blur (separable) of a grid, radius in samples. */
function blur(src: Float32Array, cols: number, rows: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < cols) {
          s += src[y * cols + xx];
          n++;
        }
      }
      tmp[y * cols + x] = s / n;
    }
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < rows) {
          s += tmp[yy * cols + x];
          n++;
        }
      }
      out[y * cols + x] = s / n;
    }
  return out;
}

/**
 * Grayscale grid of the placed photo, cols × rows, with tone and sharpness applied.
 * `mmPerSample` keeps the sharpening radius the same in millimetres at any resolution.
 * `colour`: also keep each sample's colour, scaled to its toned brightness.
 */
export function sampleLuminance(pl: Placement, cols: number, rows: number, mmPerSample = 0.6, colour = false): Luminance {
  const c = canvas(cols, rows);
  const ctx = c.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  drawPlacement(ctx, pl, cols, rows);
  const px = ctx.getImageData(0, 0, cols, rows).data;
  let data = new Float32Array(cols * rows);
  const rgb = colour ? new Float32Array(cols * rows * 3) : undefined;
  for (let i = 0; i < cols * rows; i++) {
    const l = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
    data[i] = tone(l, pl.edit);
    if (rgb) {
      // the hue as photographed, the brightness as toned
      const k = l > 1e-4 ? data[i] / l : 0;
      for (let c = 0; c < 3; c++) rgb[i * 3 + c] = l > 1e-4 ? Math.min(1, (px[i * 4 + c] / 255) * k) : data[i];
    }
  }
  if (pl.edit.sharpness > 0) {
    // unsharp mask over about 0.8 mm
    const r = Math.max(1, Math.round(0.8 / mmPerSample));
    const soft = blur(data, cols, rows, r);
    const sharp = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) sharp[i] = Math.min(1, Math.max(0, data[i] + pl.edit.sharpness * (data[i] - soft[i])));
    data = sharp;
  }
  return { cols, rows, data, rgb };
}

/** Grid size for a picture area at a resolution (one sample per grid step). */
export function sampleSize(width: number, height: number, resolution: number): { cols: number; rows: number } {
  return { cols: Math.max(2, Math.round(width / resolution)), rows: Math.max(2, Math.round(height / resolution)) };
}

/** A drawn sample photo (sky, sun, hills, a label), so people can try without a photo. */
export async function samplePhoto(label: string, seed: number): Promise<Photo> {
  const w = 600, h = 600;
  const c = canvas(w, h);
  const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#1d2b4a');
  sky.addColorStop(0.65, '#e9c46a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff6d6';
  ctx.beginPath();
  ctx.arc(150 + ((seed * 97) % 300), 220, 60, 0, Math.PI * 2);
  ctx.fill();
  for (const [base, amp, col] of [[420, 70, '#3a4a5c'], [500, 50, '#1b232c']] as const) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 10) ctx.lineTo(x, base - amp * Math.abs(Math.sin((x + seed * 53) / 90)));
    ctx.lineTo(w, h);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, w / 2, 110);
  const blob = c instanceof HTMLCanvasElement
    ? await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'))
    : await c.convertToBlob({ type: 'image/png' });
  return loadPhoto(blob, label);
}

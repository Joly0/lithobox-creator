// Painting photos and placements onto canvases, with the slot's outline masked.
import { insideOutline } from '../litho/mesh';
import { sampleLuminance, type Photo, type Placement } from '../litho/image';
import type { Outline } from '../core/types';

export interface SlotInfo {
  id: string;
  /** Picture area (inside the margin) in mm. */
  width: number;
  height: number;
  /** A picture cut to an outline (centred on the area, mm), and the margin kept inside it. */
  outline?: Outline;
  margin?: number;
}

/** Identifies a slot's outline, so a changed outline repaints. */
export const maskKey = (s: SlotInfo) => (s.outline ? JSON.stringify([s.outline, s.margin ?? 0]) : '');

const masks = new Map<string, Uint8Array>();
/** Per pixel: 1 where the picture shows (inside the outline, less its margin), as the relief is built. */
export function pictureMask(slot: SlotInfo, w: number, h: number): Uint8Array | null {
  const o = slot.outline;
  if (!o) return null;
  const key = `${maskKey(slot)}:${slot.width}x${slot.height}:${w}x${h}`;
  let m = masks.get(key);
  if (!m) {
    if (masks.size > 32) masks.clear();
    m = new Uint8Array(w * h);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const x = ((i + 0.5) / w - 0.5) * slot.width, y = (0.5 - (j + 0.5) / h) * slot.height;
        m[j * w + i] = insideOutline(o, x, y, slot.margin ?? 0) ? 1 : 0;
      }
    masks.set(key, m);
  }
  return m;
}

/** Grayscale preview of a placement, as it will be turned into relief; outside an outline dimmed. */
export function paintPlacement(c: HTMLCanvasElement, pl: Placement, mmPerPixel: number, slot?: SlotInfo): void {
  const lum = sampleLuminance(pl, c.width, c.height, mmPerPixel);
  const mask = slot ? pictureMask(slot, c.width, c.height) : null;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(c.width, c.height);
  for (let i = 0; i < lum.data.length; i++) {
    const v = Math.round(lum.data[i] * 255);
    if (mask && !mask[i]) {
      // cut away: faint, and tinted so it does not read as part of the picture
      img.data[i * 4] = 70 + v * 0.2;
      img.data[i * 4 + 1] = 60 + v * 0.2;
      img.data[i * 4 + 2] = 55 + v * 0.2;
    } else img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** Colour thumbnail of a library photo (cropped to a square). */
export function paintPhoto(c: HTMLCanvasElement, photo: Photo): void {
  const ctx = c.getContext('2d')!;
  const b = photo.bitmap;
  const s = Math.max(c.width / b.width, c.height / b.height);
  ctx.drawImage(b, (c.width - b.width * s) / 2, (c.height - b.height * s) / 2, b.width * s, b.height * s);
}

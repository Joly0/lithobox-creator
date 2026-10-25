// "Pictures" step: a library of photos (add any number at once) and one placement per
// panel slot. A slot takes any photo from the library: click to choose, drag a photo onto
// a slot, or drag one slot onto another to swap them. Each slot keeps its own crop and
// tone. Photos stay in this browser tab; nothing is uploaded.
import { has, t } from '../i18n';
import type { Outline } from '../core/types';
import { insideOutline } from '../litho/mesh';
import { DEFAULT_EDIT, loadPhoto, overflow, sampleLuminance, samplePhoto, type Photo, type PictureEdit, type Placement } from '../litho/image';
import { deletePhoto, loadPhotos, loadValue, savePhoto, saveValue, type StoredPhoto } from './storage';

export interface SlotInfo {
  id: string;
  /** Picture area (inside the margin) in mm. */
  width: number;
  height: number;
  /** A picture cut to an outline (centred on the area, mm), and the margin kept inside it. */
  outline?: Outline;
  margin?: number;
}

const THUMB = 64;
const EDITOR = 280;
const DRAG_TYPE = 'text/x-lithobox';

export class PicturesPanel {
  readonly library: Photo[] = [];
  readonly placements = new Map<string, Placement>();
  private slots: SlotInfo[] = [];
  /**
   * Placements of sides the current shape doesn't have (after a switch to another shape), by
   * their old side: they come back when that side does, or fill the new shape's empty sides.
   */
  private parked = new Map<string, Placement>();
  private editing: string | null = null;
  private choosing: string | null = null;
  private box = document.createElement('details');

  constructor(host: HTMLElement, private onChange: () => void) {
    this.box.className = 'group pictures';
    this.box.open = true;
    host.append(this.box);
  }

  /** Every change is saved in the browser (debounced) and triggers a rebuild. */
  private saveTimer = 0;
  private changed(): void {
    this.saveLater();
    this.onChange();
  }

  private saveLater(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.persist(), 400);
  }

  private persist(): Promise<unknown> {
    const record = (m: Map<string, Placement>) => {
      const out: Record<string, { photo: string; edit: PictureEdit }> = {};
      for (const [id, p] of m) out[id] = { photo: p.photo.id, edit: p.edit };
      return out;
    };
    // parked too: the sides a shape lacks get their photos back after a reload
    return saveValue('pictures', { order: this.library.map((p) => p.id), slots: record(this.placements), parked: record(this.parked) });
  }

  /** Bring back the photos and placements of the last visit. */
  async restore(): Promise<void> {
    const stored = await loadPhotos();
    if (!stored.length) return;
    type Saved = Record<string, { photo: string; edit: PictureEdit }>;
    const state = await loadValue<{ order: string[]; slots: Saved; parked?: Saved }>('pictures');
    const photos = new Map<string, Photo>();
    for (const sp of stored) {
      try {
        photos.set(sp.id, await loadPhoto(sp.blob, sp.name, sp.id));
      } catch {
        /* a photo the browser can no longer decode: skip it */
      }
    }
    const order = state?.order ?? [...photos.keys()];
    this.library.push(...order.map((id) => photos.get(id)).filter((p): p is Photo => !!p));
    for (const [slot, s] of Object.entries(state?.slots ?? {})) {
      const photo = photos.get(s.photo);
      if (photo) this.placements.set(slot, { photo, edit: { ...DEFAULT_EDIT, ...s.edit }, version: 1 });
    }
    for (const [slot, s] of Object.entries(state?.parked ?? {})) {
      const photo = photos.get(s.photo);
      if (photo && !this.placements.has(slot)) this.parked.set(slot, { photo, edit: { ...DEFAULT_EDIT, ...s.edit }, version: 1 });
    }
    this.render();
    this.onChange();
  }

  /** The photos placed on a side (in library order) and every side's placement, for a project file. */
  snapshot(): { photos: Photo[]; slots: Record<string, { photo: string; edit: PictureEdit }> } {
    const slots: Record<string, { photo: string; edit: PictureEdit }> = {};
    for (const [id, p] of this.placements) slots[id] = { photo: p.photo.id, edit: { ...p.edit } };
    const used = new Set([...this.placements.values()].map((p) => p.photo));
    return { photos: this.library.filter((p) => used.has(p)), slots };
  }

  /** Replace the library and every placement with a project's. Returns how many photos could not be decoded. */
  async replace(stored: StoredPhoto[], slots: Record<string, { photo: string; edit: Partial<PictureEdit> }>): Promise<number> {
    const photos = new Map<string, Photo>();
    let failed = 0;
    for (const sp of stored) {
      try {
        photos.set(sp.id, await loadPhoto(sp.blob, sp.name, sp.id));
      } catch {
        failed++;
      }
    }
    const versions = new Map([...this.placements].map(([id, p]) => [id, p.version]));
    const oldIds = this.library.map((p) => p.id);
    this.library.length = 0;
    this.placements.clear();
    this.parked.clear();
    this.editing = this.choosing = null;
    this.library.push(...photos.values());
    void this.storeLibrary(oldIds);
    for (const [slot, s] of Object.entries(slots)) {
      const photo = photos.get(s.photo);
      // a new version, so cached samples of the side's old photo are not reused
      if (photo) this.placements.set(slot, { photo, edit: cleanEdit(s.edit), version: (versions.get(slot) ?? 0) + 1 });
    }
    this.render();
    this.changed();
    return failed;
  }

  /**
   * Save the library's photos, then drop the old ones it no longer has. Only once every
   * save worked: when storage is full, the last visit's photos are kept rather than lost.
   */
  private async storeLibrary(oldIds: string[]): Promise<void> {
    const saved = await Promise.all(this.library.map((p) => savePhoto({ id: p.id, name: p.name, blob: p.blob })));
    if (saved.some((r) => r === null)) return;
    const keep = new Set(this.library.map((p) => p.id));
    await Promise.all(oldIds.filter((id) => !keep.has(id)).map((id) => deletePhoto(id)));
  }

  /** Called after every build: the slots (and their sizes) can change with the settings. */
  setSlots(slots: SlotInfo[]): void {
    const key = (s: SlotInfo[]) => s.map((x) => `${x.id}:${x.width.toFixed(1)}x${x.height.toFixed(1)}:${maskKey(x)}`).join('|');
    if (key(slots) === key(this.slots)) return;
    this.slots = slots;
    const has = (id: string) => slots.some((s) => s.id === id);
    let moved = false;
    for (const [id, p] of [...this.placements]) {
      if (has(id)) continue;
      moved = true;
      this.parked.delete(id);
      this.parked.set(id, p);
      this.placements.delete(id);
    }
    // empty sides take back their own photo, else the next photo a missing side left behind
    for (const s of slots) {
      if (this.placements.has(s.id)) continue;
      const from = this.parked.has(s.id) ? s.id : [...this.parked.keys()].find((id) => !has(id));
      if (from === undefined) continue;
      const p = this.parked.get(from)!;
      this.parked.delete(from);
      this.placements.set(s.id, { ...p, version: p.version + 1 });
      moved = true;
    }
    if (moved) this.saveLater();
    this.render();
    // photos restored before the first build: now that the slots are known, show them
    if (this.placements.size) this.onChange();
  }

  render(): void {
    this.box.replaceChildren();
    const sum = document.createElement('summary');
    sum.textContent = t('pictures.title');
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = t('pictures.hint');
    const rows = document.createElement('div');
    rows.className = 'pic-list';
    rows.append(...this.slots.map((s) => this.row(s)));
    this.box.append(sum, hint, this.libraryBlock(), rows);
  }

  // ---------------------------------------------------------------- library

  private libraryBlock(): HTMLElement {
    const lib = document.createElement('div');
    lib.className = 'pic-library';
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.multiple = true;
    file.hidden = true;
    file.addEventListener('change', () => {
      if (file.files?.length) void this.addFiles([...file.files]);
      file.value = '';
    });
    lib.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        lib.classList.add('drop');
      }
    });
    lib.addEventListener('dragleave', () => lib.classList.remove('drop'));
    lib.addEventListener('drop', (e) => {
      const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      lib.classList.remove('drop');
      void this.addFiles(files);
    });

    if (!this.library.length) {
      const empty = document.createElement('button');
      empty.type = 'button';
      empty.className = 'pic-empty';
      empty.textContent = t('pictures.dropHere');
      empty.addEventListener('click', () => file.click());
      const demo = document.createElement('button');
      demo.type = 'button';
      demo.className = 'link pic-demo';
      demo.textContent = t('pictures.samples');
      demo.addEventListener('click', () => void this.useSamples());
      lib.append(empty, demo, file);
      return lib;
    }

    const head = document.createElement('div');
    head.className = 'pic-lib-head';
    const title = document.createElement('strong');
    title.textContent = t('pictures.library', { n: this.library.length });
    head.append(title, button(t('pictures.add'), () => file.click(), 'primary'));
    const clearAll = document.createElement('button');
    clearAll.type = 'button';
    clearAll.className = 'link pic-clear-all';
    clearAll.textContent = t('pictures.removeAll');
    clearAll.addEventListener('click', () => {
      if (!confirm(t('pictures.removeAllConfirm'))) return;
      for (const p of this.library) void deletePhoto(p.id);
      this.library.length = 0;
      this.placements.clear();
      this.parked.clear();
      this.editing = this.choosing = null;
      this.render();
      this.changed();
    });
    const grid = document.createElement('div');
    grid.className = 'pic-grid';
    for (const photo of this.library) {
      const cell = document.createElement('div');
      cell.className = 'pic-cell';
      cell.draggable = true;
      cell.title = photo.name;
      cell.addEventListener('dragstart', (e) => e.dataTransfer?.setData(DRAG_TYPE, `photo:${photo.id}`));
      const c = document.createElement('canvas');
      c.width = c.height = 56;
      paintPhoto(c, photo);
      const used = [...this.placements.entries()].filter(([, p]) => p.photo === photo).map(([id]) => this.label(id));
      if (used.length) {
        const tag = document.createElement('span');
        tag.className = 'pic-used';
        tag.textContent = used.join(', ');
        cell.append(tag);
      }
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'pic-del';
      del.textContent = '✕';
      del.title = t('pictures.removePhoto');
      del.addEventListener('click', () => this.removePhoto(photo));
      cell.prepend(c);
      cell.append(del);
      grid.append(cell);
    }
    const tip = document.createElement('p');
    tip.className = 'hint';
    tip.textContent = t('pictures.libraryHint');
    lib.append(head, grid, tip, clearAll, file);
    return lib;
  }

  private async addFiles(files: File[]): Promise<void> {
    const added: Photo[] = [];
    for (const f of files) {
      try {
        added.push(await loadPhoto(f));
      } catch {
        /* skip files that are not pictures */
      }
    }
    if (!added.length) {
      alert(t('pictures.loadError'));
      return;
    }
    this.library.push(...added);
    for (const p of added) void savePhoto({ id: p.id, name: p.name, blob: p.blob });
    // new photos fill the sides that are still empty, in order
    const queue = [...added];
    for (const s of this.slots) if (!this.placements.has(s.id) && queue.length) this.place(s.id, queue.shift()!);
    this.render();
    this.changed();
  }

  private async useSamples(): Promise<void> {
    let i = 0;
    for (const s of this.slots) {
      const photo = await samplePhoto(this.label(s.id), i++);
      this.library.push(photo);
      void savePhoto({ id: photo.id, name: photo.name, blob: photo.blob });
      this.place(s.id, photo);
    }
    this.render();
    this.changed();
  }

  private removePhoto(photo: Photo): void {
    this.library.splice(this.library.indexOf(photo), 1);
    void deletePhoto(photo.id);
    for (const [id, p] of [...this.placements]) if (p.photo === photo) this.placements.delete(id);
    for (const [id, p] of [...this.parked]) if (p.photo === photo) this.parked.delete(id);
    if (this.editing && !this.placements.has(this.editing)) this.editing = null;
    this.render();
    this.changed();
  }

  private place(slotId: string, photo: Photo): void {
    const old = this.placements.get(slotId);
    this.placements.set(slotId, { photo, edit: { ...DEFAULT_EDIT }, version: (old?.version ?? 0) + 1 });
  }

  /** Swap two slots, each photo keeping its crop and tone. */
  private swap(a: string, b: string): void {
    const pa = this.placements.get(a), pb = this.placements.get(b);
    if (pa) this.placements.set(b, { ...pa, version: pa.version + 1 });
    else this.placements.delete(b);
    if (pb) this.placements.set(a, { ...pb, version: pb.version + 1 });
    else this.placements.delete(a);
  }

  // ---------------------------------------------------------------- slots

  private label(id: string): string {
    return has(`slot.${id}`) ? t(`slot.${id}`) : id;
  }

  private row(slot: SlotInfo): HTMLElement {
    const pl = this.placements.get(slot.id);
    const row = document.createElement('div');
    row.className = 'pic-row' + (pl ? '' : ' empty');
    const head = document.createElement('div');
    head.className = 'pic-head';

    const thumb = document.createElement('canvas');
    thumb.className = 'pic-thumb';
    thumb.width = THUMB;
    thumb.height = Math.max(8, Math.round((THUMB * slot.height) / slot.width));
    if (pl) {
      paintPlacement(thumb, pl, slot.width / THUMB, slot);
      thumb.draggable = true;
      thumb.title = t('pictures.dragToSwap');
      thumb.addEventListener('dragstart', (e) => e.dataTransfer?.setData(DRAG_TYPE, `slot:${slot.id}`));
    }

    const text = document.createElement('div');
    text.className = 'pic-text';
    const name = document.createElement('strong');
    name.textContent = this.label(slot.id);
    const sub = document.createElement('span');
    sub.textContent = pl ? pl.photo.name : t('pictures.size', { w: round(slot.width), h: round(slot.height) });
    text.append(name, sub);

    const actions = document.createElement('div');
    actions.className = 'pic-actions';
    if (this.library.length)
      actions.append(button(pl ? t('pictures.change') : t('pictures.choose'), () => {
        this.choosing = this.choosing === slot.id ? null : slot.id;
        this.render();
      }, pl ? '' : 'primary'));
    if (pl) {
      actions.append(button(this.editing === slot.id ? t('pictures.done') : t('pictures.edit'), () => {
        this.editing = this.editing === slot.id ? null : slot.id;
        this.render();
      }));
      actions.append(button('✕', () => {
        this.placements.delete(slot.id);
        if (this.editing === slot.id) this.editing = null;
        this.render();
        this.changed();
      }, 'ghost', t('pictures.clear')));
    }
    head.append(thumb, text, actions);
    row.append(head);

    // drop a library photo here, or another slot to swap with it
    row.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types.includes(DRAG_TYPE)) {
        e.preventDefault();
        row.classList.add('drop');
      }
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop'));
    row.addEventListener('drop', (e) => {
      const data = e.dataTransfer?.getData(DRAG_TYPE);
      if (!data) return;
      e.preventDefault();
      row.classList.remove('drop');
      const [kind, id] = data.split(':');
      if (kind === 'photo') {
        const photo = this.library.find((p) => p.id === id);
        if (photo) this.place(slot.id, photo);
      } else if (kind === 'slot' && id !== slot.id) this.swap(id, slot.id);
      this.render();
      this.changed();
    });

    if (this.choosing === slot.id) row.append(this.chooser(slot));
    if (pl && this.editing === slot.id) row.append(this.editor(slot, pl, thumb));
    return row;
  }

  private chooser(slot: SlotInfo): HTMLElement {
    const strip = document.createElement('div');
    strip.className = 'pic-chooser';
    for (const photo of this.library) {
      const c = document.createElement('canvas');
      c.width = c.height = 48;
      c.title = photo.name;
      c.className = this.placements.get(slot.id)?.photo === photo ? 'current' : '';
      paintPhoto(c, photo);
      c.addEventListener('click', () => {
        this.place(slot.id, photo);
        this.choosing = null;
        this.render();
        this.changed();
      });
      strip.append(c);
    }
    return strip;
  }

  // ---------------------------------------------------------------- editor

  private editor(slot: SlotInfo, pl: Placement, thumb: HTMLCanvasElement): HTMLElement {
    const ed = document.createElement('div');
    ed.className = 'pic-editor';
    const view = document.createElement('canvas');
    view.className = 'pic-view';
    view.width = EDITOR;
    view.height = Math.max(20, Math.round((EDITOR * slot.height) / slot.width));
    const mm = slot.width / EDITOR;
    paintPlacement(view, pl, mm, slot);

    let frame = 0;
    const set = (patch: Partial<PictureEdit>) => {
      Object.assign(pl.edit, patch);
      pl.version++;
      syncControls();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        paintPlacement(view, pl, mm, slot);
        paintPlacement(thumb, pl, slot.width / THUMB, slot);
      });
      this.changed();
    };

    // drag to move the photo, wheel to zoom
    let drag: { x: number; y: number } | null = null;
    view.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY };
      view.setPointerCapture(e.pointerId);
    });
    view.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const scale = view.width / view.getBoundingClientRect().width;
      const { maxX, maxY } = overflow(pl, view.width, view.height);
      const dx = (e.clientX - drag.x) * scale, dy = (e.clientY - drag.y) * scale;
      drag = { x: e.clientX, y: e.clientY };
      set({
        offsetX: clamp(pl.edit.offsetX - (maxX ? dx / maxX : 0), -1, 1),
        offsetY: clamp(pl.edit.offsetY - (maxY ? dy / maxY : 0), -1, 1),
      });
    });
    view.addEventListener('pointerup', () => (drag = null));
    view.addEventListener('wheel', (e) => {
      e.preventDefault();
      set({ zoom: clamp(pl.edit.zoom * Math.pow(1.1, -e.deltaY / 100), 1, 5) });
    }, { passive: false });

    const tools = document.createElement('div');
    tools.className = 'pic-tools';
    const fill = button('', () => set({ fill: !pl.edit.fill, offsetX: 0, offsetY: 0 }));
    tools.append(
      button(t('pictures.left90'), () => set({ rotation: wrap(pl.edit.rotation - 90), offsetX: 0, offsetY: 0 })),
      button(t('pictures.right90'), () => set({ rotation: wrap(pl.edit.rotation + 90), offsetX: 0, offsetY: 0 })),
      button(t('pictures.flipH'), () => set({ flipH: !pl.edit.flipH })),
      button(t('pictures.flipV'), () => set({ flipV: !pl.edit.flipV })),
      fill,
      button(t('pictures.reset'), () => set({ ...DEFAULT_EDIT })),
    );

    type Slider = [keyof PictureEdit, number, number, number, (v: number) => string];
    const pct = (v: number) => `${Math.round(v * 100)} %`;
    const signed = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`;
    const groups: [string, Slider[]][] = [
      ['pictures.groupFrame', [
        ['zoom', 1, 5, 0.01, pct],
        ['rotation', -180, 180, 1, (v) => `${Math.round(v)}°`],
      ]],
      ['pictures.groupTone', [
        ['exposure', -2, 2, 0.05, (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`],
        ['contrast', -1, 1, 0.01, signed],
        ['highlights', -1, 1, 0.01, signed],
        ['shadows', -1, 1, 0.01, signed],
        ['sharpness', 0, 2, 0.05, pct],
      ]],
    ];
    const inputs: { key: keyof PictureEdit; input: HTMLInputElement; out: HTMLElement; fmt: (v: number) => string }[] = [];
    const controls = document.createElement('div');
    controls.className = 'pic-controls';
    for (const [title, sliders] of groups) {
      const h = document.createElement('div');
      h.className = 'pic-group-title';
      h.textContent = t(title);
      controls.append(h);
      for (const [key, min, max, step, fmt] of sliders) {
        const lab = document.createElement('label');
        lab.className = 'pic-slider';
        const span = document.createElement('span');
        span.textContent = t(`pictures.${key}`);
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.addEventListener('input', () => set({ [key]: parseFloat(input.value) } as Partial<PictureEdit>));
        input.addEventListener('dblclick', () => set({ [key]: DEFAULT_EDIT[key] } as Partial<PictureEdit>));
        const out = document.createElement('output');
        inputs.push({ key, input, out, fmt });
        lab.append(span, input, out);
        controls.append(lab);
      }
    }
    const syncControls = () => {
      for (const { key, input, out, fmt } of inputs) {
        input.value = String(pl.edit[key]);
        out.textContent = fmt(pl.edit[key] as number);
      }
      fill.textContent = pl.edit.fill ? t('pictures.fit') : t('pictures.fill');
    };
    syncControls();

    const tip = document.createElement('p');
    tip.className = 'hint';
    tip.textContent = t('pictures.editHint');
    ed.append(view, tip, tools, controls);
    return ed;
  }
}

/** Identifies a slot's outline, so a changed outline repaints. */
const maskKey = (s: SlotInfo) => (s.outline ? JSON.stringify([s.outline, s.margin ?? 0]) : '');

const masks = new Map<string, Uint8Array>();
/** Per pixel: 1 where the picture shows (inside the outline, less its margin), as the relief is built. */
function pictureMask(slot: SlotInfo, w: number, h: number): Uint8Array | null {
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
function paintPlacement(c: HTMLCanvasElement, pl: Placement, mmPerPixel: number, slot?: SlotInfo): void {
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
function paintPhoto(c: HTMLCanvasElement, photo: Photo): void {
  const ctx = c.getContext('2d')!;
  const b = photo.bitmap;
  const s = Math.max(c.width / b.width, c.height / b.height);
  ctx.drawImage(b, (c.width - b.width * s) / 2, (c.height - b.height * s) / 2, b.width * s, b.height * s);
}

function button(label: string, onClick: () => void, kind = '', title = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn small ${kind}`.trim();
  b.textContent = label;
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;
const round = (v: number) => Math.round(v * 10) / 10;

/** A stored crop and tone, with anything missing or of the wrong type back at its default. */
function cleanEdit(e: Partial<PictureEdit>): PictureEdit {
  const out: PictureEdit = { ...DEFAULT_EDIT };
  for (const k of Object.keys(out) as (keyof PictureEdit)[]) if (typeof e[k] === typeof out[k]) (out as unknown as Record<string, unknown>)[k] = e[k];
  return out;
}

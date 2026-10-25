// "Pictures" step: a library of photos (add any number at once) and one placement per
// panel slot. A slot takes any photo from the library: click to choose, drag a photo onto
// a slot, or drag one slot onto another to swap them. Each slot keeps its own crop and
// tone. Photos stay in this browser tab; nothing is uploaded.
import { has, t } from '../i18n';
import { round } from '../core/shape';
import { DEFAULT_EDIT, loadPhoto, samplePhoto, type Photo, type PictureEdit, type Placement } from '../litho/image';
import { deletePhoto, loadPhotos, loadValue, savePhoto, saveValue, type StoredPhoto } from './storage';
import { button, cleanEdit, pictureEditor, THUMB } from './editor';
import { maskKey, paintPhoto, paintPlacement, type SlotInfo } from './paint';

export type { SlotInfo } from './paint';

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
    if (pl && this.editing === slot.id) row.append(pictureEditor(slot, pl, thumb, () => this.changed()));
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
}

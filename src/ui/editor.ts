// The picture editor: crop, turn and tone of one slot's photo, with a live preview.
import { t } from '../i18n';
import { DEFAULT_EDIT, overflow, type PictureEdit, type Placement } from '../litho/image';
import { paintPlacement, type SlotInfo } from './paint';

/** Sizes of a slot's thumbnail and of the editor's preview, in CSS pixels. */
export const THUMB = 64;
export const EDITOR = 280;

/** Crop and tone controls for one slot's placement; `onChange` after every edit. */
export function pictureEditor(slot: SlotInfo, pl: Placement, thumb: HTMLCanvasElement, onChange: () => void): HTMLElement {
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
    onChange();
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

export function button(label: string, onClick: () => void, kind = '', title = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn small ${kind}`.trim();
  b.textContent = label;
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

/** A stored crop and tone, with anything missing or of the wrong type back at its default. */
export function cleanEdit(e: Partial<PictureEdit>): PictureEdit {
  const out: PictureEdit = { ...DEFAULT_EDIT };
  for (const k of Object.keys(out) as (keyof PictureEdit)[]) if (typeof e[k] === typeof out[k]) (out as unknown as Record<string, unknown>)[k] = e[k];
  return out;
}

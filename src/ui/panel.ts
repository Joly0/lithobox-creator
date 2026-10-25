// Settings panel generated from a shape's parameter schema.
import type { ShapeDefinition } from '../core/shape';
import type { NumberParam, ParamDef, ParamGroup, ParamValues } from '../core/types';
import { has, shapeKey, t } from '../i18n';

export class ParamPanel {
  private rows = new Map<string, { def: ParamDef; row: HTMLElement; sync: () => void; reset: HTMLButtonElement }>();
  private showAdvanced = false;
  /** The picked preset's values (over the defaults): what each setting's reset goes back to. */
  private baseline: ParamValues | null = null;
  /** Text fields waiting to apply what was typed, by key. */
  private typing = new Map<string, number>();

  constructor(
    private host: HTMLElement,
    private shape: ShapeDefinition,
    private values: ParamValues,
    private onChange: (key: string, values: ParamValues) => void,
    /** Which of the shape's groups this panel shows. */
    private filter: (g: ParamGroup) => boolean = () => true,
  ) {
    this.render();
  }

  /** Show another shape's settings. */
  setShape(shape: ShapeDefinition, values: ParamValues): void {
    this.shape = shape;
    this.values = values;
    this.baseline = null;
    this.render();
  }

  /** The values a preset sets (null: none picked, back to the defaults). */
  setBaseline(baseline: ParamValues | null): void {
    this.baseline = baseline;
    this.updateVisibility();
  }

  /** What one setting's reset goes back to: the picked preset's value, else the default. */
  private target(def: ParamDef): ParamValues[string] {
    return this.baseline && def.key in this.baseline ? this.baseline[def.key] : def.default;
  }

  setValues(values: ParamValues): void {
    this.stopTyping();
    this.values = values;
    this.rows.forEach((r) => r.sync());
    this.updateVisibility();
  }

  setAdvanced(on: boolean): void {
    this.showAdvanced = on;
    this.updateVisibility();
  }

  /** Drop typing not applied yet, so it cannot land in another shape's or a preset's values. */
  private stopTyping(): void {
    this.typing.forEach((timer) => clearTimeout(timer));
    this.typing.clear();
  }

  render(): void {
    this.stopTyping();
    this.host.replaceChildren();
    this.rows.clear();
    const s = this.shape.id;
    for (const g of this.shape.groups.filter(this.filter)) {
      const det = document.createElement('details');
      det.className = 'group';
      det.open = isOpen(s, g.id);
      det.addEventListener('toggle', () => rememberOpen(s, g.id, det.open));
      det.dataset.group = g.id;
      const sum = document.createElement('summary');
      sum.textContent = t(shapeKey(s, `group.${g.id}`));
      det.append(sum);
      for (const def of g.params) det.append(this.row(def));
      this.host.append(det);
    }
    this.updateVisibility();
  }

  private label(def: ParamDef): HTMLElement {
    const s = this.shape.id;
    const lab = document.createElement('label');
    lab.className = 'plabel';
    lab.htmlFor = `p-${def.key}`;
    lab.textContent = t(shapeKey(s, `param.${def.key}`));
    const helpKey = shapeKey(s, `param.${def.key}.help`);
    if (has(helpKey)) {
      // a tooltip on hover; a click or tap (touch screens have no hover) shows the text under
      // the setting. It must not reach the label, which would focus the setting's input.
      const h = document.createElement('button');
      h.type = 'button';
      h.className = 'help';
      h.textContent = '?';
      h.title = t(helpKey);
      h.setAttribute('aria-label', t(helpKey));
      h.setAttribute('aria-expanded', 'false');
      h.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const row = h.closest('.prow')!;
        const open = row.querySelector(':scope > .phelp');
        if (open) open.remove();
        else {
          const text = document.createElement('p');
          text.className = 'hint phelp';
          text.textContent = t(helpKey);
          row.append(text);
        }
        h.setAttribute('aria-expanded', String(!open));
      });
      lab.append(h);
    }
    return lab;
  }

  private row(def: ParamDef): HTMLElement {
    const row = document.createElement('div');
    row.className = `prow prow-${def.type}`;
    let sync = () => {};
    if (def.type === 'number') {
      row.append(this.label(def));
      const wrap = document.createElement('div');
      wrap.className = 'pnum';
      const range = document.createElement('input');
      range.type = 'range';
      const box = document.createElement('input');
      box.type = 'number';
      box.id = `p-${def.key}`;
      for (const el of [range, box]) {
        el.min = String(def.min);
        el.max = String(def.max);
        el.step = String(def.step);
      }
      const unit = document.createElement('span');
      unit.className = 'unit';
      unit.textContent = def.unit === 'deg' ? '°' : (def.unit ?? '');
      const commit = (raw: string) => {
        const v = clamp(def, parseFloat(raw));
        if (Number.isNaN(v)) return;
        this.values[def.key] = v;
        range.value = box.value = String(v);
        this.onChange(def.key, this.values);
        this.updateVisibility();
      };
      range.addEventListener('input', () => commit(range.value));
      box.addEventListener('change', () => commit(box.value));
      sync = () => (range.value = box.value = String(this.values[def.key]));
      wrap.append(range, box, unit);
      row.append(wrap);
    } else if (def.type === 'color') {
      row.append(this.label(def));
      const input = document.createElement('input');
      input.id = `p-${def.key}`;
      input.type = 'color';
      input.className = 'pcolor';
      input.addEventListener('change', () => {
        this.values[def.key] = input.value;
        this.onChange(def.key, this.values);
        this.updateVisibility();
      });
      sync = () => (input.value = this.values[def.key] as string);
      row.append(input);
    } else if (def.type === 'text') {
      row.append(this.label(def));
      const input = def.multiline ? document.createElement('textarea') : document.createElement('input');
      input.id = `p-${def.key}`;
      input.maxLength = def.maxLength;
      if (input instanceof HTMLTextAreaElement) input.rows = 3;
      else input.type = 'text';
      input.className = 'ptext';
      // rebuild while typing, but not on every key stroke of a fast typist
      input.addEventListener('input', () => {
        clearTimeout(this.typing.get(def.key));
        this.typing.set(def.key, window.setTimeout(() => {
          this.typing.delete(def.key);
          this.values[def.key] = input.value;
          this.onChange(def.key, this.values);
          this.updateVisibility();
        }, 250));
      });
      sync = () => (input.value = this.values[def.key] as string);
      row.append(input);
    } else if (def.type === 'bool') {
      const lab = this.label(def);
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = `p-${def.key}`;
      cb.addEventListener('change', () => {
        this.values[def.key] = cb.checked;
        this.onChange(def.key, this.values);
        this.updateVisibility();
      });
      sync = () => (cb.checked = this.values[def.key] as boolean);
      row.append(cb, lab);
    } else {
      row.append(this.label(def));
      const sel = document.createElement('select');
      sel.id = `p-${def.key}`;
      for (const o of def.options) {
        const opt = document.createElement('option');
        opt.value = o;
        opt.textContent = t(shapeKey(this.shape.id, `param.${def.key}.${o}`));
        sel.append(opt);
      }
      sel.addEventListener('change', () => {
        this.values[def.key] = sel.value;
        this.onChange(def.key, this.values);
        this.updateVisibility();
      });
      sync = () => (sel.value = this.values[def.key] as string);
      row.append(sel);
    }
    // back to this one setting's value in the picked preset (or its default); only shown while it
    // differs. Its title is set with the visibility, as the preset can change.
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'preset-one';
    reset.textContent = '↺';
    reset.addEventListener('click', () => {
      this.values[def.key] = this.target(def);
      sync();
      this.onChange(def.key, this.values);
      this.updateVisibility();
    });
    row.append(reset);
    sync();
    this.rows.set(def.key, { def, row, sync, reset });
    return row;
  }

  /** A setting's reset value as the panel shows it (numbers stay numbers for the language's format). */
  private targetText(def: ParamDef): string | number {
    const v = this.target(def);
    if (def.type === 'number') return v as number;
    if (def.type === 'bool') return t(v ? 'ui.yes' : 'ui.no');
    if (def.type === 'select') return t(shapeKey(this.shape.id, `param.${def.key}.${v}`));
    return v ? (v as string) : t('ui.empty');
  }

  private updateVisibility(): void {
    this.rows.forEach(({ def, row, reset }) => {
      const vis = (!def.advanced || this.showAdvanced) && (!def.visibleIf || def.visibleIf(this.values));
      row.hidden = !vis;
      reset.hidden = this.values[def.key] === this.target(def);
      if (!reset.hidden) {
        const title = t(this.baseline ? 'ui.resetOnePreset' : 'ui.resetOne', { value: this.targetText(def), unit: def.type === 'number' && def.unit ? ` ${def.unit}` : '' });
        reset.title = title;
        reset.setAttribute('aria-label', title);
      }
    });
    this.host.querySelectorAll<HTMLDetailsElement>('details.group').forEach((d) => {
      d.hidden = ![...d.querySelectorAll<HTMLElement>('.prow')].some((r) => !r.hidden);
    });
  }
}

function clamp(def: NumberParam, v: number): number {
  if (Number.isNaN(v)) return v;
  const stepped = Math.round((v - def.min) / def.step) * def.step + def.min;
  return Math.min(def.max, Math.max(def.min, +stepped.toFixed(4)));
}

// Which groups are open is a per-viewer convenience: remembered in this browser only.
const DEFAULT_OPEN = ['panels', 'light', 'base'];
const OPEN_KEY = 'openGroups';

function openState(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function isOpen(shape: string, group: string): boolean {
  return openState()[`${shape}.${group}`] ?? DEFAULT_OPEN.includes(group);
}

function rememberOpen(shape: string, group: string, open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify({ ...openState(), [`${shape}.${group}`]: open }));
  } catch {
    /* private mode */
  }
}

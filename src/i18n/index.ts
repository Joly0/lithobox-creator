// Tiny i18n: one JSON dictionary per language in ./locales, `{name}` placeholders.
// To add a language, drop e.g. de.json next to en.json; it is picked up automatically.
const modules = import.meta.glob<{ default: Record<string, string> }>('./locales/*.json', { eager: true });

const dictionaries: Record<string, Record<string, string>> = {};
for (const [path, mod] of Object.entries(modules)) dictionaries[path.match(/([\w-]+)\.json$/)![1]] = mod.default;

export const languages = Object.keys(dictionaries).sort();
let current = 'en';
const listeners: (() => void)[] = [];

export function setLanguage(lang: string): void {
  if (!dictionaries[lang]) return;
  current = lang;
  document.documentElement.lang = lang;
  listeners.forEach((l) => l());
}

export function getLanguage(): string {
  return current;
}

export function onLanguageChange(fn: () => void): void {
  listeners.push(fn);
}

export function has(key: string): boolean {
  return key in (dictionaries[current] ?? {}) || key in dictionaries.en;
}

/** Settings other shapes borrow from the box keep the box's wording unless they have their own. */
const SHARED_SHAPE = 'box';

/** The key `shape.<shape>.<rest>`, or the box's one when this shape has no text of its own. */
export function shapeKey(shape: string, rest: string): string {
  const key = `shape.${shape}.${rest}`;
  return has(key) ? key : `shape.${SHARED_SHAPE}.${rest}`;
}

const numberFormats = new Map<string, Intl.NumberFormat>();

/** A number written the way the current language writes it (3.2 / 3,2). */
export function fmt(n: number): string {
  let f = numberFormats.get(current);
  if (!f) numberFormats.set(current, (f = new Intl.NumberFormat(current, { maximumFractionDigits: 2, useGrouping: false })));
  return f.format(n);
}

/** Translate; falls back to English, then to the key itself. Numbers follow the language. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const s = dictionaries[current]?.[key] ?? dictionaries.en?.[key] ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => {
    if (!(k in vars)) return `{${k}}`;
    const v = vars[k];
    if (typeof v === 'number') return fmt(v);
    // numbers that were pre-formatted as text (e.g. "1.1") get the language's decimal mark
    return /^-?\d+\.\d+$/.test(v) ? fmt(parseFloat(v)) : v;
  });
}

export function detectLanguage(): string {
  const saved = (() => {
    try {
      return localStorage.getItem('lang');
    } catch {
      return null;
    }
  })();
  if (saved && dictionaries[saved]) return saved;
  for (const l of navigator.languages ?? []) {
    const base = l.split('-')[0];
    if (dictionaries[base]) return base;
  }
  return 'en';
}

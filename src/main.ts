import './style.css';
import { defaultValues, matchingPreset, sanitize } from './core/shape';
import type { BuildResult, ParamValues } from './core/types';
import { to3mf } from './export/threemf';
import { toStl } from './export/stl';
import { toBambu3mf, type PrintObject } from './export/bambu3mf';
import { loadProfile, profileFromFile, saveProfile, type StoredProfile } from './export/profile';
import { orientGroup } from './export/transform';
import { zip } from './export/zip';
import { PROJECT_EXT, ProjectError, readProject, writeProject } from './export/project';
import { GeometryClient } from './geometry/client';
import { detectLanguage, languages, onLanguageChange, setLanguage, shapeKey, t } from './i18n';
import { getShape, shapes } from './shapes';
import { ParamPanel } from './ui/panel';
import { PicturesPanel } from './ui/pictures';
import { loadLastShape, loadSettings, saveSettings } from './ui/storage';
import { colourPicture, inColour, pictureArea, PREVIEW_RES, QUALITY_RES, thinnest } from './litho/build';
import { sampleLuminance, sampleSize } from './litho/image';
import { triangleEstimate, type Luminance } from './litho/mesh';
import { browserFamily } from './ui/browser';
import { replayRestored } from './ui/restore';
import { printLayout } from './ui/printlayout';
import { NoViewer, Viewer, type LampMap, type ModelViewer } from './ui/viewer';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
/** The page's own controls, before the settings panels add theirs (see the end of this file). */
const staticInputs = [...document.querySelectorAll<HTMLInputElement>('input')];

// ------------------------------------------------------------ state from URL
function readHash(): { shape: string; params: Partial<ParamValues> } {
  const h = new URLSearchParams(location.hash.slice(1));
  let params: Partial<ParamValues> = {};
  try {
    const p = h.get('p');
    if (p) params = JSON.parse(decodeURIComponent(escape(atob(p))));
  } catch {
    /* ignore a broken share link */
  }
  return { shape: h.get('s') ?? loadLastShape() ?? shapes[0].id, params };
}

function writeHash(): void {
  const defs = defaultValues(shape);
  const changed: ParamValues = {};
  for (const [k, v] of Object.entries(values)) if (defs[k] !== v) changed[k] = v;
  const h = new URLSearchParams({ s: shape.id });
  if (Object.keys(changed).length) h.set('p', btoa(unescape(encodeURIComponent(JSON.stringify(changed)))));
  history.replaceState(null, '', `#${h}`);
  // also remember them in this browser for the next visit
  saveSettings(shape.id, changed);
}

const initial = readHash();
let shape = getShape(initial.shape);
// a share link (settings in the address) wins; otherwise the last visit's settings
const hasLink = new URLSearchParams(location.hash.slice(1)).has('p');
const storedValues = (id: string) => (loadSettings(id) as Partial<ParamValues> | null) ?? {};
let values = sanitize(shape, hasLink ? initial.params : storedValues(shape.id));
let last: BuildResult | null = null;
/** Re-centre the camera after the next build (set when the size jumps). */
let reframe = false;

setLanguage(detectLanguage());

// ------------------------------------------------------------ viewer + worker
let viewer: ModelViewer;
let noViewer: NoViewer | null = null;

function startViewer(): boolean {
  try {
    // ?no3d simulates a browser without WebGL, to check the fallback
    if (new URLSearchParams(location.search).has('no3d')) throw new Error('no3d');
    viewer = new Viewer($('viewport'));
    return true;
  } catch {
    return false;
  }
}

/** No 3D in this browser: explain how to turn it on; settings and downloads still work. */
function showNoViewer(): void {
  noViewer?.remove();
  const fam = browserFamily();
  const steps: string[] = [];
  for (let i = 1; i <= 4 && t(`ui.noWebgl.${fam}.${i}`) !== `ui.noWebgl.${fam}.${i}`; i++) steps.push(t(`ui.noWebgl.${fam}.${i}`));
  viewer = noViewer = new NoViewer(
    $('viewport'),
    { title: t('ui.noWebglTitle'), body: t('ui.noWebgl'), howTitle: t('ui.noWebglHow'), steps, retry: t('ui.noWebglRetry') },
    () => {
      if (!startViewer()) return;
      noViewer?.remove();
      noViewer = null;
      document.body.classList.remove('no-3d');
      if (last) viewer.setParts(last.parts);
      viewer.setExplode(+$<HTMLInputElement>('explode').value);
      viewer.setSection($<HTMLInputElement>('section').checked);
      viewer.setEdges($<HTMLInputElement>('edges').checked);
      applyGhosts();
      viewer.setLamp($<HTMLInputElement>('lamp').checked);
    },
  );
  document.body.classList.add('no-3d');
}

if (!startViewer()) showNoViewer();
const status = $('status');
const client = new GeometryClient(
  (r, ms, res, from) => {
    // a build of the shape shown before (still running when the shape changed): its slots would
    // move the new shape's photos onto sides it does not have
    if (from && from !== shape.id) return;
    last = r;
    lastRes = res ?? PREVIEW_RES;
    if (printView) void showPrintView();
    else viewer.setParts(r.parts);
    updateLampMaps();
    pictures.setSlots(r.slots.map((s) => ({ id: s.id, ...pictureArea(s, values), outline: s.outline, margin: values.lithoMargin as number })));
    applyGhosts();
    hasReliefs = r.parts.some((p) => p.relief);
    document.body.classList.toggle('has-pictures', hasReliefs);
    applyLamp();
    if (reframe) viewer.frame();
    reframe = false;
    renderInfo(r);
    // say whether the relief shown is the quick sketch or the chosen detail
    const fine = lastRes < PREVIEW_RES && r.parts.some((p) => p.relief);
    status.textContent = fine ? t('status.builtFine', { ms: Math.round(ms), res: lastRes }) : t('status.built', { ms: Math.round(ms) });
    status.className = 'status';
  },
  (err) => {
    status.textContent = t('status.error', { error: err });
    status.className = 'status error';
  },
  (busy) => document.body.classList.toggle('busy', busy),
);

let timer = 0;
let refineTimer = 0;
/** Grid of the relief now shown (the coarse preview grid or the chosen detail). */
let lastRes = PREVIEW_RES;
/** After the last change, wait this long and then show the relief at the chosen detail. */
const REFINE_DELAY = 500;

function rebuild(): void {
  clearTimeout(timer);
  clearTimeout(refineTimer);
  // coarse while editing, so sliders stay quick; the address bar is updated in the same
  // pause, since browsers limit how often replaceState may be called
  timer = window.setTimeout(() => {
    client.request({ shape: shape.id, params: values, pictures: pictureGrids(PREVIEW_RES) });
    writeHash();
  }, 30);
  refineTimer = window.setTimeout(refine, REFINE_DELAY);
}

/** Rebuild once at the chosen detail when editing has paused (the print view does its own). */
function refine(): void {
  const res = QUALITY_RES[String(values.lithoQuality)] ?? QUALITY_RES.normal;
  if (printView || !pictures.placements.size || res >= PREVIEW_RES) return;
  client.request({ shape: shape.id, params: values, pictures: pictureGrids(res), resolution: res });
}

// ------------------------------------------------------------ settings panel
const onParam = (_k: string, v: ParamValues) => {
  values = v;
  syncPreset();
  rebuild();
};
// step 1 shows the shape's design groups, step 2 the groups about pictures
const panels = [
  new ParamPanel($('params'), shape, values, onParam, (g) => (g.step ?? 'design') === 'design'),
  new ParamPanel($('lithoParams'), shape, values, onParam, (g) => g.step === 'pictures'),
];

// ------------------------------------------------------------ steps
/** The last build had lithophanes (after a reload the photos arrive a moment after the first build). */
let hasReliefs = false;
type Step = 'design' | 'pictures';
function setStep(step: Step): void {
  document.body.dataset.step = step;
  for (const b of document.querySelectorAll<HTMLButtonElement>('.steps .step')) b.setAttribute('aria-selected', String(b.dataset.step === step));
  $('step-design').hidden = step !== 'design';
  $('step-pictures').hidden = step !== 'pictures';
  applyLamp();
  document.querySelector('.side')?.scrollTo({ top: 0 });
}
for (const b of document.querySelectorAll<HTMLButtonElement>('.steps .step, [data-goto]'))
  b.addEventListener('click', () => setStep((b.dataset.step ?? b.dataset.goto) as Step));
setStep('design');

// ------------------------------------------------------------ shape picker
const shapeSel = $<HTMLSelectElement>('shape');
$('shapeRow').hidden = shapes.length < 2;

function renderShapes(): void {
  shapeSel.replaceChildren(...shapes.map((s) => new Option(t(`shape.${s.id}.name`), s.id)));
  shapeSel.value = shape.id;
}

/** Switch to another shape, with the given settings or the ones last used for it. */
function setShape(id: string, params?: Partial<ParamValues>): void {
  shape = getShape(id);
  values = sanitize(shape, params ?? storedValues(shape.id));
  panels.forEach((p) => p.setShape(shape, values));
  shapeSel.value = shape.id;
  $('presetRow').hidden = !shape.presets?.length;
  renderPresets();
  reframe = true;
  rebuild();
}
shapeSel.addEventListener('change', () => setShape(shapeSel.value));

// ------------------------------------------------------------ presets
const presetSel = $<HTMLSelectElement>('preset');
$('presetRow').hidden = !shape.presets?.length;

function renderPresets(): void {
  presetSel.replaceChildren();
  const custom = new Option(t('ui.presetCustom'), '');
  custom.disabled = true;
  presetSel.append(custom);
  for (const pr of shape.presets ?? []) presetSel.append(new Option(t(`shape.${shape.id}.preset.${pr.id}`), pr.id));
  syncPreset();
}

/** Show the preset the current values match, or "your own size". */
function syncPreset(): void {
  presetSel.value = matchingPreset(shape, values)?.id ?? '';
}

presetSel.addEventListener('change', () => {
  const pr = shape.presets?.find((x) => x.id === presetSel.value);
  if (!pr) return;
  values = sanitize(shape, { ...values, ...pr.values });
  reframe = true;
  panels.forEach((p) => p.setValues(values));
  syncPreset();
  rebuild();
});

$<HTMLInputElement>('advanced').addEventListener('change', (e) => panels.forEach((p) => p.setAdvanced((e.target as HTMLInputElement).checked)));
$('reset').addEventListener('click', () => {
  values = defaultValues(shape);
  reframe = true;
  panels.forEach((p) => p.setValues(values));
  syncPreset();
  rebuild();
});

// ------------------------------------------------------------ view controls
$<HTMLInputElement>('explode').addEventListener('input', (e) => viewer.setExplode(+(e.target as HTMLInputElement).value));
$<HTMLInputElement>('section').addEventListener('change', (e) => viewer.setSection((e.target as HTMLInputElement).checked));
/** Hide or show the lithophane and lamp stand-ins; re-applied after every build. */
function applyGhosts(): void {
  const show = $<HTMLInputElement>('ghosts').checked;
  viewer.setHidden(show || !last ? [] : last.parts.filter((p) => p.preview).map((p) => p.id));
}
$<HTMLInputElement>('ghosts').addEventListener('change', applyGhosts);
$<HTMLInputElement>('edges').addEventListener('change', (e) => viewer.setEdges((e.target as HTMLInputElement).checked));
// ------------------------------------------------------------ print view
/** Show the parts as they go to the slicer: print orientation, fins, the chosen detail. */
let printView = false;
let printSeq = 0;

/** The bed the print view lays plates out on: the slicer profile's, else the setting, else 256 mm. */
function printBed(): [number, number] {
  if (profile) return profile.bed;
  return typeof values.bedSize === 'number' ? [values.bedSize, values.bedSize] : [256, 256];
}

async function showPrintView(): Promise<void> {
  const seq = ++printSeq;
  status.textContent = t('status.printViewBusy');
  const r = await exportResult();
  if (!r || seq !== printSeq || !printView) return;
  const { parts, plates } = printLayout(r.parts, printBed());
  viewer.setParts(parts);
  viewer.setPlates(plates);
  const res = QUALITY_RES[String(values.lithoQuality)] ?? QUALITY_RES.normal;
  const tris = parts.reduce((n, p) => n + p.mesh.indices.length / 3, 0);
  status.textContent = t(r.parts.some((p) => p.relief) ? 'status.printView' : 'status.printViewPlain', { res, tris: Math.round(tris) });
}

$<HTMLInputElement>('printView').addEventListener('change', (e) => {
  printView = (e.target as HTMLInputElement).checked;
  printSeq++;
  if (printView) void showPrintView();
  else if (last) {
    viewer.setPlates(null);
    viewer.setParts(last.parts);
    applyGhosts();
    updateLampMaps();
    status.textContent = '';
    if (lastRes >= PREVIEW_RES) refine();
  }
});
/**
 * The lamp view only makes sense with pictures: in step 1 without any it waits, and the switch
 * keeps its state, so it comes back on by itself once the photos are there.
 */
function applyLamp(): void {
  viewer.setLamp($<HTMLInputElement>('lamp').checked && (hasReliefs || document.body.dataset.step === 'pictures'));
}
$<HTMLInputElement>('lamp').addEventListener('change', () => {
  applyLamp();
  updateLampMaps();
});

/** The lamp view samples the pictures finer than the preview mesh (only while it is on). */
const LAMP_RES = 0.2;
/** A picture that is all white: a ball with only its back photo. */
const WHITE: Luminance = { cols: 2, rows: 2, data: new Float32Array(4).fill(1) };
/** Colour pictures' stacks per lamp grid, so a rebuild with the same colours reuses them. */
const colourCache = new WeakMap<Luminance, { key: string } & ReturnType<typeof colourPicture>>();
function updateLampMaps(): void {
  if (!$<HTMLInputElement>('lamp').checked || !last) return;
  const maps: Record<string, LampMap> = {};
  for (const [id, grid] of Object.entries(pictureGrids(LAMP_RES))) {
    const slot = last.slots.find((s) => s.id === id)!;
    const area = pictureArea(slot, values);
    // as in src/litho/build.ts: the thickness range, and a colour picture's stacks
    let lum = grid, tint: LampMap['tint'];
    if (inColour(slot, values)) {
      const key = ['colourLayers', 'filamentCyan', 'filamentMagenta', 'filamentYellow'].map((k) => values[k]).join() + `:${slot.thickness}:${area.width}x${area.height}`;
      let c = colourCache.get(grid);
      if (c?.key !== key) colourCache.set(grid, (c = { key, ...colourPicture(grid, area.width, area.height, slot, values) }));
      lum = c.lum;
      tint = c.colour;
    }
    maps[`litho-${id}`] = { lum, width: area.width, height: area.height, minThickness: thinnest(slot, values), thickness: slot.thickness, curve: values.lithoCurve === 'linear' ? 'linear' : 'light', tint };
  }
  // a ball's second photo goes into its main picture's map (a white one when that has no photo)
  for (const s of last.slots) {
    if (!s.pictureOf) continue;
    const back = maps[`litho-${s.id}`];
    delete maps[`litho-${s.id}`];
    if (!back) continue;
    const key = `litho-${s.pictureOf}`;
    maps[key] = { ...(maps[key] ?? { ...back, lum: WHITE }), back: back.lum };
  }
  viewer.setLampMaps(maps);
}
$('frame').addEventListener('click', () => viewer.frame());

// ------------------------------------------------------------ info + warnings
// ------------------------------------------------------------ pictures (lithophanes)
const pictures = new PicturesPanel($('pictures'), () => rebuild());
// photos and their placements from the last visit
void pictures.restore();
const gridCache = new Map<string, { key: string; lum: Luminance }>();

/** Grayscale grids of all pictures at a resolution, cropped to their slot's picture area. */
function pictureGrids(resolution: number): Record<string, Luminance> {
  const out: Record<string, Luminance> = {};
  for (const [id, pic] of pictures.placements) {
    const slot = last?.slots.find((s) => s.id === id);
    if (!slot) continue;
    const area = pictureArea(slot, values);
    const { cols, rows } = sampleSize(area.width, area.height, resolution);
    const colour = inColour(slot, values);
    const key = `${pic.photo.id}:${pic.version}:${cols}x${rows}:${colour}`;
    const cached = gridCache.get(`${id}@${resolution}`);
    if (cached?.key === key) out[id] = cached.lum;
    else {
      out[id] = sampleLuminance(pic, cols, rows, resolution, colour);
      gridCache.set(`${id}@${resolution}`, { key, lum: out[id] });
    }
  }
  return out;
}

/** What gets exported: the preview build, or with pictures a full-quality rebuild. */
async function exportResult(): Promise<BuildResult | null> {
  if (!last) return null;
  if (!pictures.placements.size) return last;
  const res = QUALITY_RES[String(values.lithoQuality)] ?? QUALITY_RES.normal;
  status.textContent = t('status.exporting');
  try {
    return await client.buildOnce({ shape: shape.id, params: values, pictures: pictureGrids(res), resolution: res });
  } finally {
    status.textContent = '';
  }
}

/** Display name of a part; lithophanes are named after their slot. */
function partName(id: string): string {
  const m = id.match(/^litho-(\w+?)(-fins|-cyan|-magenta|-yellow)?$/);
  if (m) return t(m[2] ? `litho.${m[2].slice(1)}` : 'litho.part', { slot: t(`slot.${m[1]}`) });
  return t(shapeKey(shape.id, `part.${id}`));
}

function renderInfo(r: BuildResult): void {
  const list = $('info');
  list.replaceChildren();
  for (const w of r.warnings) {
    const li = document.createElement('li');
    li.className = 'warn';
    li.textContent = t(w.key, w.vars);
    list.append(li);
  }
  for (const i of r.info) {
    const li = document.createElement('li');
    li.textContent = t(i.key, i.vars);
    list.append(li);
  }
  // lithophanes make big files: say how big before the download
  if (pictures.placements.size) {
    // the reliefs: slots with a photo, or whose second photo (a ball's back) has one
    const reliefs = r.slots.filter((s) => !s.pictureOf && (pictures.placements.has(s.id) || r.slots.some((b) => b.pictureOf === s.id && pictures.placements.has(b.id))));
    const res = QUALITY_RES[String(values.lithoQuality)] ?? QUALITY_RES.normal;
    let tris = 0;
    for (const s of reliefs)
      tris += triangleEstimate({ width: s.width, height: s.height, thickness: s.thickness, margin: 2, minThickness: 0.8, resolution: res, wrapRadius: s.wrap?.radius, wrapOpen: s.wrap?.open });
    const li = document.createElement('li');
    // about 12 bytes per triangle once compressed (measured with photo-like pictures)
    li.textContent = t('info.lithoSize', { n: reliefs.length, tris: (tris / 1e6).toFixed(1), mb: Math.max(1, Math.round((tris * 12) / 1e6)) });
    list.append(li);
  }
  const parts = $('parts');
  parts.replaceChildren();
  for (const p of r.parts.filter((p) => !p.preview && !p.printOnly)) {
    const b = document.createElement('button');
    b.className = 'part';
    b.innerHTML = `<span class="sw" style="background:${p.color}"></span>`;
    b.append(partName(p.id));
    b.title = t('export.stlOne');
    b.addEventListener('click', () => downloadStl(p.id));
    parts.append(b);
  }
}

// ------------------------------------------------------------ export
/** Printable parts in print orientation; volumes of one object are oriented together. */
function printable(r: BuildResult) {
  return printObjects(r).flatMap((o, i) =>
    o.volumes.map((v, j) => ({ id: o.volumes.length > 1 ? `${o.ids[j]}` : o.ids[0], name: v.name, positions: v.positions, indices: v.indices, key: `${i}-${j}` })),
  );
}

function save(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

const baseName = () => `lithobox-${shape.id}`;

async function downloadStl(partId: string): Promise<void> {
  const r = await exportResult();
  if (!r) return;
  const p = printable(r).find((x) => x.id === partId);
  if (p) save(new Blob([toStl(p.positions, p.indices) as BlobPart]), `${baseName()}-${p.id}.stl`);
}

/** Printable parts grouped into slicer objects (volumes of one object stay together). */
function printObjects(r: BuildResult): (PrintObject & { ids: string[] })[] {
  const groups = new Map<string, typeof r.parts>();
  for (const p of r.parts.filter((x) => !x.preview)) {
    const key = p.object ?? p.id;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.entries()].map(([key, parts]) => {
    const pos = orientGroup(parts.map((p) => p.mesh), parts[0].printRotation);
    return {
      name: partName(key),
      ids: parts.map((p) => p.id),
      settings: Object.assign({}, ...parts.map((p) => p.slicer ?? {})),
      volumes: parts.map((p, i) => ({ name: partName(p.id), positions: pos[i], indices: p.mesh.indices, extruder: p.extruder })),
    };
  });
}

// ------------------------------------------------------------ slicer profile
let profile: StoredProfile | null = loadProfile();
const profileInfo = $('profileInfo');

function renderProfile(): void {
  profileInfo.textContent = profile
    ? t('profile.loaded', { printer: profile.printer, print: profile.print, filaments: profile.filaments.join(', ') })
    : t('profile.none');
  $('profileClear').hidden = !profile;
}

$<HTMLInputElement>('profileFile').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    profile = await profileFromFile(file);
    saveProfile(profile);
  } catch (err) {
    profileInfo.textContent = t(err instanceof Error ? err.message : 'profile.errNotProject');
    return;
  }
  renderProfile();
});
$('profileClear').addEventListener('click', () => {
  profile = null;
  saveProfile(null);
  renderProfile();
});

$('export3mf').addEventListener('click', async () => {
  const r = await exportResult();
  if (!r) return;
  const objects = printObjects(r);
  let bed: [number, number] = typeof values.bedSize === 'number' ? [values.bedSize, values.bedSize] : [256, 256];
  if (profile) {
    bed = profile.bed;
    // parts meant for a filament the profile doesn't have go to filament 1
    const count = Math.max(1, profile.filaments.length);
    for (const o of objects) for (const v of o.volumes) if ((v.extruder ?? 1) > count) v.extruder = 1;
  }
  save(await toBambu3mf(objects, { title: t('app.title'), bed, profile: profile ?? undefined }), `${baseName()}.3mf`);
});
$('exportPlain').addEventListener('click', async () => {
  const r = await exportResult();
  if (!r) return;
  save(await to3mf(printable(r), t('app.title')), `${baseName()}-plain.3mf`);
});
$('exportStl').addEventListener('click', async () => {
  const r = await exportResult();
  if (!r) return;
  const files = printable(r).map((p) => ({ name: `${baseName()}-${p.id}.stl`, data: toStl(p.positions, p.indices) }));
  save(await zip(files), `${baseName()}-stl.zip`);
});

// ------------------------------------------------------------ project file
// One .lithobox file with the settings and the placed photos: a backup, or a design to send.
$('saveProject').addEventListener('click', async () => {
  const { photos, slots } = pictures.snapshot();
  save(await writeProject({ shape: shape.id, params: { ...values }, photos, slots }), `${baseName()}${PROJECT_EXT}`);
});
$<HTMLInputElement>('projectFile').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  let read: Awaited<ReturnType<typeof readProject>>;
  try {
    read = await readProject(file);
  } catch (err) {
    alert(t(err instanceof ProjectError ? err.message : 'project.errInvalid'));
    return;
  }
  const { project } = read;
  if (!shapes.some((s) => s.id === project.shape)) {
    alert(t('project.errShape'));
    return;
  }
  const defs = defaultValues(shape);
  const hasWork = pictures.library.length > 0 || Object.entries(values).some(([k, v]) => defs[k] !== v);
  if (hasWork && !confirm(t('project.replaceConfirm'))) return;
  // settings first; the photos land on the project's slots once its shape's first build is back
  setShape(project.shape, project.params);
  const failed = await pictures.replace(project.photos, project.slots);
  if (read.missing + failed) alert(t('project.photosMissing', { n: read.missing + failed }));
});

// ------------------------------------------------------------ language
const langSel = $<HTMLSelectElement>('lang');
for (const l of languages) {
  const o = document.createElement('option');
  o.value = l;
  // each language in its own name: Deutsch, Français, ...
  let name = l.toUpperCase();
  try {
    const n = new Intl.DisplayNames([l], { type: 'language' }).of(l);
    if (n) name = n.charAt(0).toLocaleUpperCase(l) + n.slice(1);
  } catch {
    /* old browser: keep the code */
  }
  o.textContent = name;
  langSel.append(o);
}
langSel.hidden = languages.length < 2;
langSel.addEventListener('change', () => {
  setLanguage(langSel.value);
  try {
    localStorage.setItem('lang', langSel.value);
  } catch {
    /* private mode */
  }
});

function translateStatic(): void {
  document.title = t('app.title');
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n!)));
  langSel.value = document.documentElement.lang;
  $('saveProject').title = t('project.saveHint');
  $('projectOpen').title = t('project.openHint');
  panels.forEach((p) => p.render());
  renderShapes();
  renderPresets();
  pictures.render();
  if (noViewer) showNoViewer();
  renderProfile();
  if (last) renderInfo(last);
}
onLanguageChange(translateStatic);
translateStatic();
rebuild();

// a reload can bring back ticked boxes and moved sliders: apply them like a click would
replayRestored(staticInputs);

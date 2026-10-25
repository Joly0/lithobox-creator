// The user's own slicer profile, taken from a 3MF project they saved in OrcaSlicer or
// Bambu Studio. Kept in this browser only (localStorage), never uploaded.
import type { SlicerProfile } from './bambu3mf';
import { readZipText } from './unzip';

export interface StoredProfile extends SlicerProfile {
  printer: string;
  print: string;
  filaments: string[];
  /** Bed width and depth in mm. */
  bed: [number, number];
}

const KEY = 'slicerProfile';

/** Throws an Error whose message is an i18n key when the file has no usable profile. */
export async function profileFromFile(file: File): Promise<StoredProfile> {
  let head: string | null;
  let settings: string | null;
  try {
    head = await readZipText(file, '3D/3dmodel.model', 16000);
    settings = await readZipText(file, 'Metadata/project_settings.config');
  } catch {
    throw new Error('profile.errNotProject');
  }
  if (!head || !settings) throw new Error('profile.errNotProject');
  const tag = (name: string) => head!.match(new RegExp(`<metadata name="${name}">([^<]*)</metadata>`))?.[1];
  const application = tag('Application');
  if (!application || !/^(BambuStudio|OrcaSlicer)-/.test(application)) throw new Error('profile.errNotProject');
  let cfg: Record<string, unknown>;
  try {
    cfg = JSON.parse(settings);
  } catch {
    throw new Error('profile.errNotProject');
  }
  const area = (cfg.printable_area as string[] | undefined)?.map((s) => s.split('x').map(Number)) ?? [];
  const xs = area.map((a) => a[0]), ys = area.map((a) => a[1]);
  const bed: [number, number] = area.length ? [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)] : [256, 256];
  const filaments = (cfg.filament_settings_id as string[] | undefined) ?? [];
  return {
    application,
    orca: tag('OrcaSlicer'),
    settings,
    printer: String(cfg.printer_settings_id ?? ''),
    print: String(cfg.print_settings_id ?? ''),
    filaments,
    bed,
  };
}

export function saveProfile(p: StoredProfile | null): void {
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify(p));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode or full storage: the profile then lasts for this visit only */
  }
}

export function loadProfile(): StoredProfile | null {
  try {
    const s = localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as StoredProfile) : null;
  } catch {
    return null;
  }
}

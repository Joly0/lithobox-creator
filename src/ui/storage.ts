// Keeps the user's work in this browser between visits: settings in localStorage, photos
// (original files) and their placements in IndexedDB. Nothing leaves the computer. Every
// call is allowed to fail (private windows, blocked storage): the app then simply starts
// empty next time.

const DB = 'lithobox';
const PHOTOS = 'photos';
const KV = 'kv';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(PHOTOS, { keyPath: 'id' });
        req.result.createObjectStore(KV);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return db().then(
    (d) =>
      new Promise((resolve) => {
        if (!d) return resolve(null);
        try {
          const req = fn(d.transaction(store, mode).objectStore(store));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

export interface StoredPhoto {
  id: string;
  name: string;
  blob: Blob;
}

export const savePhoto = (p: StoredPhoto) => run(PHOTOS, 'readwrite', (s) => s.put(p));
export const deletePhoto = (id: string) => run(PHOTOS, 'readwrite', (s) => s.delete(id));
export const loadPhotos = async () => (await run<StoredPhoto[]>(PHOTOS, 'readonly', (s) => s.getAll())) ?? [];
export const saveValue = (key: string, value: unknown) => run(KV, 'readwrite', (s) => s.put(value, key));
export const loadValue = <T>(key: string) => run<T>(KV, 'readonly', (s) => s.get(key));

// ---------------------------------------------------------------- settings

// one entry per shape; the box keeps the key it had before there were other shapes
const settingsKey = (shape: string) => (shape === 'box' ? 'settings' : `settings.${shape}`);
const LAST_SHAPE = 'shape';

export function saveSettings(shape: string, changed: Record<string, unknown>): void {
  try {
    localStorage.setItem(settingsKey(shape), JSON.stringify(changed));
    localStorage.setItem(LAST_SHAPE, shape);
  } catch {
    /* storage blocked */
  }
}

export function loadSettings(shape: string): Record<string, unknown> | null {
  try {
    const s = localStorage.getItem(settingsKey(shape));
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

/** The shape used on the last visit, if any. */
export function loadLastShape(): string | null {
  try {
    return localStorage.getItem(LAST_SHAPE);
  } catch {
    return null;
  }
}

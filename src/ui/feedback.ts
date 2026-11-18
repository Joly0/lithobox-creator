// The "Feedback" button in the header and its dialog. The text goes to our own small server
// (server/feedback), which files it as an issue in a private repository.
import { VERSION } from '../changes';
import { getLanguage, t } from '../i18n';

const ENDPOINT = 'https://feedback.lithobox.app/';

const $ = (id: string) => document.getElementById(id)!;

let shapeId = () => '';

const MAX_SHOTS = 3; // the server takes no more
const SHOT_SIZE = 1600; // longest side in pixels: text stays readable, the upload stays small

/** A picture made smaller for sending: WebP where the browser can write it, JPEG otherwise. */
async function shrink(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, SHOT_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((done) => canvas.toBlob(done, type, 0.85));
  const webp = await encode('image/webp');
  // Safari writes PNG when asked for WebP
  if (webp?.type === 'image/webp') return webp;
  const jpeg = await encode('image/jpeg');
  if (!jpeg) throw new Error('feedback: picture could not be encoded');
  return jpeg;
}

/** What the server expects: the type and the bytes as base64. */
async function encodeShot(blob: Blob): Promise<{ type: string; data: string }> {
  const url = await new Promise<string>((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(reader.result as string);
    reader.onerror = () => fail(reader.error);
    reader.readAsDataURL(blob);
  });
  return { type: blob.type, data: url.slice(url.indexOf(',') + 1) };
}

/** What every message carries besides the text. */
export const feedbackContext = () => ({
  version: `${VERSION.date} (${VERSION.commit})`,
  shape: shapeId(),
  browser: navigator.userAgent,
  language: getLanguage(),
});

/** Send one message to the feedback server; throws when it did not get through. */
export async function sendFeedback(data: Record<string, unknown>): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, ...feedbackContext() }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`feedback: ${res.status}`);
}

/** The labels that are not plain text in the page; call again after a language change. */
export function renderFeedback(): void {
  $('feedbackOpen').setAttribute('aria-label', t('feedback.button'));
  $('feedbackShots').querySelectorAll('button').forEach((b) => b.setAttribute('aria-label', t('feedback.shotRemove')));
  ($('feedbackMessage') as HTMLTextAreaElement).placeholder = t('feedback.placeholder');
}

export function wireFeedback(shape: () => string): void {
  shapeId = shape;
  const dialog = $('feedback') as HTMLDialogElement;
  const form = $('feedbackForm') as HTMLFormElement;
  const send = $('feedbackSend') as HTMLButtonElement;
  const failed = $('feedbackError');
  const thanks = $('feedbackThanks');
  const list = $('feedbackShots');
  let shots: Blob[] = [];

  const renderShots = () => {
    list.querySelectorAll('img').forEach((img) => URL.revokeObjectURL(img.src));
    list.replaceChildren(
      ...shots.map((blob, i) => {
        const item = document.createElement('div');
        item.className = 'shot';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(blob);
        img.alt = '';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '✕';
        remove.setAttribute('aria-label', t('feedback.shotRemove'));
        remove.addEventListener('click', () => {
          shots.splice(i, 1);
          renderShots();
        });
        item.append(img, remove);
        return item;
      }),
    );
    $('feedbackShotAdd').hidden = shots.length >= MAX_SHOTS;
  };
  const addShots = async (files: Iterable<Blob>) => {
    for (const file of files) {
      if (shots.length >= MAX_SHOTS) break;
      if (!file.type.startsWith('image/')) continue;
      try {
        shots.push(await shrink(file));
      } catch {
        // a format this browser can't open (e.g. HEIC on some systems) is left out
      }
    }
    renderShots();
  };
  const picker = $('feedbackShotFile') as HTMLInputElement;
  picker.addEventListener('change', () => {
    void addShots([...(picker.files ?? [])]);
    picker.value = '';
  });
  // Ctrl+V with a picture on the clipboard, anywhere in the dialog
  dialog.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    void addShots(files);
  });

  $('feedbackOpen').addEventListener('click', () => {
    form.hidden = false;
    thanks.hidden = true;
    const c = feedbackContext();
    // shows exactly what is sent, so nobody has to take our word for it
    $('feedbackContext').replaceChildren(
      ...[
        ['feedback.version', c.version],
        ['ui.shape', c.shape],
        ['feedback.browser', c.browser],
        ['feedback.language', c.language],
      ].map(([key, value]) => {
        const li = document.createElement('li');
        li.textContent = `${t(key)}: ${value}`;
        return li;
      }),
    );
    dialog.showModal();
  });
  $('feedbackClose').addEventListener('click', () => dialog.close());
  // a click on the backdrop lands on the dialog itself
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    send.disabled = true;
    failed.hidden = true;
    try {
      const screenshots = await Promise.all(shots.map(encodeShot));
      await sendFeedback({ ...Object.fromEntries(new FormData(form)), screenshots });
      form.reset();
      shots = [];
      renderShots();
      form.hidden = true;
      thanks.hidden = false;
      send.textContent = t('feedback.send');
    } catch {
      // the form stays filled in, so nothing the person wrote is lost
      failed.hidden = false;
      send.textContent = t('feedback.retry');
    }
    send.disabled = false;
  });
}

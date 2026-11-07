// The "Feedback" button in the header and its dialog. The text goes to our own small server
// (server/feedback), which files it as an issue in a private repository.
import { VERSION } from '../changes';
import { getLanguage, t } from '../i18n';

const ENDPOINT = 'https://feedback.lithobox.app/';

const $ = (id: string) => document.getElementById(id)!;

/** The labels that are not plain text in the page; call again after a language change. */
export function renderFeedback(): void {
  $('feedbackOpen').setAttribute('aria-label', t('feedback.button'));
  ($('feedbackMessage') as HTMLTextAreaElement).placeholder = t('feedback.placeholder');
}

export function wireFeedback(shapeId: () => string): void {
  const dialog = $('feedback') as HTMLDialogElement;
  const form = $('feedbackForm') as HTMLFormElement;
  const send = $('feedbackSend') as HTMLButtonElement;
  const failed = $('feedbackError');
  const thanks = $('feedbackThanks');
  const context = () => ({
    version: `${VERSION.date} (${VERSION.commit})`,
    shape: shapeId(),
    browser: navigator.userAgent,
    language: getLanguage(),
  });

  $('feedbackOpen').addEventListener('click', () => {
    form.hidden = false;
    thanks.hidden = true;
    const c = context();
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
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...Object.fromEntries(new FormData(form)), ...context() }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`feedback: ${res.status}`);
      form.reset();
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

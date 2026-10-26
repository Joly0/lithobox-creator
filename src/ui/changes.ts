// The version label in the header and the "What's new" dialog it opens.
import { CHANGES, VERSION } from '../changes';
import { getLanguage, t } from '../i18n';

const $ = (id: string) => document.getElementById(id)!;

/** A YYYY-MM-DD date in the page's language (noon, so no time zone moves it a day). */
function day(date: string): string {
  return new Intl.DateTimeFormat(getLanguage(), { dateStyle: 'medium' }).format(new Date(`${date}T12:00:00`));
}

/** Fill the label and the dialog in the current language; call again after a language change. */
export function renderChanges(): void {
  // a small button: a star, "What's new" and the version's date (the hash is in the dialog)
  const label = $('version');
  label.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" /></svg>';
  const text = document.createElement('span');
  text.className = 'version-text';
  text.textContent = t('changes.title');
  const date = document.createElement('span');
  date.className = 'version-date';
  date.textContent = day(VERSION.date);
  label.append(text, date);
  label.title = t('changes.version', { commit: VERSION.commit, date: day(VERSION.date) });
  label.setAttribute('aria-label', t('changes.title'));
  const lang = getLanguage();
  const list = $('changesList');
  list.replaceChildren();
  for (const d of CHANGES) {
    const h = document.createElement('h3');
    h.textContent = day(d.date);
    const ul = document.createElement('ul');
    for (const item of d.items) {
      const li = document.createElement('li');
      li.textContent = item[lang] ?? item.en;
      ul.append(li);
    }
    list.append(h, ul);
  }
  $('changesVersion').textContent = t('changes.version', { commit: VERSION.commit, date: day(VERSION.date) });
}

export function wireChanges(): void {
  const dialog = $('changes') as HTMLDialogElement;
  $('version').addEventListener('click', () => dialog.showModal());
  $('changesClose').addEventListener('click', () => dialog.close());
  // a click on the backdrop lands on the dialog itself
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

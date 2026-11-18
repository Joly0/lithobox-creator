// The quick rating that slides in after a download: one tap on a star, then an optional comment.
// Stars only go to the page statistics; a written comment goes to the feedback server.
import { CHANGES } from '../changes';
import { t } from '../i18n';
import { track } from '../track';
import { feedbackContext, sendFeedback } from './feedback';

const $ = (id: string) => document.getElementById(id)!;

const DAY = 86_400_000;
const KEY = 'rating';
// a new "What's new" entry counts as a new version; the commit hash changes on every deploy
const RELEASE = CHANGES[0]?.date ?? '';

export interface RatingState {
  release: string;
  ratedAt?: number;
  closedAt?: number;
  closes: number;
}

/** Ask once per release, then not for 30 days after a rating or 7 after a close, and never after three closes. */
export function shouldAsk(s: RatingState | null, release: string, now: number): boolean {
  if (!s || s.release !== release) return true;
  if (s.ratedAt && now - s.ratedAt < 30 * DAY) return false;
  if (s.closes >= 3) return false;
  return !s.closedAt || now - s.closedAt >= 7 * DAY;
}

function load(): RatingState | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}

function store(s: RatingState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked */
  }
}

let asked = false; // at most once per visit
let newVersion = false;
let state: RatingState = { release: RELEASE, closes: 0 };
let stars = 0;
let hideTimer = 0;
let trackTimer = 0;

/** The texts the page sweep can't set; call again after a language change. */
export function renderRating(): void {
  $('rateTitle').textContent = t(stars ? 'feedback.rate.thanks' : newVersion ? 'feedback.rate.titleNew' : 'feedback.rate.title');
  $('rateAsk').textContent = t(stars && stars <= 3 ? 'feedback.rate.low' : 'feedback.rate.high');
  $('rateClose').setAttribute('aria-label', t('changes.close'));
  $('rateStars').querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-label', t('feedback.rate.star', { n: i + 1 })));
}

/** Count the rating once, with the star it ended on. */
function flush(): void {
  if (!trackTimer) return;
  clearTimeout(trackTimer);
  trackTimer = 0;
  track('rating', { stars: String(stars), shape: feedbackContext().shape });
}

function hide(): void {
  flush();
  clearTimeout(hideTimer);
  $('rate').hidden = true;
}

/** Closed without a rating: asked again less often. */
function dismiss(): void {
  hide();
  if (stars) return;
  state = { ...state, closes: state.closes + 1, closedAt: Date.now() };
  store(state);
}

function show(): void {
  stars = 0;
  $('rateStars').querySelectorAll('button').forEach((b) => b.classList.remove('on'));
  $('rateForm').hidden = true;
  $('rateThanks').hidden = true;
  $('rateError').hidden = true;
  renderRating();
  $('rate').hidden = false;
  // nobody touched it: it goes away by itself
  hideTimer = window.setTimeout(dismiss, 15_000);
}

/** After a download; shows the panel when the rules above allow it. */
export function offerRating(): void {
  if (asked) return;
  asked = true;
  const s = load();
  if (!shouldAsk(s, RELEASE, Date.now())) return;
  newVersion = !!s?.ratedAt && s.release !== RELEASE;
  state = s?.release === RELEASE ? s : { release: RELEASE, closes: 0 };
  // after the browser's own download prompt, not on top of it
  setTimeout(show, 2000);
}

function rate(n: number): void {
  stars = n;
  // a change of mind within a few seconds replaces the rating instead of adding one
  clearTimeout(trackTimer);
  trackTimer = window.setTimeout(flush, 5000);
  state = { release: RELEASE, ratedAt: Date.now(), closes: 0 };
  store(state);
  $('rateStars').querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i < n));
  $('rateForm').hidden = false;
  renderRating();
}

export function wireRating(): void {
  const panel = $('rate');
  const form = $('rateForm') as HTMLFormElement;
  const message = $('rateMessage') as HTMLTextAreaElement;
  const send = $('rateSend') as HTMLButtonElement;

  $('rateStars').replaceChildren(
    ...[1, 2, 3, 4, 5].map((n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'star';
      b.textContent = '★';
      b.addEventListener('click', () => rate(n));
      return b;
    }),
  );
  $('rateClose').addEventListener('click', dismiss);
  panel.addEventListener('keydown', (e) => e.key === 'Escape' && dismiss());
  // once someone is using it, it stays until they close it
  addEventListener('pagehide', flush);
  for (const type of ['pointerdown', 'focusin']) panel.addEventListener(type, () => clearTimeout(hideTimer));

  // more to say: carry the text over to the full form
  $('rateMore').addEventListener('click', () => {
    $('feedbackOpen').click();
    ($('feedbackMessage') as HTMLTextAreaElement).value = message.value;
    hide();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    send.disabled = true;
    flush();
    $('rateError').hidden = true;
    try {
      await sendFeedback({ kind: 'rating', stars, message: message.value });
      form.reset();
      form.hidden = true;
      $('rateThanks').hidden = false;
      send.textContent = t('feedback.send');
      hideTimer = window.setTimeout(hide, 3000);
    } catch {
      // the text stays, so nothing is lost
      $('rateError').hidden = false;
      send.textContent = t('feedback.retry');
    }
    send.disabled = false;
  });
}

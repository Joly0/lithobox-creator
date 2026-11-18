// Takes a message from the page's feedback form and files it as an issue in a private repository.
// It exists so the GitHub token stays off the page. Node standard library only, no build step.
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type RequestListener, type ServerResponse } from 'node:http';

const MAX_IMAGES = 3;
const MAX_IMAGE = 1024 * 1024;
// the text, plus each screenshot as base64 (4 characters for every 3 bytes)
const MAX_BODY = 16 * 1024 + MAX_IMAGES * Math.ceil((MAX_IMAGE * 4) / 3);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface Config {
  token: string;
  repo: string;
  origin: string;
  clientIpHeader: string;
  perIpPerHour: number;
  perDay: number;
  fetch?: typeof fetch;
  now?: () => number;
}

export interface Feedback {
  kind: 'bug' | 'idea' | 'rating';
  /** 1 to 5 for a rating, 0 otherwise */
  stars: number;
  message: string;
  email: string;
  version: string;
  shape: string;
  browser: string;
  language: string;
  screenshots: Screenshot[];
}

/** A checked picture, still in base64, which is what GitHub takes. */
export interface Screenshot {
  ext: string;
  data: string;
}

/** One line of at most `max` characters; anything that is not text becomes empty. */
function oneLine(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** The checked form, or null when it is not one the page would send. */
export function parseFeedback(input: unknown): Feedback | null {
  if (typeof input !== 'object' || input === null) return null;
  const f = input as Record<string, unknown>;
  if (f.kind !== 'bug' && f.kind !== 'idea' && f.kind !== 'rating') return null;
  const stars = f.kind === 'rating' ? f.stars : 0;
  if (f.kind === 'rating' && !(Number.isInteger(stars) && (stars as number) >= 1 && (stars as number) <= 5)) return null;
  const message = typeof f.message === 'string' ? f.message.trim() : '';
  if (message.length < 5 || message.length > 5000) return null;
  const email = typeof f.email === 'string' ? f.email.trim() : '';
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return null;
  const screenshots = parseScreenshots(f.screenshots);
  if (!screenshots) return null;
  return {
    kind: f.kind,
    stars: stars as number,
    message,
    email,
    version: oneLine(f.version, 100),
    shape: oneLine(f.shape, 100),
    browser: oneLine(f.browser, 300),
    language: oneLine(f.language, 20),
    screenshots,
  };
}

/** A code block no text can break out of, so visitors' words can't ping people or load images. */
function fenced(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text}\n${fence}`;
}

const TITLES = { bug: 'Bug', idea: 'Idea', rating: 'Rating ' };
const LABELS = { bug: 'bug', idea: 'enhancement', rating: 'rating' };

// the first bytes each format starts with, so only real pictures reach the repository
const IMAGE_TYPES = new Map<unknown, { ext: string; magic: (b: Buffer) => boolean }>([
  ['image/png', { ext: 'png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) }],
  ['image/jpeg', { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff }],
  ['image/webp', { ext: 'webp', magic: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' }],
]);

/** The checked screenshots, or null when one is not a small PNG, JPEG or WebP. */
function parseScreenshots(input: unknown): Screenshot[] | null {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > MAX_IMAGES) return null;
  const shots: Screenshot[] = [];
  for (const item of input) {
    const type = IMAGE_TYPES.get((item as { type?: unknown } | null)?.type);
    const data = (item as { data?: unknown } | null)?.data;
    if (!type || typeof data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length > MAX_IMAGE || !type.magic(bytes)) return null;
    shots.push({ ext: type.ext, data: bytes.toString('base64') });
  }
  return shots;
}

/** `shots` are the screenshots' pages in the repository, shown in the issue and linked. */
export function issueFor(f: Feedback, shots: string[] = []): { title: string; body: string; labels: string[] } {
  const details = [
    `Reply to: ${f.email || '(no email given)'}`,
    `Version: ${f.version}`,
    `Shape: ${f.shape}`,
    `Browser: ${f.browser}`,
    `Language: ${f.language}`,
  ].join('\n');
  return {
    title: `${TITLES[f.kind]}${'★'.repeat(f.stars)}${'☆'.repeat(f.stars ? 5 - f.stars : 0)}: ${oneLine(f.message, 70)}`,
    body: [fenced(f.message), ...shots.map((url, i) => `[![Screenshot ${i + 1}](${url}?raw=true)](${url})`), fenced(details)].join('\n\n'),
    labels: [LABELS[f.kind]],
  };
}

/** Counts in memory, so a restart forgets them. The day cap also bounds how many IPs are remembered. */
export function createLimiter(perIpPerHour: number, perDay: number, now: () => number) {
  const perIp = new Map<string, number>();
  let hourStart = now();
  let dayStart = now();
  let today = 0;
  return (ip: string): boolean => {
    const time = now();
    if (time - hourStart >= HOUR) {
      perIp.clear();
      hourStart = time;
    }
    if (time - dayStart >= DAY) {
      today = 0;
      dayStart = time;
    }
    const count = perIp.get(ip) ?? 0;
    if (count >= perIpPerHour || today >= perDay) return false;
    perIp.set(ip, count + 1);
    today++;
    return true;
  };
}

async function readBody(req: IncomingMessage): Promise<string | null> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY) return null;
  }
  return body;
}

export function createHandler(config: Config): RequestListener {
  const send = config.fetch ?? fetch;
  const now = config.now ?? Date.now;
  const allowed = createLimiter(config.perIpPerHour, config.perDay, now);
  const reply = (res: ServerResponse, status: number) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(`{"ok":${status < 300}}`);
  };
  return async (req, res) => {
    res.setHeader('Vary', 'Origin');
    if (req.headers.origin !== config.origin) return reply(res, 403);
    res.setHeader('Access-Control-Allow-Origin', config.origin);
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.writeHead(204);
      return void res.end();
    }
    if (req.method !== 'POST') return reply(res, 405);

    const body = await readBody(req).catch(() => null);
    if (body === null) {
      // the rest of the body is never read, so this connection can't carry another request
      res.setHeader('Connection', 'close');
      return reply(res, 413);
    }
    let input: unknown;
    try {
      input = JSON.parse(body);
    } catch {
      return reply(res, 400);
    }
    // only a bot fills the hidden field; telling it "ok" keeps it from trying something else
    if ((input as { website?: unknown } | null)?.website) return reply(res, 200);
    const feedback = parseFeedback(input);
    if (!feedback) return reply(res, 400);

    // shortcut: a caller reaching this server without the proxy can fake the header, so the day cap is the real limit
    const ip = String(req.headers[config.clientIpHeader] ?? 'unknown');
    if (!allowed(ip)) {
      console.warn('feedback: rate limit reached');
      return reply(res, 429);
    }

    // logs carry status codes only: what visitors write stays out of them
    const github = (method: string, path: string, body: unknown) =>
      send(`https://api.github.com/repos/${config.repo}/${path}`, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'lithobox-feedback',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    const refused = (status: number) => {
      console.error(`feedback: GitHub answered ${status}`);
      reply(res, 502);
    };
    try {
      // the screenshots go into the repository first, so the issue can show them
      const shots: string[] = [];
      for (const shot of feedback.screenshots) {
        const name = `${new Date(now()).toISOString().slice(0, 10)}-${randomUUID()}.${shot.ext}`;
        const put = await github('PUT', `contents/feedback-images/${name}`, { message: 'Add a feedback screenshot', content: shot.data });
        if (!put.ok) return refused(put.status);
        shots.push(((await put.json()) as { content: { html_url: string } }).content.html_url);
      }
      const issue = await github('POST', 'issues', issueFor(feedback, shots));
      if (!issue.ok) return refused(issue.status);
    } catch {
      console.error('feedback: GitHub could not be reached');
      return reply(res, 502);
    }
    reply(res, 201);
  };
}

if (process.argv[1] === import.meta.filename) {
  const { GITHUB_TOKEN, FEEDBACK_REPO, ALLOWED_ORIGIN, CLIENT_IP_HEADER, PER_IP_PER_HOUR, PER_DAY, PORT } = process.env;
  if (!GITHUB_TOKEN || !FEEDBACK_REPO) throw new Error('GITHUB_TOKEN and FEEDBACK_REPO are required');
  const server = createServer(
    createHandler({
      token: GITHUB_TOKEN,
      repo: FEEDBACK_REPO,
      origin: ALLOWED_ORIGIN ?? 'https://lithobox.app',
      clientIpHeader: (CLIENT_IP_HEADER ?? 'cf-connecting-ip').toLowerCase(),
      perIpPerHour: Number(PER_IP_PER_HOUR ?? 5),
      perDay: Number(PER_DAY ?? 50),
    }),
  );
  // long enough for three screenshots over a slow phone connection
  server.requestTimeout = 60_000;
  server.listen(Number(PORT ?? 8080), () => console.log('feedback: listening'));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}

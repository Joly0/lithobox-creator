// Takes a message from the page's feedback form and files it as an issue in a private repository.
// It exists so the GitHub token stays off the page. Node standard library only, no build step.
import { createServer, type IncomingMessage, type RequestListener, type ServerResponse } from 'node:http';

const MAX_BODY = 16 * 1024;
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
  kind: 'bug' | 'idea';
  message: string;
  email: string;
  version: string;
  shape: string;
  browser: string;
  language: string;
}

/** One line of at most `max` characters; anything that is not text becomes empty. */
function oneLine(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** The checked form, or null when it is not one the page would send. */
export function parseFeedback(input: unknown): Feedback | null {
  if (typeof input !== 'object' || input === null) return null;
  const f = input as Record<string, unknown>;
  if (f.kind !== 'bug' && f.kind !== 'idea') return null;
  const message = typeof f.message === 'string' ? f.message.trim() : '';
  if (message.length < 5 || message.length > 5000) return null;
  const email = typeof f.email === 'string' ? f.email.trim() : '';
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return null;
  return {
    kind: f.kind,
    message,
    email,
    version: oneLine(f.version, 100),
    shape: oneLine(f.shape, 100),
    browser: oneLine(f.browser, 300),
    language: oneLine(f.language, 20),
  };
}

/** A code block no text can break out of, so visitors' words can't ping people or load images. */
function fenced(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text}\n${fence}`;
}

export function issueFor(f: Feedback): { title: string; body: string; labels: string[] } {
  const details = [
    `Reply to: ${f.email || '(no email given)'}`,
    `Version: ${f.version}`,
    `Shape: ${f.shape}`,
    `Browser: ${f.browser}`,
    `Language: ${f.language}`,
  ].join('\n');
  return {
    title: `${f.kind === 'bug' ? 'Bug' : 'Idea'}: ${oneLine(f.message, 70)}`,
    body: `${fenced(f.message)}\n\n${fenced(details)}`,
    labels: [f.kind === 'bug' ? 'bug' : 'enhancement'],
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
  const allowed = createLimiter(config.perIpPerHour, config.perDay, config.now ?? Date.now);
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
    if (body === null) return reply(res, 413);
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
    try {
      const github = await send(`https://api.github.com/repos/${config.repo}/issues`, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'lithobox-feedback',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify(issueFor(feedback)),
        signal: AbortSignal.timeout(10_000),
      });
      if (!github.ok) {
        console.error(`feedback: GitHub answered ${github.status}`);
        return reply(res, 502);
      }
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
  server.requestTimeout = 15_000;
  server.listen(Number(PORT ?? 8080), () => console.log('feedback: listening'));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createHandler, createLimiter, issueFor, parseFeedback } from '../server/feedback/server';

const ORIGIN = 'https://lithobox.app';
const form = { kind: 'bug', message: 'The lid does not fit.', email: '', version: 'v', shape: 'box', browser: 'b', language: 'en' };

describe('feedback form checks', () => {
  it('accepts the form and rejects what the page would not send', () => {
    expect(parseFeedback(form)?.kind).toBe('bug');
    for (const bad of [null, 'text', { ...form, kind: 'other' }, { ...form, message: 'hi' }, { ...form, message: 'x'.repeat(5001) }, { ...form, email: 'nope' }]) {
      expect(parseFeedback(bad)).toBeNull();
    }
  });

  it('keeps a message from breaking out of its code block', () => {
    const { body } = issueFor(parseFeedback({ ...form, message: 'look ```\n@someone ![x](http://a.example/y)' })!);
    expect(body.startsWith('````text\n')).toBe(true);
    expect(body).toContain('\n````\n');
  });

  it('squeezes the title onto one short line', () => {
    const { title, labels } = issueFor(parseFeedback({ ...form, kind: 'idea', message: `first\nsecond ${'y'.repeat(100)}` })!);
    expect(title.startsWith('Idea: first second')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(76);
    expect(labels).toEqual(['enhancement']);
  });
});

describe('rate limit', () => {
  it('limits each address per hour and everyone per day, then resets', () => {
    let time = 0;
    const allowed = createLimiter(2, 3, () => time);
    expect([allowed('a'), allowed('a'), allowed('a')]).toEqual([true, true, false]);
    expect([allowed('b'), allowed('c')]).toEqual([true, false]);
    time = 3_600_000;
    expect(allowed('a')).toBe(false); // the day cap still holds
    time = 86_400_000;
    expect(allowed('a')).toBe(true);
  });
});

describe('feedback endpoint', () => {
  let server: Server;
  afterEach(() => server.close());

  async function start(github: () => Promise<Response>) {
    const calls: { url: string; init: RequestInit }[] = [];
    server = createServer(
      createHandler({
        token: 'secret',
        repo: 'me/inbox',
        origin: ORIGIN,
        clientIpHeader: 'x-real-ip',
        perIpPerHour: 2,
        perDay: 10,
        fetch: ((url: string, init: RequestInit) => {
          calls.push({ url, init });
          return github();
        }) as typeof fetch,
      }),
    );
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    const post = (body: unknown, origin = ORIGIN) =>
      fetch(url, { method: 'POST', headers: { Origin: origin, 'X-Real-IP': '1.2.3.4' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    return { calls, url, post };
  }

  it('files a good message with the token', async () => {
    const { calls, post } = await start(async () => new Response('{}', { status: 201 }));
    const res = await post(form);
    expect(res.status).toBe(201);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(calls[0].url).toBe('https://api.github.com/repos/me/inbox/issues');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
  });

  it('answers the browser check before a post', async () => {
    const { url } = await start(async () => new Response());
    const res = await fetch(url, { method: 'OPTIONS', headers: { Origin: ORIGIN } });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-headers')).toBe('Content-Type');
  });

  it('files nothing for other sites, bad bodies, bots or too much', async () => {
    const { calls, post } = await start(async () => new Response('{}', { status: 201 }));
    expect((await post(form, 'https://evil.example')).status).toBe(403);
    expect((await post('not json')).status).toBe(400);
    expect((await post('null')).status).toBe(400);
    expect((await post({ ...form, message: 'hi' })).status).toBe(400);
    expect((await post({ ...form, padding: 'x'.repeat(20_000) })).status).toBe(413);
    expect((await post({ ...form, website: 'http://spam.example' })).status).toBe(200);
    expect(calls).toHaveLength(0);
    expect((await post(form)).status).toBe(201);
    expect((await post(form)).status).toBe(201);
    expect((await post(form)).status).toBe(429);
    expect(calls).toHaveLength(2);
  });

  it('reports a failure so the page keeps the text', async () => {
    const refused = await start(async () => new Response('{}', { status: 401 }));
    expect((await refused.post(form)).status).toBe(502);
    server.close();
    const down = await start(async () => {
      throw new Error('offline');
    });
    expect((await down.post(form)).status).toBe(502);
  });
});

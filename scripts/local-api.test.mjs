import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer as createViteServer } from 'vite';
import { localApiPlugin, MAX_BODY_BYTES } from './local-api.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const active = [];

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function harness(root, { mode = 'development', remoteAddress, useProjectConfig = false } = {}) {
  const vite = await createViteServer({
    root, envDir: root, configFile: useProjectConfig ? join(root, 'vite.config.js') : false, mode, logLevel: 'silent',
    plugins: useProjectConfig ? [] : [localApiPlugin()], server: { middlewareMode: true }, appType: 'custom',
  });
  const server = createHttpServer((req, res) => {
    if (remoteAddress) Object.defineProperty(req.socket, 'remoteAddress', { value: remoteAddress });
    vite.middlewares(req, res, () => { res.statusCode = 404; res.end('UI fallback'); });
  });
  active.push(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await vite.close();
  });
  return { port: await listen(server), vite };
}

function request(port, path, { method = 'GET', headers = {}, body, chunks } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method, headers }, res => {
      const received = [];
      res.on('data', chunk => received.push(chunk));
      res.on('end', () => {
        const bytes = Buffer.concat(received);
        resolve({ status: res.statusCode, headers: res.headers, bytes, json: () => JSON.parse(bytes.toString()) });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    for (const chunk of chunks ?? []) req.write(chunk);
    req.end(body);
  });
}

let fixtureRoot;
let local;
beforeAll(async () => {
  fixtureRoot = await realpath(await mkdtemp(join(tmpdir(), 'helix-local-api-')));
  await mkdir(join(fixtureRoot, 'api'));
  await writeFile(join(fixtureRoot, 'vercel.json'), await readFile(join(projectRoot, 'vercel.json')));
  await writeFile(join(fixtureRoot, '.env.local'), 'HELIX_LOCAL_API_TEST_SECRET=server-only-sentinel\n');
  await writeFile(join(fixtureRoot, 'client.js'), 'export const env = import.meta.env;');
  // Real TypeScript modules loaded by Vite, rather than a mocked module loader.
  await writeFile(join(fixtureRoot, 'api/contact.ts'), `
    import type { IncomingMessage } from 'node:http';
    export default function handler(req: IncomingMessage & { body: unknown; query: unknown; cookies: unknown }, res: any) {
      if (req.headers['x-test-response'] === 'error') throw new Error('server-only-sentinel');
      if (req.headers['x-test-response'] === 'redirect') {
        res.setHeader('Set-Cookie', ['one=1; HttpOnly', 'two=2; HttpOnly']);
        return res.redirect(302, '/login');
      }
      if (req.headers['x-test-response'] === 'binary') {
        res.setHeader('Content-Type', 'application/pdf');
        return res.status(201).send(Buffer.alloc(5 * 1024 * 1024, 255));
      }
      return res.status(202).json({ method: req.method, headers: req.headers, body: req.body,
        query: req.query, cookies: req.cookies, serverEnvLoaded: process.env.HELIX_LOCAL_API_TEST_SECRET === 'server-only-sentinel' });
    }
  `);
  await writeFile(join(fixtureRoot, 'api/website.ts'), "export { default } from './contact.ts';");
  await writeFile(join(fixtureRoot, 'api/member-login.ts'), "export { default } from './contact.ts';");
  local = await harness(fixtureRoot);
});

afterAll(async () => {
  for (const close of active.reverse()) await close();
  vi.unstubAllEnvs();
  await rm(fixtureRoot, { recursive: true, force: true });
});

describe('local API HTTP adapter', () => {
  it('rewrites project management through the shared authenticated member entrypoint', async () => {
    const response = await request(local.port, '/api/projects?__module=untrusted');
    expect(response.status).toBe(202);
    expect(response.json().query).toEqual({ __module: 'projects' });
  });
  it('loads a TypeScript handler with method, headers, JSON body, repeated query and cookies', async () => {
    const response = await request(local.port, '/api/contact?tag=a&tag=b&name=Alex+Example', {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Example': 'present', Cookie: 'one=1; two=a=b' },
      body: JSON.stringify({ message: 'hello' }),
    });
    expect(response.status).toBe(202);
    expect(response.json()).toMatchObject({ method: 'POST', body: { message: 'hello' },
      headers: { 'x-example': 'present' }, query: { tag: ['a', 'b'], name: 'Alex Example' },
      cookies: { one: '1', two: 'a=b' }, serverEnvLoaded: true });
    const client = await local.vite.transformRequest('/client.js');
    expect(client.code).not.toContain('server-only-sentinel');
    expect(client.code).not.toContain('HELIX_LOCAL_API_TEST_SECRET');
    await local.vite.restart();
    expect((await request(local.port, '/api/contact')).json().serverEnvLoaded).toBe(true);
  });

  it('parses forms and rejects malformed JSON before invoking a handler', async () => {
    const form = await request(local.port, '/api/contact', { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'name=Alex+Example&tag=a&tag=b' });
    expect(form.json().body).toEqual({ name: 'Alex Example', tag: ['a', 'b'] });
    const invalid = await request(local.port, '/api/contact', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    expect(invalid.status).toBe(400);
  });

  it('accepts a 500 KiB CV in a base64 JSON envelope', async () => {
    const cv = Buffer.alloc(500 * 1024, 'a').toString('base64');
    const response = await request(local.port, '/api/website', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit', cv }) });
    expect(response.status).toBe(202);
    expect(response.json().body.cv).toBe(cv);
  });

  it('accepts the 2 MiB boundary and rejects oversized declared and chunked bodies', async () => {
    const boundary = await request(local.port, '/api/contact', { method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'Content-Length': MAX_BODY_BYTES }, body: Buffer.alloc(MAX_BODY_BYTES, 'a') });
    expect(boundary.status).toBe(202);
    const declared = await request(local.port, '/api/contact', { method: 'POST',
      headers: { 'Content-Length': MAX_BODY_BYTES + 1 } });
    expect(declared.status).toBe(413);
    const chunked = await request(local.port, '/api/contact', { method: 'POST',
      chunks: [Buffer.alloc(MAX_BODY_BYTES / 2), Buffer.alloc(MAX_BODY_BYTES / 2), Buffer.from('overflow')] });
    expect(chunked.status).toBe(413);
  });

  it('returns JSON 404s for unknown endpoints, source files and helper paths', async () => {
    for (const path of ['/api/missing', '/api/contact/extra', '/api/contact.ts', '/api/_lib/email', '/api']) {
      const response = await request(local.port, path);
      expect(response.status).toBe(404);
      expect(response.json()).toEqual({ error: 'Unknown API endpoint.' });
    }
    expect((await request(local.port, '/profile')).bytes.toString()).toBe('UI fallback');
  });

  it('supports binary responses, redirects and multiple cookies without exposing failures', async () => {
    const binary = await request(local.port, '/api/contact', { headers: { 'x-test-response': 'binary' } });
    expect(binary.status).toBe(201);
    expect(binary.headers['content-type']).toBe('application/pdf');
    expect(binary.bytes.length).toBe(5 * 1024 * 1024);
    expect(binary.bytes[0]).toBe(255);
    expect(binary.bytes[binary.bytes.length - 1]).toBe(255);
    const redirect = await request(local.port, '/api/contact', { headers: { 'x-test-response': 'redirect' } });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.location).toBe('/login');
    expect(redirect.headers['set-cookie']).toEqual(['one=1; HttpOnly', 'two=2; HttpOnly']);
    const failed = await request(local.port, '/api/contact', { headers: { 'x-test-response': 'error' } });
    expect(failed.status).toBe(500);
    expect(failed.json()).toEqual({ error: 'Local API request failed.' });
  });

  it('denies nonlocal Host headers and cross-site browser origins', async () => {
    for (const headers of [
      { Host: 'internal.helixnmbu.no' }, { Host: 'localhost.evil.invalid' }, { Host: '127.0.0.1@evil.invalid' },
      { Origin: 'https://evil.invalid' }, { 'Sec-Fetch-Site': 'cross-site' },
    ]) expect((await request(local.port, '/api/contact', { headers })).status).toBe(403);
  });

  it('denies a remote peer even with localhost and spoofed forwarded headers', async () => {
    const remote = await harness(fixtureRoot, { remoteAddress: '192.0.2.10' });
    const response = await request(remote.port, '/api/contact', { headers: {
      Host: 'localhost', 'X-Forwarded-For': '127.0.0.1', 'X-Forwarded-Host': 'localhost',
    } });
    expect(response.status).toBe(403);
  });

  it('disables real APIs in member-local mode without loading credentials', async () => {
    const member = await harness(projectRoot, { mode: 'member-local' });
    const loader = vi.spyOn(member.vite, 'ssrLoadModule');
    expect((await request(member.port, '/api/partner')).status).toBe(503);
    expect((await request(member.port, '/api/auth/get-session')).status).toBe(503);
    expect((await request(member.port, '/api/projects')).status).toBe(503);
    expect(loader).not.toHaveBeenCalled();
  });
});

describe('repository API integration', () => {
  it('executes existing protected handlers and Gmail rewrites without authenticating a user', async () => {
    const repo = await harness(projectRoot, { useProjectConfig: true });
    expect((await request(repo.port, '/@vite/client')).status).toBe(200);
    for (const path of ['/api/partner?action=session', '/api/website?action=session', '/api/member-cv', '/api/gmail-status?action=connect', '/api/projects']) {
      const response = await request(repo.port, path);
      expect(response.status, path).toBe(401);
      expect(response.json()).toEqual({ error: 'Log in to continue.' });
    }
    expect((await request(repo.port, '/api/contact')).status).toBe(405);
    expect((await request(repo.port, '/api/apply-confirmation')).status).toBe(405);
  });

  it('passes rewritten auth paths and raw request bytes through the existing auth handler', async () => {
    const upstream = createHttpServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString('base64') }));
    });
    const upstreamPort = await listen(upstream);
    vi.stubEnv('NEON_AUTH_BASE_URL', `http://127.0.0.1:${upstreamPort}/neon/auth`);
    const repo = await harness(projectRoot);
    try {
      const raw = Buffer.from('{ "email": "alex@example.invalid", "spacing": true }\n');
      const response = await request(repo.port, '/api/auth/sign-in/social?foo=one&foo=two', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${repo.port}` }, body: raw });
      expect(response.status).toBe(200);
      expect(response.json()).toEqual({ method: 'POST', url: '/neon/auth/sign-in/social?foo=one&foo=two', body: raw.toString('base64') });
      const unsafe = await request(repo.port, '/api/auth/%2F%2Fevil.invalid');
      expect(unsafe.status).toBe(400);
    } finally {
      upstream.closeAllConnections();
      await new Promise(resolve => upstream.close(resolve));
    }
  });
});

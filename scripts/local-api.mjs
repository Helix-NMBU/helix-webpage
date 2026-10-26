import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';

export const MAX_BODY_BYTES = 2 * 1024 * 1024;

// Never resolve a request path into a filesystem path. Only these entry points
// may execute; helpers, tests and arbitrary TypeScript files are not routes.
const handlers = new Map([
  ['/api/auth', '/api/auth.ts'],
  ['/api/gmail', '/api/gmail.ts'],
  ['/api/member-login', '/api/member-login.ts'],
  ['/api/member-cv', '/api/member-cv.ts'],
  ['/api/member-cv-file', '/api/member-cv-file.ts'],
  ['/api/partner', '/api/partner.ts'],
  ['/api/website', '/api/website.ts'],
  ['/api/contact', '/api/contact.ts'],
  ['/api/apply-confirmation', '/api/apply-confirmation.ts'],
  ['/api/reject', '/api/reject.ts'],
]);

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function loopback(address = '') {
  if (address === '::1') return true;
  const ipv4 = address.startsWith('::ffff:') ? address.slice(7) : address;
  return isIP(ipv4) === 4 && ipv4.startsWith('127.');
}

function localHost(host) {
  // Exact names, with an optional port; reject userinfo, suffixes and URL paths.
  return typeof host === 'string' && /^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/i.test(host);
}

function localRequest(req) {
  if (!loopback(req.socket.remoteAddress) || !localHost(req.headers.host)) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  if (req.headers.origin !== undefined) {
    try {
      const origin = new URL(req.headers.origin);
      if (!['http:', 'https:'].includes(origin.protocol) || origin.host.toLowerCase() !== req.headers.host.toLowerCase()) return false;
    } catch { return false; }
  }
  return true;
}

function queryObject(parameters) {
  const query = Object.create(null);
  for (const key of new Set(parameters.keys())) {
    const values = parameters.getAll(key);
    query[key] = values.length === 1 ? values[0] : values;
  }
  return query;
}

function resolveRoute(rawUrl, rewrites) {
  const question = rawUrl.indexOf('?');
  const pathname = question === -1 ? rawUrl : rawUrl.slice(0, question);
  const parameters = new URLSearchParams(question === -1 ? '' : rawUrl.slice(question + 1));
  for (const rewrite of rewrites) {
    const destination = new URL(rewrite.destination, 'http://localhost');
    if (!handlers.has(destination.pathname)) continue;
    if (rewrite.source === '/api/auth/:path*' && destination.pathname === '/api/auth' && pathname.startsWith('/api/auth/')) {
      parameters.set('__path', pathname.slice('/api/auth/'.length));
      // Auth validates raw encoded slashes. Keep real separators unencoded,
      // as Vercel does, while retaining encoding of percent signs and queries.
      const search = parameters.toString().replaceAll('%2F', '/');
      return { module: handlers.get('/api/auth'), url: `/api/auth?${search}`, query: queryObject(parameters) };
    }
    if (rewrite.source === pathname && handlers.has(pathname) === false) {
      for (const [key, value] of destination.searchParams) parameters.set(key, value);
      const search = parameters.toString();
      return { module: handlers.get(destination.pathname), url: `${destination.pathname}${search ? `?${search}` : ''}`, query: queryObject(parameters) };
    }
  }
  const module = handlers.get(pathname);
  return module ? { module, url: rawUrl, query: queryObject(parameters) } : null;
}

async function readBody(req) {
  const length = Number(req.headers['content-length']);
  if (length > MAX_BODY_BYTES) throw new RequestError(413, 'Request body is too large.');
  const chunks = [];
  let size = 0;
  // Keep the socket available to send a 413 even when a chunked body overflows.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new RequestError(413, 'Request body is too large.');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

function parsedBody(bytes, contentType = '') {
  if (!bytes.length) return undefined;
  const type = contentType.split(';')[0].trim().toLowerCase();
  if (type === 'application/json' || type.endsWith('+json')) {
    try { return JSON.parse(bytes.toString('utf8')); }
    catch { throw new RequestError(400, 'Invalid JSON request.'); }
  }
  if (type === 'application/x-www-form-urlencoded') return queryObject(new URLSearchParams(bytes.toString('utf8')));
  if (type.startsWith('text/')) return bytes.toString('utf8');
  return bytes;
}

function adaptResponse(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (value) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(value));
    return res;
  };
  res.send = (value) => {
    if (value !== null && typeof value === 'object' && !Buffer.isBuffer(value) && !(value instanceof Uint8Array)) return res.json(value);
    res.end(value);
    return res;
  };
  res.redirect = (statusOrUrl, location) => {
    res.statusCode = typeof statusOrUrl === 'number' ? statusOrUrl : 307;
    res.setHeader('Location', typeof statusOrUrl === 'string' ? statusOrUrl : location);
    res.end();
    return res;
  };
  return res;
}

export function localApiPlugin() {
  const injected = new Map();
  return {
    name: 'helix-local-api',
    apply: 'serve',
    async configureServer(server) {
      const memberLocal = server.config.mode === 'member-local';
      let environmentLoaded = false;
      const loadServerEnv = () => {
        if (environmentLoaded) return;
        // Load before the first API import, after any old server has closed.
        // Vite creates a replacement before closing the old server on restart.
        // Only VITE_ variables use the client env mechanism; credentials stay
        // in process.env and this serve-only hook never runs during builds.
        const env = loadEnv(server.config.mode, server.config.envDir, '');
        for (const [key, value] of Object.entries(env)) {
          if (!key.startsWith('VITE_') && process.env[key] === undefined) {
            process.env[key] = value;
            injected.set(key, value);
          }
        }
        environmentLoaded = true;
      };
      const { rewrites = [] } = JSON.parse(await readFile(resolve(server.config.root, 'vercel.json'), 'utf8'));
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0] ?? '';
        if (path !== '/api' && !path.startsWith('/api/')) return next();
        adaptResponse(res);
        res.setHeader('Cache-Control', 'no-store');
        if (!localRequest(req)) return res.status(403).json({ error: 'Local API access only.' });
        if (memberLocal) return res.status(503).json({ error: 'Real APIs are disabled in member-local mode.' });
        const route = resolveRoute(req.url, rewrites);
        if (!route) return res.status(404).json({ error: 'Unknown API endpoint.' });
        try {
          loadServerEnv();
          const raw = await readBody(req);
          const module = await server.ssrLoadModule(route.module);
          req.url = route.url;
          req.query = route.query;
          req.cookies = Object.create(null);
          for (const pair of (req.headers.cookie ?? '').split(';')) {
            const separator = pair.indexOf('=');
            if (separator > 0) req.cookies[pair.slice(0, separator).trim()] = pair.slice(separator + 1).trim();
          }
          if (module.config?.api?.bodyParser === false) {
            req[Symbol.asyncIterator] = async function* () { if (raw.length) yield raw; };
          } else {
            req.body = parsedBody(raw, req.headers['content-type']);
          }
          await module.default(req, res);
        } catch (error) {
          // Never send exception text or Vite stack traces (which can contain
          // connection strings and upstream URLs) to a browser.
          if (res.headersSent) { res.end(); return; }
          if (error instanceof RequestError && error.status === 413) {
            res.setHeader('Connection', 'close');
            req.resume();
          }
          res.status(error instanceof RequestError ? error.status : 500).json({
            error: error instanceof RequestError ? error.message : 'Local API request failed.',
          });
        }
      });
    },
    buildEnd() {
      for (const [key, value] of injected) {
        if (process.env[key] === value) delete process.env[key];
      }
      injected.clear();
    },
  };
}

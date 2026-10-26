import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const required = [
  'DATABASE_URL', 'NEON_AUTH_BASE_URL', 'VITE_NEON_AUTH_URL', 'GOOGLE_CLIENT_ID',
  'NEON_S3_ENDPOINT', 'NEON_S3_REGION', 'NEON_STORAGE_BUCKET',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'SPONSOR_PORTAL_ORIGIN',
];
const serverOnly = [
  'DATABASE_URL', 'NEON_AUTH_BASE_URL', 'GOOGLE_CLIENT_ID', 'NEON_S3_ENDPOINT',
  'NEON_S3_REGION', 'NEON_STORAGE_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY',
];
const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);

function url(value, base) {
  try { return new URL(value, base); } catch { return null; }
}

function secure(value, allowLoopback) {
  return value && !value.username && !value.password
    && (value.protocol === 'https:' || (allowLoopback && value.protocol === 'http:' && loopback.has(value.hostname)));
}

/** Inspect supplied values only. Never reads files, connects to services or prints values. */
export function checkSponsorConfig(env, { allowLoopback = false } = {}) {
  const errors = [];
  for (const key of required) {
    if (typeof env[key] !== 'string' || !env[key].trim()) errors.push(`${key} is required.`);
  }
  for (const key of serverOnly) {
    if (env[`VITE_${key}`]?.trim()) errors.push(`VITE_${key} must not expose server configuration to the browser.`);
  }

  const origin = url(env.SPONSOR_PORTAL_ORIGIN);
  if (env.SPONSOR_PORTAL_ORIGIN?.trim() && (!secure(origin, allowLoopback)
    || (!allowLoopback && loopback.has(origin.hostname))
    || origin.pathname !== '/' || origin.search || origin.hash
    || env.SPONSOR_PORTAL_ORIGIN !== origin.origin)) {
    errors.push('SPONSOR_PORTAL_ORIGIN must be an exact HTTPS origin without a path, query, fragment or trailing slash. Loopback requires --allow-loopback.');
  }
  const auth = url(env.NEON_AUTH_BASE_URL);
  if (env.NEON_AUTH_BASE_URL?.trim() && (!secure(auth, false)
    || auth.pathname !== '/neondb/auth' || auth.search || auth.hash)) {
    errors.push('NEON_AUTH_BASE_URL must be the HTTPS managed Auth endpoint ending in /neondb/auth.');
  }
  if (origin && auth && origin.origin === auth.origin) {
    errors.push('NEON_AUTH_BASE_URL must be the managed Auth service, not the application origin.');
  }
  if (env.VITE_NEON_AUTH_URL?.trim()) {
    const browserAuth = origin ? url(env.VITE_NEON_AUTH_URL, origin) : null;
    if (env.VITE_NEON_AUTH_URL !== '/api/auth' && (!browserAuth || !origin
      || browserAuth.origin !== origin.origin || browserAuth.pathname !== '/api/auth'
      || browserAuth.search || browserAuth.hash || browserAuth.username || browserAuth.password)) {
      errors.push('VITE_NEON_AUTH_URL must use the same-origin /api/auth proxy.');
    }
  }
  if (env.DATABASE_URL?.trim()) {
    const db = url(env.DATABASE_URL);
    if (!db || !['postgres:', 'postgresql:'].includes(db.protocol) || !db.hostname || db.pathname.length < 2) {
      errors.push('DATABASE_URL must be a Postgres connection URL with a database name.');
    }
  }
  if (env.NEON_S3_ENDPOINT?.trim()) {
    const storage = url(env.NEON_S3_ENDPOINT);
    if (!secure(storage, false) || storage.pathname !== '/' || storage.search || storage.hash) {
      errors.push('NEON_S3_ENDPOINT must be an HTTPS storage origin without credentials or a path.');
    }
  }
  if (env.NEON_STORAGE_BUCKET?.trim() && !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.NEON_STORAGE_BUCKET)) {
    errors.push('NEON_STORAGE_BUCKET must be a valid S3 bucket name.');
  }
  if (env.AUTH_PROXY_ALLOWED_HOSTS?.trim()) {
    const hosts = env.AUTH_PROXY_ALLOWED_HOSTS.split(',').map((host) => host.trim());
    if (hosts.some((host) => !host || host.includes('*') || !/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(host))) {
      errors.push('AUTH_PROXY_ALLOWED_HOSTS must contain exact comma-separated hosts, without schemes, paths or wildcards.');
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    checks: required.length,
    // A valid shape is not evidence that a service accepts these settings.
    remaining: [
      'Verify the selected sponsor origin in hosting, TLS and Neon trusted origins.',
      'Verify managed Magic Link is enabled with a five-minute expiry and its own new-user registration setting disabled; preserve Google onboarding.',
      'Provision only approved invited identities and verify application contact/staff activation.',
      'Verify production SMTP delivery with an explicitly authorized recipient.',
      'Verify the bucket is private and the configured credentials have the intended access.',
      'Apply and verify reviewed migrations only through the authorized rollout.',
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--allow-loopback')) {
    console.error('Usage: node scripts/check-sponsor-config.mjs [--allow-loopback]');
    process.exitCode = 2;
  } else {
    const result = checkSponsorConfig(process.env, { allowLoopback: args.includes('--allow-loopback') });
    console.log(`Sponsor configuration shape: ${result.ok ? 'PASS' : 'FAIL'}. No external service was contacted.`);
    for (const error of result.errors) console.error(error);
    console.log('Live checks still required:');
    for (const item of result.remaining) console.log(`- ${item}`);
    process.exitCode = result.ok ? 0 : 1;
  }
}

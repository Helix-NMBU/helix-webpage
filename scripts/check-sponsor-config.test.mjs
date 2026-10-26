import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkSponsorConfig } from './check-sponsor-config.mjs';

const valid = () => ({
  DATABASE_URL: 'postgresql://fixture:never-print-this-password@db.example.invalid/helix?sslmode=verify-full',
  NEON_AUTH_BASE_URL: 'https://auth.example.invalid/neondb/auth',
  VITE_NEON_AUTH_URL: '/api/auth',
  GOOGLE_CLIENT_ID: 'fixture-google-client',
  NEON_S3_ENDPOINT: 'https://storage.example.invalid',
  NEON_S3_REGION: 'eu-central-1',
  NEON_STORAGE_BUCKET: 'member-cvs',
  AWS_ACCESS_KEY_ID: 'never-print-this-key',
  AWS_SECRET_ACCESS_KEY: 'never-print-this-secret',
  SPONSOR_PORTAL_ORIGIN: 'https://sponsors.example.invalid',
});

describe('non-mutating sponsor configuration preflight', () => {
  it('accepts complete shapes while retaining explicit live acceptance requirements', () => {
    const env = Object.freeze(valid());
    const result = checkSponsorConfig(env);
    expect(result.ok).toBe(true);
    expect(result.remaining.join(' ')).toMatch(/SMTP/);
    expect(result.remaining.join(' ')).toMatch(/private/);
    expect(result.remaining.join(' ')).toMatch(/trusted origins/);
  });

  it('reports missing keys without values', () => {
    expect(checkSponsorConfig({}).errors).toContain('SPONSOR_PORTAL_ORIGIN is required.');
    expect(checkSponsorConfig({}).ok).toBe(false);
  });

  it.each([
    'http://sponsors.example.invalid', 'https://sponsors.example.invalid/',
    'https://sponsors.example.invalid/sponsor', 'https://sponsors.example.invalid?next=/admin',
    'https://user:secret@sponsors.example.invalid', 'https://sponsors.example.invalid#secret',
    'https://localhost',
  ])('rejects unsafe or ambiguous sponsor origin %s', (origin) => {
    expect(checkSponsorConfig({ ...valid(), SPONSOR_PORTAL_ORIGIN: origin }).ok).toBe(false);
  });

  it('permits HTTP only for explicit loopback development', () => {
    const env = { ...valid(), SPONSOR_PORTAL_ORIGIN: 'http://127.0.0.1:5191' };
    expect(checkSponsorConfig(env).ok).toBe(false);
    expect(checkSponsorConfig(env, { allowLoopback: true }).ok).toBe(true);
    expect(checkSponsorConfig({ ...env, SPONSOR_PORTAL_ORIGIN: 'http://192.168.0.2:5191' }, { allowLoopback: true }).ok).toBe(false);
  });

  it.each([
    'https://auth.example.invalid', 'http://auth.example.invalid/neondb/auth',
    'https://auth.example.invalid/neondb/auth?token=secret',
    'https://sponsors.example.invalid/neondb/auth',
  ])('rejects an incorrect auth endpoint %s', (auth) => {
    expect(checkSponsorConfig({ ...valid(), NEON_AUTH_BASE_URL: auth }).ok).toBe(false);
  });

  it.each(['https://auth.example.invalid/neondb/auth', '//evil.example.invalid/api/auth', '/api/auth?x=1', 'https://[invalid'])('requires the first-party auth proxy %s', (browserAuth) => {
    expect(checkSponsorConfig({ ...valid(), VITE_NEON_AUTH_URL: browserAuth }).ok).toBe(false);
  });

  it('accepts an exact absolute first-party proxy URL', () => {
    expect(checkSponsorConfig({ ...valid(), VITE_NEON_AUTH_URL: 'https://sponsors.example.invalid/api/auth' }).ok).toBe(true);
  });

  it('rejects browser-exposed server configuration', () => {
    const result = checkSponsorConfig({ ...valid(), VITE_AWS_SECRET_ACCESS_KEY: 'do-not-print' });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).not.toContain('do-not-print');
  });

  it('rejects storage paths, invalid database URLs and proxy wildcards', () => {
    const result = checkSponsorConfig({ ...valid(), DATABASE_URL: 'https://db.example.invalid/helix', NEON_S3_ENDPOINT: 'https://storage.example.invalid/bucket', AUTH_PROXY_ALLOWED_HOSTS: '*.example.invalid' });
    expect(result.errors).toHaveLength(3);
  });

  it('does not print credentials through the executable', () => {
    const script = fileURLToPath(new URL('./check-sponsor-config.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8', env: valid() });
    expect(result.status).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain('No external service was contacted');
    expect(output).not.toMatch(/never-print|fixture-google-client|example\.invalid/);
  });
});

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

// Node loads the operator's untracked .env files through the npm command.
// No credentials, SQL parameters, or database error details are printed.
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--apply')) throw new Error('Usage: npm run neon:setup -- [--apply]');
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env.local before running Neon setup.');
let url;
try { url = new URL(process.env.DATABASE_URL); }
catch { throw new Error("DATABASE_URL must be a valid Postgres connection URL."); }
if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("DATABASE_URL must use the Postgres protocol.");
if (url.hostname.includes('-pooler.')) throw new Error('Use a direct Neon database connection for schema setup.');
if (['require', 'prefer', 'verify-ca'].includes(url.searchParams.get('sslmode'))) url.searchParams.set('sslmode', 'verify-full');
const client = new pg.Client({ connectionString: url.href });
try {
  await client.connect();
  const files = (await readdir(new URL('../db/migrations/', import.meta.url))).filter(file => /^\d{3}_[a-z0-9_]+\.sql$/.test(file)).sort();
  const apply = args.includes('--apply');
  const ledger = await client.query("select to_regclass('helix_migrations.applied') as name");
  const previous = ledger.rows[0]?.name ? (await client.query('select filename, checksum from helix_migrations.applied')).rows : [];
  const checksums = new Map(previous.map(row => [row.filename, row.checksum]));
  const pending = [];
  for (const filename of files) {
    const sql = await readFile(new URL(`../db/migrations/${filename}`, import.meta.url), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    if (checksums.has(filename)) {
      if (checksums.get(filename) !== checksum) throw new Error(`Applied migration changed: ${filename}. Add a new migration instead.`);
      continue;
    }
    pending.push({ filename, checksum, sql });
  }
  if (!apply) {
    console.log(pending.length ? `Pending migrations:\n${pending.map(item => item.filename).join('\n')}\nRun npm run neon:setup -- --apply to apply them.` : 'Neon schema is up to date.');
  } else {
    await client.query("select pg_advisory_lock(hashtext('helix-schema-setup'))");
    await client.query('create schema if not exists helix_migrations; revoke all on schema helix_migrations from public; create table if not exists helix_migrations.applied (filename text primary key, checksum text not null, applied_at timestamptz not null default now()); revoke all on helix_migrations.applied from public');
    for (const item of pending) {
      await client.query('begin');
      try {
        const existing = await client.query('select checksum from helix_migrations.applied where filename = $1', [item.filename]);
        if (existing.rows.length) {
          if (existing.rows[0].checksum !== item.checksum) throw new Error('Concurrent migration checksum mismatch');
        } else {
          const sql = item.sql.replace(/^begin;\s*$/im, '').replace(/^commit;\s*$/im, '');
          await client.query(sql);
          await client.query('insert into helix_migrations.applied (filename, checksum) values ($1,$2)', [item.filename, item.checksum]);
        }
        await client.query('commit');
        console.log(`Ready: ${item.filename}`);
      } catch { await client.query('rollback'); throw new Error(`Setup failed at ${item.filename}. That migration was rolled back; database error details were withheld.`); }
    }
    console.log('Neon schema setup complete. No application accounts or legacy records were imported.');
  }
} catch (error) {
  const safe = error instanceof Error && /^(Applied migration changed:|Setup failed at|Concurrent migration)/.test(error.message);
  console.error(safe ? error.message : 'Neon setup could not complete. Check the connection, Neon Auth provisioning, and database-owner permissions.');
  process.exitCode = 1;
} finally { await client.end(); }

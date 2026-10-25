import { readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

// Decimal MB, matching Vercel's storage units. Keep ample room below the team quota.
const limit = 10_000_000;
const root = resolve(process.argv[2] ?? 'dist');
const files = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink in build output: ${path}`);
    if (entry.isDirectory()) await visit(path);
    else if (entry.isFile()) files.push({ path: relative(root, path), bytes: (await stat(path)).size });
  }
}

await visit(root);
if (files.length === 0) throw new Error('Build output is empty.');
const total = files.reduce((sum, file) => sum + file.bytes, 0);
console.log(`Static deployment output: ${(total / 1e6).toFixed(2)} MB / ${limit / 1e6} MB`);

if (total > limit) {
  console.error('Deployment size budget exceeded. Compress images or remove unused output files.');
  for (const file of files.sort((a, b) => b.bytes - a.bytes).slice(0, 10)) {
    console.error(`${(file.bytes / 1e6).toFixed(2)} MB  ${file.path}`);
  }
  process.exitCode = 1;
}

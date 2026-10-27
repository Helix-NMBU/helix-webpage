import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const sizeScript = fileURLToPath(new URL('./check-deployment-size.mjs', import.meta.url));
const functionScript = fileURLToPath(new URL('./check-vercel-functions.mjs', import.meta.url));
const ignoreScript = fileURLToPath(new URL('./ignore-docs-build.sh', import.meta.url));

test('Hobby function budget leaves one slot below the 12-function cap', () => {
  const root = mkdtempSync(join(tmpdir(), 'helix-function-limit-test-'));
  try {
    mkdirSync(join(root, 'api'));
    for (let index = 0; index < 11; index++) writeFileSync(join(root, 'api', `route-${index}.ts`), 'export {};');
    const withinBudget = spawnSync(process.execPath, [functionScript], { cwd: root, encoding: 'utf8' });
    assert.equal(withinBudget.status, 0, withinBudget.stderr);
    assert.match(withinBudget.stdout, /11 \/ 11 \(Hobby cap: 12\)/);
    writeFileSync(join(root, 'api', 'route-11.ts'), 'export {};');
    const overBudget = spawnSync(process.execPath, [functionScript], { cwd: root, encoding: 'utf8' });
    assert.equal(overBudget.status, 1);
    assert.match(overBudget.stderr, /below the 12-function cap/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('size gate counts nested files and rejects output above 10 MB', () => {
  const root = mkdtempSync(join(tmpdir(), 'helix-size-test-'));
  try {
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'index.html'), 'hello');
    assert.equal(spawnSync(process.execPath, [sizeScript, root]).status, 0);
    writeFileSync(join(root, 'assets', 'large.bin'), Buffer.alloc(10_000_000));
    const result = spawnSync(process.execPath, [sizeScript, root], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /assets[/\\]large\.bin/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('docs skip compares with deployed SHA and builds when code is still pending', () => {
  const root = mkdtempSync(join(tmpdir(), 'helix-ignore-test-'));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const ignore = (sha) => spawnSync('sh', [ignoreScript], {
    cwd: root, env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: sha },
  }).status;
  const commit = () => { git('add', '.'); git('commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
  try {
    git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
    writeFileSync(join(root, 'app.js'), 'export default 1;');
    const deployed = commit();
    mkdirSync(join(root, 'docs')); writeFileSync(join(root, 'docs', 'note.md'), 'Docs only'); commit();
    assert.equal(ignore(deployed), 0);
    assert.equal(ignore(''), 1);
    assert.equal(ignore('missing-ref'), 1);
    writeFileSync(join(root, 'app.js'), 'export default 2;'); commit();
    writeFileSync(join(root, 'README.md'), 'More docs'); commit();
    assert.equal(ignore(deployed), 1);
    assert.equal(ignore(git('rev-parse', 'HEAD^')), 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

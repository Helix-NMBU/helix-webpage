import { access, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const hobbyCap = 12;
const target = hobbyCap - 1;
const apiRoot = resolve('api');
const generatedFunctionsRoot = resolve('.vercel/output/functions');
const supportedExtensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.py', '.go', '.rs']);
const routes = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(path);
      continue;
    }

    const extension = entry.name.slice(entry.name.lastIndexOf('.'));
    if (!entry.isFile() || !supportedExtensions.has(extension) || entry.name.endsWith('.d.ts') || /\.test\.[^.]+$/.test(entry.name)) continue;
    routes.push(relative(apiRoot, path));
  }
}

await visit(apiRoot);
routes.sort();
console.log(`Vercel Serverless Functions: ${routes.length} / ${target} (Hobby cap: ${hobbyCap})`);
for (const route of routes) console.log(`  api/${route}`);

if (routes.length > target) {
  console.error(`Function target exceeded by ${routes.length - target}. Keep Hobby deployments below the ${hobbyCap}-function cap.`);
  process.exitCode = 1;
}

try {
  await access(generatedFunctionsRoot);
  const generatedFunctions = [];
  async function visitGenerated(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory() && entry.name.endsWith('.func')) generatedFunctions.push(relative(generatedFunctionsRoot, path));
      else if (entry.isDirectory()) await visitGenerated(path);
    }
  }
  await visitGenerated(generatedFunctionsRoot);
  generatedFunctions.sort();
  console.log(`Generated Vercel functions: ${generatedFunctions.length} / ${target} (Hobby cap: ${hobbyCap})`);
  if (generatedFunctions.length !== routes.length) {
    console.error(`Generated function count (${generatedFunctions.length}) does not match API route count (${routes.length}).`);
    process.exitCode = 1;
  }
  if (generatedFunctions.length > target) {
    console.error(`Generated function target exceeded by ${generatedFunctions.length - target}. Keep Hobby deployments below the ${hobbyCap}-function cap.`);
    process.exitCode = 1;
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

// Vercel instruments require(), which cannot load sanitize-html's ESM-only
// parser dependency. Bundle the current sanitizer and parser together so the
// deployed function loads one server module without crossing module formats.
await build({
  entryPoints: [require.resolve('sanitize-html')],
  outfile: fileURLToPath(new URL('../api/_lib/generated/email-sanitizer.mjs', import.meta.url)),
  bundle: true,
  platform: 'node',
  format: 'esm',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  target: 'node22',
});

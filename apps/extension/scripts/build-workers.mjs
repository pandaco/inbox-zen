import * as esbuild from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  platform: 'browser',
  target: 'chrome120',
  format: 'iife',
  tsconfig: resolve(root, 'tsconfig.workers.json'),
  sourcemap: watch,
  logLevel: 'info',
};

const entries = [
  {
    entryPoints: [resolve(root, 'src/content-script/content-script.ts')],
    outfile: resolve(root, 'dist/content-script.js'),
  },
  {
    entryPoints: [resolve(root, 'src/background/background.ts')],
    outfile: resolve(root, 'dist/background.js'),
  },
];

if (watch) {
  const contexts = await Promise.all(entries.map((e) => esbuild.context({ ...common, ...e })));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log('[build-workers] watching background.ts + content-script.ts…');
} else {
  await Promise.all(entries.map((e) => esbuild.build({ ...common, ...e })));
}

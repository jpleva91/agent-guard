import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

// Bundle @red-codes/* packages inline (they're not published individually).
// Externalize only true npm runtime deps that users install.
const externalDeps = [
  ...Object.keys(pkg.dependencies || {}).filter((d: string) => !d.startsWith('@red-codes/')),
  ...Object.keys(pkg.optionalDependencies || {}),
];

const shared: esbuild.BuildOptions = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  sourcemap: true,
  outdir: 'dist',
  external: externalDeps,
};

// CLI bundle — single self-contained entry point
await esbuild.build({
  ...shared,
  entryPoints: ['src/bin.ts'],
});

console.log('CLI build complete.');

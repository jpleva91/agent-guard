import * as esbuild from 'esbuild';
import { cpSync, readFileSync } from 'fs';

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
  define: {
    'AGENTGUARD_VERSION': JSON.stringify(pkg.version),
  },
};

// CLI bundle — single self-contained entry point
await esbuild.build({
  ...shared,
  entryPoints: ['src/bin.ts'],
});

// Copy hooks/ and templates/ into dist so they ship with the npm package
// (npm rejects path traversals like ../../hooks/ in the files array)
cpSync('../../hooks', 'dist/hooks', { recursive: true });
cpSync('../../templates', 'dist/templates', { recursive: true });

console.log('CLI build complete.');

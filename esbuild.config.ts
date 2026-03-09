import * as esbuild from 'esbuild';

const shared: esbuild.BuildOptions = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  sourcemap: true,
  outdir: 'dist',
  packages: 'external',
};

// CLI bundle — single self-contained entry point
await esbuild.build({
  ...shared,
  entryPoints: ['src/cli/bin.ts'],
  outdir: 'dist/cli',
});

console.log('Build complete.');

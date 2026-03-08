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

// CLI entry point
await esbuild.build({
  ...shared,
  entryPoints: ['src/cli/index.ts'],
  outdir: 'dist/cli',
});

// Game entry point (browser target)
await esbuild.build({
  ...shared,
  entryPoints: ['src/game/engine.ts', 'src/game/renderer.ts', 'src/game/loop.ts'],
  platform: 'browser',
  target: 'es2022',
  outdir: 'dist/game',
  packages: undefined,
});

console.log('Build complete.');

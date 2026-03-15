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

await esbuild.build({
  ...shared,
  entryPoints: ['src/server.ts'],
  banner: { js: '#!/usr/bin/env node' },
});

console.log('MCP server build complete.');

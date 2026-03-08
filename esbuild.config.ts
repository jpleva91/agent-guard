// TODO(roadmap): TS Migration — Update build pipeline to produce TS-based bundles as primary output

import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  entryPoints: ['src/cli/index.ts', 'src/cli/bin.ts'],
  outdir: 'dist/cli',
});

// Game bundle — browser entry point (all modules inlined)
// Domain, agentguard, and ecosystem modules are emitted
// individually by tsc (unbundled) for test/import consumption.
await esbuild.build({
  ...shared,
  entryPoints: [
    'src/game/engine.ts',
    'src/game/renderer.ts',
    'src/game/loop.ts',
    'src/game/game.ts',
  ],
  platform: 'browser',
  target: 'es2022',
  outdir: 'dist/game',
  packages: undefined,
});

// Copy sprites to dist/game/sprites/ for browser serving
const srcSprites = join(__dirname, 'src', 'game', 'sprites');
const destSprites = join(__dirname, 'dist', 'game', 'sprites');
if (existsSync(srcSprites)) {
  mkdirSync(destSprites, { recursive: true });
  cpSync(srcSprites, destSprites, { recursive: true, filter: (src) => !src.endsWith('.js') && !src.endsWith('.md') });
}

console.log('Build complete.');

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

// CLI entry points
await esbuild.build({
  ...shared,
  entryPoints: ['src/cli/index.ts', 'src/cli/bin.ts'],
  outdir: 'dist/cli',
});

// Domain entry points
await esbuild.build({
  ...shared,
  entryPoints: [
    'src/domain/events.ts',
    'src/domain/event-store.ts',
    'src/domain/hash.ts',
    'src/domain/shapes.ts',
    'src/domain/contracts.ts',
    'src/domain/battle.ts',
    'src/domain/encounters.ts',
    'src/domain/evolution.ts',
    'src/domain/combo.ts',
    'src/domain/run-session.ts',
    'src/domain/run-history.ts',
    'src/domain/actions.ts',
    'src/domain/policy.ts',
    'src/domain/invariants.ts',
    'src/domain/reference-monitor.ts',
    'src/domain/source-registry.ts',
  ],
  outdir: 'dist/domain',
});

// AgentGuard entry points
await esbuild.build({
  ...shared,
  entryPoints: [
    'src/agentguard/core/aab.ts',
    'src/agentguard/core/engine.ts',
    'src/agentguard/monitor.ts',
    'src/agentguard/policies/evaluator.ts',
    'src/agentguard/policies/loader.ts',
    'src/agentguard/invariants/checker.ts',
    'src/agentguard/invariants/definitions.ts',
    'src/agentguard/evidence/pack.ts',
  ],
  outdir: 'dist/agentguard',
});

// Ecosystem entry points
await esbuild.build({
  ...shared,
  entryPoints: [
    'src/ecosystem/storage.ts',
    'src/ecosystem/bosses.ts',
    'src/ecosystem/bugdex-spec.ts',
    'src/ecosystem/sync-protocol.ts',
  ],
  outdir: 'dist/ecosystem',
});

// Game entry points (browser target)
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
const srcSprites = join(__dirname, 'game', 'sprites');
const destSprites = join(__dirname, 'dist', 'game', 'sprites');
if (existsSync(srcSprites)) {
  mkdirSync(destSprites, { recursive: true });
  cpSync(srcSprites, destSprites, { recursive: true, filter: (src) => !src.endsWith('.js') && !src.endsWith('.md') });
}

console.log('Build complete.');

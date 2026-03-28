// resolve-binary.ts — Shared binary resolution for all driver init commands.
// Determines the correct agentguard binary path based on how it's installed.
//
// Resolution order:
//   1. Dev repo:      apps/cli/dist/bin.js exists → "node apps/cli/dist/bin.js"
//   2. Local install: node_modules/.bin/agentguard exists → relative path
//   3. Local alias:   node_modules/.bin/aguard exists → relative path
//   4. Global:        fallback to bare "agentguard" (relies on PATH)

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveMainRepoRoot } from '@red-codes/core';

export interface ResolvedBinary {
  /** The command string to invoke agentguard (for writing into hook configs) */
  cli: string;
  /** True if running from the agentguard source repo */
  isLocal: boolean;
  /** How the binary was resolved */
  resolution: 'dev-repo' | 'node-modules' | 'node-modules-alias' | 'global';
}

const LOCAL_BIN = 'node apps/cli/dist/bin.js';

/**
 * Resolve the agentguard binary path for hook config generation.
 * All init commands (claude-init, copilot-init, goose-init, etc.) use this
 * so every driver gets the same, correct binary path.
 *
 * @param isGlobal - If true, skip local node_modules checks (for global installs)
 */
export function resolveBinary(isGlobal = false): ResolvedBinary {
  const mainRoot = resolveMainRepoRoot();

  // 1. Dev repo: apps/cli/src/bin.ts exists (works in worktrees too)
  const devMarker = join(mainRoot, 'apps', 'cli', 'src', 'bin.ts');
  if (existsSync(devMarker)) {
    return { cli: LOCAL_BIN, isLocal: true, resolution: 'dev-repo' };
  }

  // 2-3. Local npm install (skip if --global)
  if (!isGlobal) {
    const nmBin = join(mainRoot, 'node_modules', '.bin', 'agentguard');
    if (existsSync(nmBin)) {
      return { cli: './node_modules/.bin/agentguard', isLocal: false, resolution: 'node-modules' };
    }

    const nmBinAlias = join(mainRoot, 'node_modules', '.bin', 'aguard');
    if (existsSync(nmBinAlias)) {
      return {
        cli: './node_modules/.bin/aguard',
        isLocal: false,
        resolution: 'node-modules-alias',
      };
    }
  }

  // 4. Global fallback
  return { cli: 'agentguard', isLocal: false, resolution: 'global' };
}

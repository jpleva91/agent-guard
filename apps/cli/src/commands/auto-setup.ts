// agentguard auto-setup — detect AgentGuard in project and auto-configure Claude Code and Copilot CLI hooks

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { RESET, BOLD, DIM, FG } from '../colors.js';
import { claudeInit } from './claude-init.js';
import { copilotInit } from './copilot-init.js';
import gooseInit from './goose-init.js';
import { resolveMainRepoRoot } from '@red-codes/core';

const HOOK_MARKER = 'claude-hook';

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface HookEntry {
  hooks?: Array<{ type?: string; command?: string }>;
}

interface Settings {
  hooks?: {
    PreToolUse?: HookEntry[];
    PostToolUse?: HookEntry[];
    [key: string]: unknown;
  };
}

export interface AutoSetupResult {
  detected: boolean;
  hooksMissing: boolean;
  installed: boolean;
  source: string | null;
  skipped: string | null;
}

/** Check if agentguard is listed in package.json dependencies. */
export function detectAgentGuardDependency(cwd: string = process.cwd()): {
  found: boolean;
  source: string | null;
} {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) {
    return { found: false, source: null };
  }

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as PackageJson;
    const deps = pkg.dependencies ?? {};
    const devDeps = pkg.devDependencies ?? {};

    // Check for published package name or monorepo workspace name
    const candidates = ['@red-codes/agentguard', 'agentguard'];
    for (const name of candidates) {
      if (name in deps) return { found: true, source: `dependencies["${name}"]` };
      if (name in devDeps) return { found: true, source: `devDependencies["${name}"]` };
    }
  } catch {
    // Corrupt package.json — treat as not found
  }

  return { found: false, source: null };
}

/** Check if Claude Code environment exists (.claude/ directory). */
export function detectClaudeCodeEnvironment(cwd: string = process.cwd()): boolean {
  return existsSync(join(cwd, '.claude'));
}

/** Check if AgentGuard hooks are already installed in settings.json. */
export function detectExistingHooks(cwd: string = process.cwd()): boolean {
  const localPath = join(cwd, '.claude', 'settings.json');
  const globalPath = join(homedir(), '.claude', 'settings.json');

  for (const settingsPath of [localPath, globalPath]) {
    if (existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as Settings;
        const preToolUse = settings?.hooks?.PreToolUse ?? [];
        const hasHook = preToolUse.some((entry) => {
          const hooks = entry.hooks ?? [];
          return hooks.some((h) => h.command && h.command.includes(HOOK_MARKER));
        });
        if (hasHook) return true;
      } catch {
        // Corrupt settings — treat as no hooks
      }
    }
  }

  // Check Copilot CLI hooks
  const copilotHooksPath = join(cwd, '.github', 'hooks', 'hooks.json');
  if (existsSync(copilotHooksPath)) {
    try {
      const config = JSON.parse(readFileSync(copilotHooksPath, 'utf8')) as {
        hooks?: { preToolUse?: Array<{ bash?: string }> };
      };
      const preToolUse = config?.hooks?.preToolUse ?? [];
      const hasCopilotHook = preToolUse.some((entry) => entry.bash?.includes('copilot-hook'));
      if (hasCopilotHook) return true;
    } catch {
      /* ignore */
    }
  }

  return false;
}

/**
 * Auto-detect AgentGuard in the project and configure Claude Code and Copilot CLI hooks if needed.
 *
 * Detection checks (in order):
 * 1. Is agentguard listed in package.json dependencies?
 * 2. Does .claude/ directory exist (Claude Code environment)?
 * 3. Are hooks already installed (Claude Code settings.json or Copilot CLI hooks.json)?
 *
 * If agentguard is a dependency and hooks are missing, runs claude-init and copilot-init automatically.
 */
export async function autoSetup(args: string[] = []): Promise<AutoSetupResult> {
  const quiet = args.includes('--quiet') || args.includes('-q');
  const dryRun = args.includes('--dry-run');
  const cwd = resolveMainRepoRoot();

  const result: AutoSetupResult = {
    detected: false,
    hooksMissing: false,
    installed: false,
    source: null,
    skipped: null,
  };

  if (!quiet) {
    process.stderr.write('\n');
    process.stderr.write(`  ${BOLD}AgentGuard Auto-Setup${RESET}\n\n`);
  }

  // Step 1: Detect agentguard in package.json
  const dep = detectAgentGuardDependency(cwd);

  // Also check if we're in the agentguard dev repo (has apps/cli/src/bin.ts)
  const isDevRepo = existsSync(join(cwd, 'apps', 'cli', 'src', 'bin.ts'));

  if (!dep.found && !isDevRepo) {
    result.skipped = 'AgentGuard not found in package.json dependencies';
    if (!quiet) {
      process.stderr.write(
        `  ${FG.yellow}⊘${RESET}  AgentGuard not detected in ${FG.cyan}package.json${RESET}\n`
      );
      process.stderr.write(
        `  ${DIM}Install: npm install --save-dev @red-codes/agentguard${RESET}\n`
      );
      process.stderr.write(
        `  ${DIM}Or run: agentguard claude-init (to configure manually)${RESET}\n\n`
      );
    }
    return result;
  }

  result.detected = true;
  result.source = isDevRepo ? 'agentguard-dev-repo' : dep.source;

  if (!quiet) {
    const sourceLabel = isDevRepo ? 'dev repo' : dep.source;
    process.stderr.write(
      `  ${FG.green}✓${RESET}  AgentGuard detected ${DIM}(${sourceLabel})${RESET}\n`
    );
  }

  // Step 2: Check if hooks are already installed
  if (detectExistingHooks(cwd)) {
    result.hooksMissing = false;
    result.skipped = 'Hooks already installed';
    if (!quiet) {
      process.stderr.write(`  ${FG.green}✓${RESET}  Governance hooks already installed\n`);
      process.stderr.write(`\n  ${DIM}No action needed — governance is active.${RESET}\n\n`);
    }
    return result;
  }

  result.hooksMissing = true;

  // Step 3: Check Claude Code environment
  const hasClaudeDir = detectClaudeCodeEnvironment(cwd);
  if (!quiet) {
    if (hasClaudeDir) {
      process.stderr.write(
        `  ${FG.green}✓${RESET}  Claude Code environment detected ${DIM}(.claude/)${RESET}\n`
      );
    } else {
      process.stderr.write(`  ${DIM}ℹ${RESET}  .claude/ directory will be created\n`);
    }
    process.stderr.write(`  ${FG.yellow}!${RESET}  Hooks not configured — auto-installing...\n\n`);
  }

  // Resolve forwarded args before dry-run check so the message reflects actual flags
  const storeIdx = args.findIndex((a) => a === '--store');
  const storeBackend = storeIdx !== -1 && args[storeIdx + 1] ? args[storeIdx + 1] : 'sqlite';

  const dbPathIdx = args.findIndex((a) => a === '--db-path');
  const forwardArgs: string[] = ['--store', storeBackend];
  if (dbPathIdx !== -1 && args[dbPathIdx + 1]) {
    forwardArgs.push('--db-path', args[dbPathIdx + 1]);
  }

  // Step 4: Auto-install (delegate to claude-init)
  if (dryRun) {
    result.skipped = 'Dry run — skipped installation';
    if (!quiet) {
      process.stderr.write(
        `  ${DIM}[dry-run] Would run: agentguard claude-init --store ${storeBackend}${RESET}\n\n`
      );
    }
    return result;
  }

  await claudeInit(forwardArgs);
  // Also configure Copilot CLI hooks
  await copilotInit(forwardArgs);
  // Also configure Goose hooks (if Goose config dir exists or goose is installed)
  try {
    await gooseInit(forwardArgs);
  } catch {
    // Goose not installed — skip silently
  }
  result.installed = true;

  return result;
}

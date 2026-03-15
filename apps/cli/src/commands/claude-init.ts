// agentguard claude-init — set up Claude Code integration

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { RESET, BOLD, DIM, FG } from '../colors.js';

const HOOK_MARKER = 'claude-hook';
const BUILD_MARKER = 'apps/cli/dist/bin.js';

interface HookEntry {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string }>;
}

interface SessionStartHookEntry {
  hooks?: Array<{ type?: string; command?: string; timeout?: number; blocking?: boolean }>;
}

interface Settings {
  hooks?: {
    PreToolUse?: HookEntry[];
    PostToolUse?: HookEntry[];
    SessionStart?: SessionStartHookEntry[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export async function claudeInit(args: string[] = []): Promise<void> {
  const isGlobal = args.includes('--global') || args.includes('-g');
  const isRemove = args.includes('--remove') || args.includes('--uninstall');

  // Parse --store flag for storage backend (embedded into hook commands)
  const storeIdx = args.findIndex((a) => a === '--store');
  const storeBackend = storeIdx !== -1 ? args[storeIdx + 1] : undefined;
  const storeSuffix = storeBackend ? ` --store ${storeBackend}` : '';

  // Parse --db-path flag for SQLite database path (embedded into hook commands)
  const dbPathIdx = args.findIndex((a) => a === '--db-path');
  const dbPathValue = dbPathIdx !== -1 ? args[dbPathIdx + 1] : undefined;
  const dbPathSuffix = dbPathValue ? ` --db-path "${dbPathValue}"` : '';

  const settingsDir = isGlobal ? join(homedir(), '.claude') : join(process.cwd(), '.claude');
  const settingsPath = join(settingsDir, 'settings.json');
  const settingsLabel = isGlobal ? '~/.claude/settings.json' : '.claude/settings.json';

  process.stderr.write('\n');
  process.stderr.write(`  ${BOLD}AgentGuard Claude Code Integration${RESET}\n\n`);

  if (isRemove) {
    removeHook(settingsPath, settingsLabel);
    return;
  }

  if (!existsSync(settingsDir)) {
    mkdirSync(settingsDir, { recursive: true });
  }

  let settings: Settings = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as Settings;
    } catch {
      process.stderr.write(
        `  ${FG.yellow}Warning:${RESET} Could not parse ${settingsLabel}, creating fresh config.\n`
      );
      settings = {};
    }
  }

  if (hasAgentGuardHook(settings)) {
    process.stderr.write(
      `  ${FG.yellow}Already configured.${RESET} AgentGuard hook found in ${settingsLabel}.\n`
    );
    process.stderr.write(`  ${DIM}Use --remove to uninstall.${RESET}\n\n`);
    return;
  }

  if (!settings.hooks) settings.hooks = {};

  // PreToolUse — governance enforcement (routes all tool calls through the kernel)
  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
  settings.hooks.PreToolUse.push({
    hooks: [
      {
        type: 'command',
        command: `agentguard claude-hook pre${storeSuffix}${dbPathSuffix}`,
      },
    ],
  });

  // PostToolUse — error monitoring (Bash stderr reporting)
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
  settings.hooks.PostToolUse.push({
    matcher: 'Bash',
    hooks: [
      {
        type: 'command',
        command: `agentguard claude-hook post${storeSuffix}${dbPathSuffix}`,
      },
    ],
  });

  // SessionStart — ensure CLI is built, then show governance status
  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
  settings.hooks.SessionStart.push({
    hooks: [
      {
        type: 'command',
        command: `test -f apps/cli/dist/bin.js || npm run build`,
        timeout: 120000,
        blocking: true,
      },
      {
        type: 'command',
        command: `agentguard status`,
        timeout: 10000,
        blocking: false,
      },
    ],
  });

  // Stop — generate session viewer on session end
  if (!settings.hooks.Stop) (settings.hooks as Record<string, unknown>).Stop = [];
  ((settings.hooks as Record<string, unknown>).Stop as SessionStartHookEntry[]).push({
    hooks: [
      {
        type: 'command',
        command: `agentguard claude-hook stop${storeSuffix}${dbPathSuffix}`,
        timeout: 15000,
        blocking: false,
      },
    ],
  });

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

  process.stderr.write(
    `  ${FG.green}✓${RESET}  Hooks installed in ${FG.cyan}${settingsLabel}${RESET}\n`
  );
  process.stderr.write(`  ${DIM}SessionStart: auto-build + status check${RESET}\n`);
  process.stderr.write(`  ${DIM}PreToolUse:   governance enforcement (all tools)${RESET}\n`);
  process.stderr.write(`  ${DIM}PostToolUse:  error monitoring (Bash)${RESET}\n`);
  process.stderr.write(`  ${DIM}Stop:         session viewer generation${RESET}\n`);
  if (storeBackend) {
    process.stderr.write(`  ${DIM}Storage:     ${storeBackend}${RESET}\n`);
  }
  process.stderr.write('\n');
  // Set core.hooksPath so git uses the repo's hooks/ directory
  // (pre-commit auto-stages telemetry, post-commit tracks dev activity)
  try {
    const currentHooksPath = execSync('git config core.hooksPath', { encoding: 'utf8' }).trim();
    if (currentHooksPath !== 'hooks') {
      execSync('git config core.hooksPath hooks');
      process.stderr.write(
        `  ${FG.green}✓${RESET}  Git hooks path set to ${FG.cyan}hooks/${RESET}\n`
      );
    }
  } catch {
    // Not in a git repo, or no hooksPath set yet
    try {
      execSync('git config core.hooksPath hooks');
      process.stderr.write(
        `  ${FG.green}✓${RESET}  Git hooks path set to ${FG.cyan}hooks/${RESET}\n`
      );
    } catch {
      process.stderr.write(
        `  ${FG.yellow}Warning:${RESET} Could not set git hooks path. Run: git config core.hooksPath hooks\n`
      );
    }
  }

  // Ensure telemetry directories exist
  const dirs = ['.agentguard/events', '.agentguard/decisions', 'logs'];
  for (const dir of dirs) {
    const dirPath = join(process.cwd(), dir);
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
  }

  process.stderr.write(
    `  ${FG.green}${BOLD}Done!${RESET} AgentGuard governance will enforce policies on all Claude Code actions.\n`
  );
  process.stderr.write(`  ${DIM}Run "agentguard inspect --last" to view action history.${RESET}\n`);
  process.stderr.write(`  ${DIM}Use "agentguard claude-init --remove" to uninstall.${RESET}\n\n`);
}

function removeHook(settingsPath: string, settingsLabel: string): void {
  if (!existsSync(settingsPath)) {
    process.stderr.write(
      `  ${DIM}No settings file found at ${settingsLabel}. Nothing to remove.${RESET}\n\n`
    );
    return;
  }

  let settings: Settings;
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as Settings;
  } catch {
    process.stderr.write(`  ${FG.red}Error:${RESET} Could not parse ${settingsLabel}.\n\n`);
    return;
  }

  if (!hasAgentGuardHook(settings)) {
    process.stderr.write(
      `  ${DIM}No AgentGuard hook found in ${settingsLabel}. Nothing to remove.${RESET}\n\n`
    );
    return;
  }

  const filterByCommand = (entries: HookEntry[], marker: string) =>
    entries.filter((entry) => {
      const hooks = entry.hooks || [];
      return !hooks.some((h) => h.command && h.command.includes(marker));
    });

  const preToolUse = settings.hooks?.PreToolUse || [];
  settings.hooks!.PreToolUse = filterByCommand(preToolUse, HOOK_MARKER);
  if (settings.hooks!.PreToolUse!.length === 0) {
    delete settings.hooks!.PreToolUse;
  }

  const postToolUse = settings.hooks?.PostToolUse || [];
  settings.hooks!.PostToolUse = filterByCommand(postToolUse, HOOK_MARKER);
  if (settings.hooks!.PostToolUse!.length === 0) {
    delete settings.hooks!.PostToolUse;
  }

  // Remove SessionStart build hook
  const sessionStart = (settings.hooks?.SessionStart as HookEntry[]) || [];
  (settings.hooks as Record<string, unknown>).SessionStart = filterByCommand(
    sessionStart,
    BUILD_MARKER
  );
  if (
    ((settings.hooks as Record<string, unknown>).SessionStart as HookEntry[]).length === 0
  ) {
    delete (settings.hooks as Record<string, unknown>).SessionStart;
  }

  // Remove Stop hook
  const stopHooks = ((settings.hooks as Record<string, unknown>)?.Stop as HookEntry[]) || [];
  (settings.hooks as Record<string, unknown>).Stop = filterByCommand(stopHooks, HOOK_MARKER);
  if (((settings.hooks as Record<string, unknown>).Stop as HookEntry[]).length === 0) {
    delete (settings.hooks as Record<string, unknown>).Stop;
  }

  if (Object.keys(settings.hooks!).length === 0) {
    delete settings.hooks;
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

  process.stderr.write(
    `  ${FG.green}✓${RESET}  Hook removed from ${FG.cyan}${settingsLabel}${RESET}\n`
  );
  process.stderr.write(
    `  ${DIM}AgentGuard governance will no longer monitor in Claude Code.${RESET}\n\n`
  );
}

function hasAgentGuardHook(settings: Settings): boolean {
  const preToolUse = settings?.hooks?.PreToolUse || [];
  const postToolUse = settings?.hooks?.PostToolUse || [];
  const stopHooks = ((settings?.hooks as Record<string, unknown>)?.Stop || []) as HookEntry[];
  const allEntries = [...preToolUse, ...postToolUse, ...stopHooks] as HookEntry[];
  return allEntries.some((entry) => {
    const hooks = entry.hooks || [];
    return hooks.some((h) => h.command && h.command.includes(HOOK_MARKER));
  });
}

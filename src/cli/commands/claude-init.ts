// agentguard claude-init — set up Claude Code integration

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { RESET, BOLD, DIM, FG } from '../colors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HOOK_MARKER = 'claude-hook';

interface HookEntry {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string }>;
}

interface Settings {
  hooks?: {
    PreToolUse?: HookEntry[];
    PostToolUse?: HookEntry[];
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

  // Resolve hook script path — handles both tsc output (commands/) and esbuild bundle (cli/)
  let hookScript = resolve(__dirname, 'claude-hook.js');
  if (!existsSync(hookScript)) {
    hookScript = resolve(__dirname, 'commands', 'claude-hook.js');
  }

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
        command: `node ${hookScript} pre${storeSuffix}`,
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
        command: `node ${hookScript} post${storeSuffix}`,
      },
    ],
  });

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

  process.stderr.write(
    `  ${FG.green}✓${RESET}  Hooks installed in ${FG.cyan}${settingsLabel}${RESET}\n`
  );
  process.stderr.write(`  ${DIM}PreToolUse:  governance enforcement (all tools)${RESET}\n`);
  process.stderr.write(`  ${DIM}PostToolUse: error monitoring (Bash)${RESET}\n`);
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

  const filterAgentGuard = (entries: HookEntry[]) =>
    entries.filter((entry) => {
      const hooks = entry.hooks || [];
      return !hooks.some((h) => h.command && h.command.includes(HOOK_MARKER));
    });

  const preToolUse = settings.hooks?.PreToolUse || [];
  settings.hooks!.PreToolUse = filterAgentGuard(preToolUse);
  if (settings.hooks!.PreToolUse!.length === 0) {
    delete settings.hooks!.PreToolUse;
  }

  const postToolUse = settings.hooks?.PostToolUse || [];
  settings.hooks!.PostToolUse = filterAgentGuard(postToolUse);
  if (settings.hooks!.PostToolUse!.length === 0) {
    delete settings.hooks!.PostToolUse;
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
  const allEntries = [...preToolUse, ...postToolUse];
  return allEntries.some((entry) => {
    const hooks = entry.hooks || [];
    return hooks.some((h) => h.command && h.command.includes(HOOK_MARKER));
  });
}

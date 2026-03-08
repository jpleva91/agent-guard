// bugmon claude-init — set up Claude Code integration

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
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
    PostToolUse?: HookEntry[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export async function claudeInit(args: string[] = []): Promise<void> {
  const isGlobal = args.includes('--global') || args.includes('-g');
  const isRemove = args.includes('--remove') || args.includes('--uninstall');

  const hookScript = resolve(__dirname, 'claude-hook.js');

  const settingsDir = isGlobal ? join(homedir(), '.claude') : join(process.cwd(), '.claude');
  const settingsPath = join(settingsDir, 'settings.json');
  const settingsLabel = isGlobal ? '~/.claude/settings.json' : '.claude/settings.json';

  process.stderr.write('\n');
  process.stderr.write(`  ${BOLD}BugMon Claude Code Integration${RESET}\n\n`);

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
        `  ${FG.yellow}Warning:${RESET} Could not parse ${settingsLabel}, creating fresh config.\n`,
      );
      settings = {};
    }
  }

  if (hasBugMonHook(settings)) {
    process.stderr.write(
      `  ${FG.yellow}Already configured.${RESET} BugMon hook found in ${settingsLabel}.\n`,
    );
    process.stderr.write(`  ${DIM}Use --remove to uninstall.${RESET}\n\n`);
    return;
  }

  const hookCommand = `node ${hookScript}`;

  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];

  settings.hooks.PostToolUse.push({
    matcher: 'Bash',
    hooks: [
      {
        type: 'command',
        command: hookCommand,
      },
    ],
  });

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

  process.stderr.write(`  ${FG.green}✓${RESET}  Hook installed in ${FG.cyan}${settingsLabel}${RESET}\n`);
  process.stderr.write(`  ${DIM}Command: ${hookCommand}${RESET}\n\n`);
  process.stderr.write(
    `  ${FG.green}${BOLD}Done!${RESET} BugMon encounters will trigger on errors in Claude Code.\n`,
  );
  process.stderr.write(`  ${DIM}Run "bugmon dex" to view your collection.${RESET}\n`);
  process.stderr.write(`  ${DIM}Use "bugmon claude-init --remove" to uninstall.${RESET}\n\n`);
}

function removeHook(settingsPath: string, settingsLabel: string): void {
  if (!existsSync(settingsPath)) {
    process.stderr.write(
      `  ${DIM}No settings file found at ${settingsLabel}. Nothing to remove.${RESET}\n\n`,
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

  if (!hasBugMonHook(settings)) {
    process.stderr.write(
      `  ${DIM}No BugMon hook found in ${settingsLabel}. Nothing to remove.${RESET}\n\n`,
    );
    return;
  }

  const postToolUse = settings.hooks?.PostToolUse || [];
  settings.hooks!.PostToolUse = postToolUse.filter((entry) => {
    const hooks = entry.hooks || [];
    return !hooks.some((h) => h.command && h.command.includes(HOOK_MARKER));
  });

  if (settings.hooks!.PostToolUse!.length === 0) {
    delete settings.hooks!.PostToolUse;
  }
  if (Object.keys(settings.hooks!).length === 0) {
    delete settings.hooks;
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

  process.stderr.write(`  ${FG.green}✓${RESET}  Hook removed from ${FG.cyan}${settingsLabel}${RESET}\n`);
  process.stderr.write(
    `  ${DIM}BugMon encounters will no longer trigger in Claude Code.${RESET}\n\n`,
  );
}

function hasBugMonHook(settings: Settings): boolean {
  const postToolUse = settings?.hooks?.PostToolUse || [];
  return postToolUse.some((entry) => {
    const hooks = entry.hooks || [];
    return hooks.some((h) => h.command && h.command.includes(HOOK_MARKER));
  });
}

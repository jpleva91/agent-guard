// agentguard status — quick health check for AgentGuard governance runtime

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { RESET, BOLD, DIM, FG } from '../colors.js';
import { findDefaultPolicy } from '../policy-resolver.js';
import { detectRtk } from '@red-codes/core';

interface HookEntry {
  hooks?: Array<{ type?: string; command?: string }>;
}

interface Settings {
  hooks?: {
    PreToolUse?: HookEntry[];
    PostToolUse?: HookEntry[];
    SessionStart?: HookEntry[];
  };
}

const HOOK_MARKER = 'claude-hook';

export async function status(args: string[]): Promise<number> {
  const quiet = args.includes('--quiet') || args.includes('-q');

  const checks = {
    hooks: checkHooksInstalled(),
    policy: checkPolicyFound(),
    dirs: checkDirsExist(),
  };

  const allOk = checks.hooks.ok && checks.policy.ok && checks.dirs.ok;

  if (quiet) {
    // Machine-readable: exit 0 if all checks pass, 1 otherwise
    if (!allOk) {
      process.stderr.write('AgentGuard: not ready\n');
      return 1;
    }
    process.stderr.write('AgentGuard: ready\n');
    return 0;
  }

  process.stderr.write('\n');
  process.stderr.write(`  ${BOLD}AgentGuard Status${RESET}\n\n`);

  // Hooks
  printCheck(checks.hooks.ok, 'Claude Code hooks', checks.hooks.detail);

  // Policy
  printCheck(checks.policy.ok, 'Policy file', checks.policy.detail);

  // Directories
  printCheck(checks.dirs.ok, 'Event directories', checks.dirs.detail);

  // Token optimization (optional — does not affect exit code)
  const rtkCheck = checkRtkInstalled();
  const rtkIcon = rtkCheck.ok ? `${FG.cyan}⚡${RESET}` : `${DIM}○${RESET}`;
  process.stderr.write(`  ${rtkIcon}  Token optimization ${DIM}${rtkCheck.detail}${RESET}\n`);

  process.stderr.write('\n');

  if (allOk) {
    process.stderr.write(
      `  ${FG.green}${BOLD}AgentGuard is active.${RESET} ${DIM}All tool calls are governed.${RESET}\n`
    );
  } else {
    process.stderr.write(
      `  ${FG.yellow}${BOLD}AgentGuard is not fully configured.${RESET} ${DIM}Run "agentguard claude-init" to set up.${RESET}\n`
    );
  }

  process.stderr.write('\n');
  return allOk ? 0 : 1;
}

function printCheck(ok: boolean, label: string, detail: string): void {
  const icon = ok ? `${FG.green}✓${RESET}` : `${FG.red}✗${RESET}`;
  process.stderr.write(`  ${icon}  ${label} ${DIM}${detail}${RESET}\n`);
}

function checkHooksInstalled(): { ok: boolean; detail: string } {
  // Check local settings first, then global
  const localPath = join(process.cwd(), '.claude', 'settings.json');
  const globalPath = join(homedir(), '.claude', 'settings.json');

  for (const settingsPath of [localPath, globalPath]) {
    if (existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as Settings;
        const preToolUse = settings?.hooks?.PreToolUse || [];
        const hasHook = preToolUse.some((entry) => {
          const hooks = entry.hooks || [];
          return hooks.some((h) => h.command && h.command.includes(HOOK_MARKER));
        });
        if (hasHook) {
          const location = settingsPath === localPath ? 'local' : 'global';
          return { ok: true, detail: `(${location} .claude/settings.json)` };
        }
      } catch {
        // Continue to next path
      }
    }
  }

  return { ok: false, detail: '(not found — run "agentguard claude-init")' };
}

function checkPolicyFound(): { ok: boolean; detail: string } {
  const policyPath = findDefaultPolicy();
  if (policyPath) {
    return { ok: true, detail: `(${policyPath})` };
  }
  return { ok: false, detail: '(no agentguard.yaml found)' };
}

function checkRtkInstalled(): { ok: boolean; detail: string } {
  try {
    const rtk = detectRtk();
    if (rtk.available) {
      return { ok: true, detail: `rtk${rtk.version ? ` v${rtk.version}` : ''} (60-90% token savings)` };
    }
  } catch {
    // Detection failure is non-fatal
  }
  return { ok: false, detail: '(optional — brew install rtk)' };
}

function checkDirsExist(): { ok: boolean; detail: string } {
  const required = ['.agentguard/events', '.agentguard/decisions'];
  const missing = required.filter((dir) => !existsSync(join(process.cwd(), dir)));
  if (missing.length === 0) {
    return { ok: true, detail: '(.agentguard/)' };
  }
  return { ok: false, detail: `(missing: ${missing.join(', ')})` };
}

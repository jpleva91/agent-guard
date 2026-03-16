// agentguard claude-init — set up Claude Code integration

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { RESET, BOLD, DIM, FG } from '../colors.js';

const HOOK_MARKER = 'claude-hook';
const BUILD_MARKER = 'apps/cli/dist/bin.js';
const LOCAL_BIN = 'node apps/cli/dist/bin.js';

/** Detect if we're in the agentguard development repo (local dev) vs. globally installed. */
function resolveCliPrefix(): { cli: string; isLocal: boolean } {
  // If apps/cli/src/bin.ts exists, we're in the agentguard source repo
  const localMarker = join(process.cwd(), 'apps', 'cli', 'src', 'bin.ts');
  if (existsSync(localMarker)) {
    return { cli: LOCAL_BIN, isLocal: true };
  }
  return { cli: 'agentguard', isLocal: false };
}

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

  const { cli, isLocal } = resolveCliPrefix();

  // PreToolUse — governance enforcement (routes all tool calls through the kernel)
  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
  settings.hooks.PreToolUse.push({
    hooks: [
      {
        type: 'command',
        command: `${cli} claude-hook pre${storeSuffix}${dbPathSuffix}`,
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
        command: `${cli} claude-hook post${storeSuffix}${dbPathSuffix}`,
      },
    ],
  });

  // SessionStart — ensure CLI is built, then show governance status
  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
  const sessionStartHooks: Array<{
    type: string;
    command: string;
    timeout: number;
    blocking: boolean;
  }> = [];
  if (isLocal) {
    // In the agentguard dev repo, auto-build if dist is missing
    sessionStartHooks.push({
      type: 'command',
      command: `test -f apps/cli/dist/bin.js || pnpm build`,
      timeout: 120000,
      blocking: true,
    });
  }
  sessionStartHooks.push({
    type: 'command',
    command: `${cli} status`,
    timeout: 10000,
    blocking: false,
  });
  settings.hooks.SessionStart.push({ hooks: sessionStartHooks });

  // Notification — auto-open session viewer when agent pauses for human input
  if (!settings.hooks.Notification) (settings.hooks as Record<string, unknown>).Notification = [];
  ((settings.hooks as Record<string, unknown>).Notification as SessionStartHookEntry[]).push({
    hooks: [
      {
        type: 'command',
        command: `${cli} claude-hook notify${storeSuffix}${dbPathSuffix}`,
        timeout: 15000,
        blocking: false,
      },
    ],
  });

  // Stop — generate session viewer HTML on session end (no browser open — Notification handles that)
  if (!settings.hooks.Stop) (settings.hooks as Record<string, unknown>).Stop = [];
  ((settings.hooks as Record<string, unknown>).Stop as SessionStartHookEntry[]).push({
    hooks: [
      {
        type: 'command',
        command: `${cli} claude-hook stop${storeSuffix}${dbPathSuffix}`,
        timeout: 15000,
        blocking: false,
      },
    ],
  });

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

  process.stderr.write(
    `  ${FG.green}✓${RESET}  Hooks installed in ${FG.cyan}${settingsLabel}${RESET}\n`
  );
  process.stderr.write(`  ${DIM}SessionStart:  auto-build + status check${RESET}\n`);
  process.stderr.write(`  ${DIM}PreToolUse:    governance enforcement (all tools)${RESET}\n`);
  process.stderr.write(`  ${DIM}PostToolUse:   error monitoring (Bash)${RESET}\n`);
  process.stderr.write(`  ${DIM}Notification:  auto-open session viewer on agent pause${RESET}\n`);
  process.stderr.write(`  ${DIM}Stop:          session viewer HTML archival${RESET}\n`);
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

  // Auto-generate starter policy if none exists
  const policyGenerated = generateStarterPolicy();

  // Detect rtk for token optimization status
  let rtkStatus: { available: boolean; version?: string } = { available: false };
  try {
    const { detectRtk } = await import('@red-codes/core');
    rtkStatus = detectRtk();
  } catch {
    // rtk detection is non-fatal
  }

  if (rtkStatus.available) {
    process.stderr.write(
      `  ${FG.green}✓${RESET}  rtk detected${rtkStatus.version ? ` (v${rtkStatus.version})` : ''} — token optimization active\n`
    );
    process.stderr.write(
      `  ${DIM}   Run "rtk init -g" if rtk hooks are not yet configured.${RESET}\n`
    );
  }

  // Show what protections are active
  showProtectionSummary(policyGenerated, rtkStatus);
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
  if (((settings.hooks as Record<string, unknown>).SessionStart as HookEntry[]).length === 0) {
    delete (settings.hooks as Record<string, unknown>).SessionStart;
  }

  // Remove Notification hook
  const notifHooks =
    ((settings.hooks as Record<string, unknown>)?.Notification as HookEntry[]) || [];
  (settings.hooks as Record<string, unknown>).Notification = filterByCommand(
    notifHooks,
    HOOK_MARKER
  );
  if (((settings.hooks as Record<string, unknown>).Notification as HookEntry[]).length === 0) {
    delete (settings.hooks as Record<string, unknown>).Notification;
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

const STARTER_POLICY = `# AgentGuard policy — guardrails for AI coding agents.
# Customize this file to match your project's security requirements.
# Docs: https://github.com/AgentGuardHQ/agent-guard

id: default-policy
name: Default Safety Policy
description: Baseline guardrails for AI coding agents
severity: 4

rules:
  # Protected branches — prevent direct push to main/master
  - action: git.push
    effect: deny
    branches: [main, master]
    reason: Direct push to protected branch

  # No force push — prevent history rewriting
  - action: git.force-push
    effect: deny
    reason: Force push rewrites shared history

  # Secrets protection — block writes to sensitive files
  - action: file.write
    effect: deny
    target: .env
    reason: Secrets files must not be modified

  - action: file.write
    effect: deny
    target: ".npmrc"
    reason: npm credentials file must not be modified by agents

  - action: file.write
    effect: deny
    target: "id_rsa"
    reason: SSH private keys must not be modified

  - action: file.write
    effect: deny
    target: "id_ed25519"
    reason: SSH private keys must not be modified

  # Skill protection — prevent agent self-modification
  - action: file.write
    effect: deny
    target: ".claude/skills/"
    reason: Agent skill files are protected from modification

  - action: file.delete
    effect: deny
    target: ".claude/skills/"
    reason: Agent skill files are protected from deletion

  # Destructive command protection
  - action: shell.exec
    effect: deny
    target: rm -rf
    reason: Destructive shell commands blocked

  # Deployment protection
  - action: deploy.trigger
    effect: deny
    reason: Deploy actions require explicit authorization

  - action: infra.destroy
    effect: deny
    reason: Infrastructure destruction requires explicit authorization

  # Defaults
  - action: file.read
    effect: allow
    reason: Reading is always safe

  - action: file.write
    effect: allow
    reason: File writes allowed by default
`;

const POLICY_CANDIDATES = [
  'agentguard.yaml',
  'agentguard.yml',
  'agentguard.json',
  '.agentguard.yaml',
  '.agentguard.yml',
];

function generateStarterPolicy(): boolean {
  // Check if any policy file already exists
  for (const candidate of POLICY_CANDIDATES) {
    if (existsSync(join(process.cwd(), candidate))) {
      return false;
    }
  }

  const policyPath = join(process.cwd(), 'agentguard.yaml');
  writeFileSync(policyPath, STARTER_POLICY, 'utf8');
  process.stderr.write(
    `  ${FG.green}✓${RESET}  Policy created: ${FG.cyan}agentguard.yaml${RESET}\n`
  );
  return true;
}

function showProtectionSummary(
  policyGenerated: boolean,
  rtkStatus?: { available: boolean; version?: string }
): void {
  process.stderr.write('\n');
  process.stderr.write(`  ${FG.green}${BOLD}AgentGuard is active.${RESET}\n\n`);

  process.stderr.write(`  ${BOLD}Active protections:${RESET}\n`);
  process.stderr.write(`  ${FG.red}■${RESET} ${DIM}Block${RESET} push to main/master\n`);
  process.stderr.write(`  ${FG.red}■${RESET} ${DIM}Block${RESET} force push\n`);
  process.stderr.write(
    `  ${FG.red}■${RESET} ${DIM}Block${RESET} writes to .env, .npmrc, SSH keys\n`
  );
  process.stderr.write(`  ${FG.red}■${RESET} ${DIM}Block${RESET} rm -rf, deploy, infra destroy\n`);
  process.stderr.write(`  ${FG.red}■${RESET} ${DIM}Block${RESET} agent skill self-modification\n`);
  process.stderr.write(
    `  ${FG.green}■${RESET} ${DIM}Allow${RESET} file reads, file writes (non-sensitive)\n`
  );
  process.stderr.write(`  ${FG.blue}■${RESET} ${DIM}Track${RESET} all actions with audit trail\n`);

  // Token optimization status (optional)
  if (rtkStatus?.available) {
    const ver = rtkStatus.version ? ` v${rtkStatus.version}` : '';
    process.stderr.write(
      `  ${FG.cyan}■${RESET} ${DIM}Optimize${RESET} token usage via rtk${ver} (60-90% savings)\n`
    );
  } else {
    process.stderr.write(
      `  ${DIM}○ Token optimization  rtk not installed (optional — brew install rtk)${RESET}\n`
    );
  }
  process.stderr.write('\n');

  process.stderr.write(`  ${BOLD}Next steps:${RESET}\n`);
  if (policyGenerated) {
    process.stderr.write(
      `  ${DIM}1. Edit ${FG.cyan}agentguard.yaml${RESET}${DIM} to customize rules for your project${RESET}\n`
    );
    process.stderr.write(
      `  ${DIM}2. Start a Claude Code session — governance is automatic${RESET}\n`
    );
    process.stderr.write(
      `  ${DIM}3. Run ${FG.cyan}agentguard inspect --last${RESET}${DIM} to review decisions${RESET}\n`
    );
  } else {
    process.stderr.write(
      `  ${DIM}1. Start a Claude Code session — governance is automatic${RESET}\n`
    );
    process.stderr.write(
      `  ${DIM}2. Run ${FG.cyan}agentguard inspect --last${RESET}${DIM} to review decisions${RESET}\n`
    );
  }
  process.stderr.write(
    `\n  ${DIM}Try it: ${FG.cyan}agentguard demo${RESET}${DIM} — see governance in action${RESET}\n`
  );
  process.stderr.write(`  ${DIM}Remove: ${FG.cyan}agentguard claude-init --remove${RESET}\n\n`);
}

function hasAgentGuardHook(settings: Settings): boolean {
  const preToolUse = settings?.hooks?.PreToolUse || [];
  const postToolUse = settings?.hooks?.PostToolUse || [];
  const notifHooks = ((settings?.hooks as Record<string, unknown>)?.Notification ||
    []) as HookEntry[];
  const stopHooks = ((settings?.hooks as Record<string, unknown>)?.Stop || []) as HookEntry[];
  const allEntries = [...preToolUse, ...postToolUse, ...notifHooks, ...stopHooks] as HookEntry[];
  return allEntries.some((entry) => {
    const hooks = entry.hooks || [];
    return hooks.some((h) => h.command && h.command.includes(HOOK_MARKER));
  });
}

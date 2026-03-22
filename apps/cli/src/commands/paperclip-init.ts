// agentguard paperclip-init — set up AgentGuard governance for Paperclip-managed agents.
// Paperclip (https://github.com/paperclipai/paperclip) orchestrates multi-agent swarms.
// This command configures AgentGuard hooks so that all Paperclip-managed agent actions
// flow through the governance kernel for policy/invariant enforcement.
//
// What it does:
// 1. Configures Claude Code hooks (settings.json) to use paperclip-hook instead of claude-hook
// 2. Creates a starter agentguard.yaml policy if none exists
// 3. Sets up .agentguard/ directory structure for event/decision storage

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { RESET, BOLD, DIM, FG } from '../colors.js';
import { resolveMainRepoRoot } from '@red-codes/core';

const HOOK_MARKER = 'paperclip-hook';
const LOCAL_BIN = 'node apps/cli/dist/bin.js';

/** Detect if we're in the agentguard development repo (local dev) vs. globally installed. */
function resolveCliPrefix(): { cli: string; isLocal: boolean } {
  const mainRoot = resolveMainRepoRoot();
  const localMarker = join(mainRoot, 'apps', 'cli', 'src', 'bin.ts');
  if (existsSync(localMarker)) {
    return { cli: LOCAL_BIN, isLocal: true };
  }
  return { cli: 'agentguard', isLocal: false };
}

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

export async function paperclipInit(args: string[] = []): Promise<void> {
  const isRemove = args.includes('--remove') || args.includes('--uninstall');

  // Parse --store flag for storage backend (embedded into hook commands)
  const storeIdx = args.findIndex((a) => a === '--store');
  const storeBackend = storeIdx !== -1 ? args[storeIdx + 1] : undefined;

  // Parse --db-path flag for SQLite database path
  const dbPathIdx = args.findIndex((a) => a === '--db-path');
  const dbPathValue = dbPathIdx !== -1 ? args[dbPathIdx + 1] : undefined;

  // Sanitize values before embedding into hook command strings written to settings.json.
  // These commands are executed by Claude Code on every tool call — unsanitized values
  // could allow command injection via shell metacharacters.
  const sanitize = (v: string) => v.replace(/[^\w.:/\\-]/g, '');
  const storeSuffix = storeBackend ? ` --store ${sanitize(storeBackend)}` : '';
  const dbPathSuffix = dbPathValue ? ` --db-path "${sanitize(dbPathValue)}"` : '';

  process.stderr.write('\n');
  process.stderr.write(`  ${BOLD}AgentGuard × Paperclip Integration${RESET}\n\n`);

  if (isRemove) {
    removeHooks();
    return;
  }

  // Set up Claude Code hooks for Paperclip-managed agents.
  // Paperclip primarily uses Claude Code as its agent runtime, so we configure
  // the Claude Code settings.json to route through paperclip-hook.
  const settingsDir = join(process.cwd(), '.claude');
  const settingsPath = join(settingsDir, 'settings.json');

  if (!existsSync(settingsDir)) {
    mkdirSync(settingsDir, { recursive: true });
  }

  let settings: Settings = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as Settings;
    } catch {
      process.stderr.write(
        `  ${FG.yellow}Warning:${RESET} Could not parse .claude/settings.json, creating fresh config.\n`
      );
      settings = {};
    }
  }

  if (hasAgentGuardHook(settings)) {
    process.stderr.write(
      `  ${FG.yellow}Already configured.${RESET} AgentGuard hook found in .claude/settings.json.\n`
    );
    process.stderr.write(`  ${DIM}Use --remove to uninstall.${RESET}\n\n`);
    return;
  }

  const { cli } = resolveCliPrefix();

  if (!settings.hooks) settings.hooks = {};

  // PreToolUse — governance enforcement (all tool calls through the kernel)
  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
  settings.hooks.PreToolUse.push({
    hooks: [
      {
        type: 'command',
        command: `${cli} paperclip-hook pre${storeSuffix}${dbPathSuffix}`,
      },
    ],
  });

  // PostToolUse — error monitoring (bash stderr reporting)
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
  settings.hooks.PostToolUse.push({
    matcher: 'Bash',
    hooks: [
      {
        type: 'command',
        command: `${cli} paperclip-hook post${storeSuffix}${dbPathSuffix}`,
      },
    ],
  });

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

  // Store a hook integrity baseline so `agentguard status` can detect tampering.
  // Matches the baseline stored by `claude-init` for consistency.
  try {
    const { storeHookBaseline } = await import('@red-codes/adapters');
    storeHookBaseline(settingsPath);
  } catch {
    // Non-fatal — baseline is a best-effort integrity check
  }

  process.stderr.write(
    `  ${FG.green}\u2713${RESET}  Hooks installed in ${FG.cyan}.claude/settings.json${RESET}\n`
  );
  process.stderr.write(`  ${DIM}PreToolUse:    governance enforcement (all tools)${RESET}\n`);
  process.stderr.write(`  ${DIM}PostToolUse:   error monitoring (bash)${RESET}\n`);
  if (storeBackend) {
    process.stderr.write(`  ${DIM}Storage:       ${storeBackend}${RESET}\n`);
  }
  process.stderr.write('\n');

  // Ensure telemetry directories exist
  const repoRoot = resolveMainRepoRoot();
  const dirs = ['.agentguard/events', '.agentguard/decisions'];
  for (const dir of dirs) {
    const dirPath = join(repoRoot, dir);
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
  }

  // Auto-generate starter policy if none exists
  const policyGenerated = generateStarterPolicy();

  showProtectionSummary(policyGenerated);
}

function removeHooks(): void {
  const settingsPath = join(process.cwd(), '.claude', 'settings.json');

  if (!existsSync(settingsPath)) {
    process.stderr.write(`  ${DIM}No .claude/settings.json found. Nothing to remove.${RESET}\n\n`);
    return;
  }

  let settings: Settings;
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as Settings;
  } catch {
    process.stderr.write(`  ${FG.red}Error:${RESET} Could not parse .claude/settings.json.\n\n`);
    return;
  }

  if (!hasAgentGuardHook(settings)) {
    process.stderr.write(
      `  ${DIM}No AgentGuard hook found in .claude/settings.json. Nothing to remove.${RESET}\n\n`
    );
    return;
  }

  const filterEntries = (entries: HookEntry[]) =>
    entries.filter((entry) => {
      const hooks = entry.hooks || [];
      return !hooks.some((h) => (h.command || '').includes(HOOK_MARKER));
    });

  if (settings.hooks?.PreToolUse) {
    settings.hooks.PreToolUse = filterEntries(settings.hooks.PreToolUse);
    if (settings.hooks.PreToolUse.length === 0) delete settings.hooks.PreToolUse;
  }
  if (settings.hooks?.PostToolUse) {
    settings.hooks.PostToolUse = filterEntries(settings.hooks.PostToolUse);
    if (settings.hooks.PostToolUse.length === 0) delete settings.hooks.PostToolUse;
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

  process.stderr.write(
    `  ${FG.green}\u2713${RESET}  Hooks removed from ${FG.cyan}.claude/settings.json${RESET}\n`
  );
  process.stderr.write(
    `  ${DIM}AgentGuard governance will no longer monitor Paperclip-managed agents.${RESET}\n\n`
  );
}

const STARTER_POLICY = `# AgentGuard policy — safety rules for Paperclip-managed AI agents.
# Customize this file to match your project's security requirements.
# Docs: https://github.com/AgentGuardHQ/agent-guard

id: paperclip-default-policy
name: Paperclip Default Safety Policy
description: Baseline safety rules for Paperclip-orchestrated AI agents
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
  const repoRoot = resolveMainRepoRoot();
  for (const candidate of POLICY_CANDIDATES) {
    if (existsSync(join(repoRoot, candidate))) {
      return false;
    }
  }

  const policyPath = join(repoRoot, 'agentguard.yaml');
  writeFileSync(policyPath, STARTER_POLICY, 'utf8');
  process.stderr.write(
    `  ${FG.green}\u2713${RESET}  Policy created: ${FG.cyan}agentguard.yaml${RESET}\n`
  );
  return true;
}

function showProtectionSummary(policyGenerated: boolean): void {
  process.stderr.write('\n');
  process.stderr.write(
    `  ${FG.green}${BOLD}AgentGuard is active for Paperclip-managed agents.${RESET}\n\n`
  );

  process.stderr.write(`  ${BOLD}Active protections:${RESET}\n`);
  process.stderr.write(`  ${FG.red}\u25A0${RESET} ${DIM}Block${RESET} push to main/master\n`);
  process.stderr.write(`  ${FG.red}\u25A0${RESET} ${DIM}Block${RESET} force push\n`);
  process.stderr.write(
    `  ${FG.red}\u25A0${RESET} ${DIM}Block${RESET} writes to .env, .npmrc, SSH keys\n`
  );
  process.stderr.write(
    `  ${FG.red}\u25A0${RESET} ${DIM}Block${RESET} rm -rf, deploy, infra destroy\n`
  );
  process.stderr.write(
    `  ${FG.green}\u25A0${RESET} ${DIM}Allow${RESET} file reads, file writes (non-sensitive)\n`
  );
  process.stderr.write(
    `  ${FG.blue}\u25A0${RESET} ${DIM}Track${RESET} all actions with audit trail\n`
  );
  process.stderr.write('\n');

  process.stderr.write(`  ${BOLD}Paperclip context enrichment:${RESET}\n`);
  process.stderr.write(
    `  ${FG.blue}\u25A0${RESET} ${DIM}Agent identity from PAPERCLIP_AGENT_ID${RESET}\n`
  );
  process.stderr.write(
    `  ${FG.blue}\u25A0${RESET} ${DIM}Company/project context from PAPERCLIP_COMPANY_ID, PAPERCLIP_PROJECT_ID${RESET}\n`
  );
  process.stderr.write(
    `  ${FG.blue}\u25A0${RESET} ${DIM}Budget awareness from PAPERCLIP_BUDGET_REMAINING_CENTS${RESET}\n`
  );
  process.stderr.write(
    `  ${FG.blue}\u25A0${RESET} ${DIM}Workspace tracking from PAPERCLIP_WORKSPACE_ID${RESET}\n`
  );
  process.stderr.write('\n');

  process.stderr.write(`  ${BOLD}Next steps:${RESET}\n`);
  if (policyGenerated) {
    process.stderr.write(
      `  ${DIM}1. Edit ${FG.cyan}agentguard.yaml${RESET}${DIM} to customize rules for your project${RESET}\n`
    );
    process.stderr.write(
      `  ${DIM}2. Start a Paperclip heartbeat — governance is automatic${RESET}\n`
    );
    process.stderr.write(
      `  ${DIM}3. Run ${FG.cyan}agentguard inspect --last${RESET}${DIM} to review decisions${RESET}\n`
    );
  } else {
    process.stderr.write(
      `  ${DIM}1. Start a Paperclip heartbeat — governance is automatic${RESET}\n`
    );
    process.stderr.write(
      `  ${DIM}2. Run ${FG.cyan}agentguard inspect --last${RESET}${DIM} to review decisions${RESET}\n`
    );
  }
  process.stderr.write(
    `\n  ${DIM}Remove: ${FG.cyan}agentguard paperclip-init --remove${RESET}\n\n`
  );
}

function hasAgentGuardHook(settings: Settings): boolean {
  const preEntries = settings.hooks?.PreToolUse || [];
  const postEntries = settings.hooks?.PostToolUse || [];
  const allEntries = [...preEntries, ...postEntries];
  return allEntries.some((entry) => {
    const hooks = entry.hooks || [];
    return hooks.some((h) => (h.command || '').includes(HOOK_MARKER));
  });
}

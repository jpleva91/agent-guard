// agentguard codex-init — set up OpenAI Codex CLI integration
// Writes hooks.json to .codex/ (repo-level) or ~/.codex/ (global).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { RESET, BOLD, DIM, FG } from '../colors.js';
import { resolveMainRepoRoot } from '@red-codes/core';
import type { EnforcementMode } from '@red-codes/core';

const HOOK_MARKER = 'codex-hook';
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

interface CodexHookEntry {
  type?: string;
  command?: string;
  statusMessage?: string;
}

interface CodexMatcherGroup {
  matcher?: string;
  hooks?: CodexHookEntry[];
}

interface CodexHooksConfig {
  hooks: {
    PreToolUse?: CodexMatcherGroup[];
    PostToolUse?: CodexMatcherGroup[];
  };
}

export async function codexInit(args: string[] = []): Promise<void> {
  const isGlobal = args.includes('--global') || args.includes('-g');
  const isRemove = args.includes('--remove') || args.includes('--uninstall');

  // Parse --store flag for storage backend (embedded into hook commands)
  const storeIdx = args.findIndex((a) => a === '--store');
  const storeBackend = storeIdx !== -1 ? args[storeIdx + 1] : undefined;
  const storeSuffix = storeBackend ? ` --store ${storeBackend}` : '';

  // Parse --db-path flag for SQLite database path
  const dbPathIdx = args.findIndex((a) => a === '--db-path');
  const dbPathValue = dbPathIdx !== -1 ? args[dbPathIdx + 1] : undefined;
  const dbPathSuffix = dbPathValue ? ` --db-path "${dbPathValue}"` : '';

  // Parse --mode flag for enforcement mode
  const modeArgIdx = args.findIndex((a) => a === '--mode');
  const modeArg = modeArgIdx !== -1 ? args[modeArgIdx + 1] : undefined;
  const VALID_MODES: EnforcementMode[] = ['guide', 'educate', 'monitor', 'enforce'];
  const selectedMode: EnforcementMode =
    modeArg && VALID_MODES.includes(modeArg as EnforcementMode)
      ? (modeArg as EnforcementMode)
      : 'guide';

  // Codex CLI hooks location:
  // Repo-level: .codex/hooks.json
  // Global: ~/.codex/hooks.json
  const hooksDir = isGlobal ? join(homedir(), '.codex') : join(process.cwd(), '.codex');
  const hooksPath = join(hooksDir, 'hooks.json');
  const hooksLabel = isGlobal ? '~/.codex/hooks.json' : '.codex/hooks.json';

  process.stderr.write('\n');
  process.stderr.write(`  ${BOLD}AgentGuard Codex CLI Integration${RESET}\n\n`);

  if (isRemove) {
    removeHooks(hooksPath, hooksLabel);
    return;
  }

  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  let config: CodexHooksConfig = { hooks: {} };
  if (existsSync(hooksPath)) {
    try {
      config = JSON.parse(readFileSync(hooksPath, 'utf8')) as CodexHooksConfig;
    } catch {
      process.stderr.write(
        `  ${FG.yellow}Warning:${RESET} Could not parse ${hooksLabel}, creating fresh config.\n`
      );
      config = { hooks: {} };
    }
  }

  if (hasAgentGuardHook(config)) {
    process.stderr.write(
      `  ${FG.yellow}Already configured.${RESET} AgentGuard hook found in ${hooksLabel}.\n`
    );
    process.stderr.write(`  ${DIM}Use --remove to uninstall.${RESET}\n\n`);
    return;
  }

  if (!config.hooks) config.hooks = {};

  const { cli } = resolveCliPrefix();

  // PreToolUse — governance enforcement (routes all tool calls through the kernel)
  if (!config.hooks.PreToolUse) config.hooks.PreToolUse = [];
  config.hooks.PreToolUse.push({
    matcher: 'Bash|Write|Edit',
    hooks: [
      {
        type: 'command',
        command: `${cli} codex-hook pre${storeSuffix}${dbPathSuffix}`,
        statusMessage: 'AgentGuard governance check',
      },
    ],
  });

  // PostToolUse — error monitoring (bash stderr reporting)
  if (!config.hooks.PostToolUse) config.hooks.PostToolUse = [];
  config.hooks.PostToolUse.push({
    matcher: 'Bash',
    hooks: [
      {
        type: 'command',
        command: `${cli} codex-hook post${storeSuffix}${dbPathSuffix}`,
        statusMessage: 'AgentGuard error monitoring',
      },
    ],
  });

  writeFileSync(hooksPath, JSON.stringify(config, null, 2), 'utf8');

  process.stderr.write(
    `  ${FG.green}\u2713${RESET}  Hooks installed in ${FG.cyan}${hooksLabel}${RESET}\n`
  );
  process.stderr.write(
    `  ${DIM}PreToolUse:    governance enforcement (Bash, Write, Edit)${RESET}\n`
  );
  process.stderr.write(`  ${DIM}PostToolUse:   error monitoring (Bash)${RESET}\n`);
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
  const policyGenerated = generateStarterPolicy(selectedMode);

  showProtectionSummary(policyGenerated, selectedMode);
}

function removeHooks(hooksPath: string, hooksLabel: string): void {
  if (!existsSync(hooksPath)) {
    process.stderr.write(
      `  ${DIM}No hooks file found at ${hooksLabel}. Nothing to remove.${RESET}\n\n`
    );
    return;
  }

  let config: CodexHooksConfig;
  try {
    config = JSON.parse(readFileSync(hooksPath, 'utf8')) as CodexHooksConfig;
  } catch {
    process.stderr.write(`  ${FG.red}Error:${RESET} Could not parse ${hooksLabel}.\n\n`);
    return;
  }

  if (!hasAgentGuardHook(config)) {
    process.stderr.write(
      `  ${DIM}No AgentGuard hook found in ${hooksLabel}. Nothing to remove.${RESET}\n\n`
    );
    return;
  }

  const filterByCommand = (groups: CodexMatcherGroup[]) =>
    groups.filter((group) => {
      const hooks = group.hooks || [];
      return !hooks.some((h) => (h.command || '').includes(HOOK_MARKER));
    });

  if (config.hooks.PreToolUse) {
    config.hooks.PreToolUse = filterByCommand(config.hooks.PreToolUse);
    if (config.hooks.PreToolUse.length === 0) delete config.hooks.PreToolUse;
  }
  if (config.hooks.PostToolUse) {
    config.hooks.PostToolUse = filterByCommand(config.hooks.PostToolUse);
    if (config.hooks.PostToolUse.length === 0) delete config.hooks.PostToolUse;
  }

  writeFileSync(hooksPath, JSON.stringify(config, null, 2), 'utf8');

  process.stderr.write(
    `  ${FG.green}\u2713${RESET}  Hooks removed from ${FG.cyan}${hooksLabel}${RESET}\n`
  );
  process.stderr.write(
    `  ${DIM}AgentGuard governance will no longer monitor in Codex CLI.${RESET}\n\n`
  );
}

const STARTER_POLICY_TEMPLATE = (
  mode: EnforcementMode
) => `# AgentGuard policy — safety rules for AI coding agents.
# Customize this file to match your project's security requirements.
# Docs: https://github.com/AgentGuardHQ/agent-guard

id: default-policy
name: Default Safety Policy
description: Baseline safety rules for AI coding agents
severity: 4

# Enforcement mode: guide | educate | monitor | enforce
#   guide   — block dangerous actions with corrective suggestions (recommended)
#   educate — allow actions but teach correct patterns
#   monitor — log threats, don't block
#   enforce — block dangerous actions, no suggestions
mode: ${mode}

rules:
  # Protected branches — prevent direct push to main/master
  - action: git.push
    effect: deny
    branches: [main, master]
    reason: Direct push to protected branch
    suggestion: Push to a feature branch and open a pull request instead
    correctedCommand: "git push origin HEAD:feat/my-branch"

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

function generateStarterPolicy(mode: EnforcementMode = 'guide'): boolean {
  const repoRoot = resolveMainRepoRoot();
  for (const candidate of POLICY_CANDIDATES) {
    if (existsSync(join(repoRoot, candidate))) {
      return false;
    }
  }

  const policyPath = join(repoRoot, 'agentguard.yaml');
  writeFileSync(policyPath, STARTER_POLICY_TEMPLATE(mode), 'utf8');
  process.stderr.write(
    `  ${FG.green}\u2713${RESET}  Policy created: ${FG.cyan}agentguard.yaml${RESET} (${mode} mode)\n`
  );
  return true;
}

function showProtectionSummary(policyGenerated: boolean, mode: EnforcementMode = 'guide'): void {
  process.stderr.write('\n');
  process.stderr.write(`  ${FG.green}${BOLD}AgentGuard is active for Codex CLI.${RESET}\n\n`);

  if (mode === 'guide') {
    process.stderr.write(
      `  ${BOLD}Mode: ${FG.cyan}guide${RESET}${BOLD} — dangerous actions blocked with corrective suggestions${RESET}\n\n`
    );
    process.stderr.write(`  ${BOLD}Guiding:${RESET}\n`);
    process.stderr.write(
      `  ${FG.cyan}\u25A0${RESET} ${DIM}Block + suggest${RESET} push to main/master\n`
    );
    process.stderr.write(`  ${FG.cyan}\u25A0${RESET} ${DIM}Block + suggest${RESET} force push\n`);
    process.stderr.write(
      `  ${FG.cyan}\u25A0${RESET} ${DIM}Block + suggest${RESET} writes to .env, .npmrc, SSH keys\n`
    );
    process.stderr.write(
      `  ${FG.cyan}\u25A0${RESET} ${DIM}Block + suggest${RESET} rm -rf, deploy, infra destroy\n`
    );
  } else if (mode === 'educate') {
    process.stderr.write(
      `  ${BOLD}Mode: ${FG.blue}educate${RESET}${BOLD} — actions allowed with corrective teaching${RESET}\n\n`
    );
    process.stderr.write(`  ${BOLD}Teaching:${RESET}\n`);
    process.stderr.write(
      `  ${FG.blue}\u25A0${RESET} ${DIM}Allow + teach${RESET} push to main/master\n`
    );
    process.stderr.write(`  ${FG.blue}\u25A0${RESET} ${DIM}Allow + teach${RESET} force push\n`);
    process.stderr.write(
      `  ${FG.blue}\u25A0${RESET} ${DIM}Allow + teach${RESET} writes to .env, .npmrc, SSH keys\n`
    );
    process.stderr.write(
      `  ${FG.red}\u25A0${RESET} ${DIM}Block${RESET} secret exposure (always enforced)\n`
    );
  } else if (mode === 'monitor') {
    process.stderr.write(
      `  ${BOLD}Mode: ${FG.yellow}monitor${RESET}${BOLD} — threats are logged, not blocked${RESET}\n\n`
    );
    process.stderr.write(`  ${BOLD}Monitoring for:${RESET}\n`);
    process.stderr.write(`  ${FG.yellow}\u25A0${RESET} ${DIM}Warn${RESET} push to main/master\n`);
    process.stderr.write(`  ${FG.yellow}\u25A0${RESET} ${DIM}Warn${RESET} force push\n`);
    process.stderr.write(
      `  ${FG.yellow}\u25A0${RESET} ${DIM}Warn${RESET} writes to .env, .npmrc, SSH keys\n`
    );
    process.stderr.write(
      `  ${FG.red}\u25A0${RESET} ${DIM}Block${RESET} secret exposure (always enforced)\n`
    );
  } else {
    process.stderr.write(
      `  ${BOLD}Mode: ${FG.red}enforce${RESET}${BOLD} — dangerous actions are blocked${RESET}\n\n`
    );
    process.stderr.write(`  ${BOLD}Enforcing:${RESET}\n`);
    process.stderr.write(`  ${FG.red}\u25A0${RESET} ${DIM}Block${RESET} push to main/master\n`);
    process.stderr.write(`  ${FG.red}\u25A0${RESET} ${DIM}Block${RESET} force push\n`);
    process.stderr.write(
      `  ${FG.red}\u25A0${RESET} ${DIM}Block${RESET} writes to .env, .npmrc, SSH keys\n`
    );
    process.stderr.write(
      `  ${FG.red}\u25A0${RESET} ${DIM}Block${RESET} rm -rf, deploy, infra destroy\n`
    );
  }
  process.stderr.write(
    `  ${FG.green}\u25A0${RESET} ${DIM}Allow${RESET} file reads, file writes (non-sensitive)\n`
  );
  process.stderr.write(
    `  ${FG.blue}\u25A0${RESET} ${DIM}Track${RESET} all actions with audit trail\n`
  );
  process.stderr.write('\n');

  process.stderr.write(`  ${BOLD}Next steps:${RESET}\n`);
  if (policyGenerated) {
    process.stderr.write(
      `  ${DIM}1. Edit ${FG.cyan}agentguard.yaml${RESET}${DIM} to customize rules for your project${RESET}\n`
    );
    process.stderr.write(
      `  ${DIM}2. Start a Codex CLI session — governance is automatic${RESET}\n`
    );
    process.stderr.write(
      `  ${DIM}3. Run ${FG.cyan}agentguard inspect --last${RESET}${DIM} to review decisions${RESET}\n`
    );
  } else {
    process.stderr.write(
      `  ${DIM}1. Start a Codex CLI session — governance is automatic${RESET}\n`
    );
    process.stderr.write(
      `  ${DIM}2. Run ${FG.cyan}agentguard inspect --last${RESET}${DIM} to review decisions${RESET}\n`
    );
  }
  process.stderr.write(`\n  ${DIM}Remove: ${FG.cyan}agentguard codex-init --remove${RESET}\n\n`);
}

function hasAgentGuardHook(config: CodexHooksConfig): boolean {
  const allGroups = [...(config.hooks?.PreToolUse || []), ...(config.hooks?.PostToolUse || [])];
  return allGroups.some((group) => {
    const hooks = group.hooks || [];
    return hooks.some((h) => (h.command || '').includes(HOOK_MARKER));
  });
}

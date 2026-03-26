// agentguard claude-init — set up Claude Code integration

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { execSync, execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { RESET, BOLD, DIM, FG } from '../colors.js';
import { resolveMainRepoRoot } from '@red-codes/core';
import type { EnforcementMode } from '@red-codes/core';
import { detectDriver, detectModel, detectProject, VALID_ROLES, type Role } from '../identity.js';
import {
  AGENT_IDENTITY_BRIDGE,
  WRITE_PERSONA,
  SESSION_PERSONA_CHECK,
  claudeHookWrapper,
} from '../templates/scripts.js';
import { STARTER_SKILLS } from '../templates/skills.js';

const HOOK_MARKER = 'claude-hook';
const BUILD_MARKER = 'apps/cli/dist/bin.js';
const LOCAL_BIN = 'node apps/cli/dist/bin.js';

/** Detect if we're in the agentguard development repo (local dev) vs. globally installed.
 *  For project-level npm installs, resolves to ./node_modules/.bin/agentguard so hooks
 *  work even when the binary isn't on PATH (#964). */
function resolveCliPrefix(isGlobal: boolean): { cli: string; isLocal: boolean } {
  // If apps/cli/src/bin.ts exists, we're in the agentguard source repo (works in worktrees too)
  const mainRoot = resolveMainRepoRoot();
  const localMarker = join(mainRoot, 'apps', 'cli', 'src', 'bin.ts');
  if (existsSync(localMarker)) {
    return { cli: LOCAL_BIN, isLocal: true };
  }
  // For project-level settings, prefer the local node_modules binary.
  // Global settings apply across projects, so they must use a bare command (on PATH).
  if (!isGlobal) {
    const nmBin = join(mainRoot, 'node_modules', '.bin', 'agentguard');
    if (existsSync(nmBin)) {
      return { cli: './node_modules/.bin/agentguard', isLocal: false };
    }
    const nmBinAguard = join(mainRoot, 'node_modules', '.bin', 'aguard');
    if (existsSync(nmBinAguard)) {
      return { cli: './node_modules/.bin/aguard', isLocal: false };
    }
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

async function promptChoice(question: string, options: string[], defaultIdx = 0): Promise<number> {
  if (!process.stdin.isTTY) return defaultIdx;

  const rl = createInterface({ input: process.stdin, output: process.stderr });

  process.stderr.write(`  ${question}\n`);
  for (let i = 0; i < options.length; i++) {
    const marker = i === defaultIdx ? `${FG.green}❯${RESET}` : ' ';
    process.stderr.write(`    ${marker} ${i + 1}) ${options[i]}\n`);
  }

  return new Promise<number>((resolve) => {
    rl.question(`  ${DIM}Enter choice [${defaultIdx + 1}]:${RESET} `, (answer) => {
      rl.close();
      const num = parseInt(answer.trim(), 10);
      if (num >= 1 && num <= options.length) {
        resolve(num - 1);
      } else {
        resolve(defaultIdx);
      }
    });
  });
}

export async function claudeInit(args: string[] = []): Promise<void> {
  const isGlobal = args.includes('--global') || args.includes('-g');
  const isRemove = args.includes('--remove') || args.includes('--uninstall');
  const isRefresh = args.includes('--refresh');
  const isReset = args.includes('--reset');

  // Parse --store flag for storage backend (embedded into hook commands)
  const storeIdx = args.findIndex((a) => a === '--store');
  const storeBackend = storeIdx !== -1 ? args[storeIdx + 1] : undefined;
  const storeSuffix = storeBackend ? ` --store ${storeBackend}` : '';

  // Parse --db-path flag for SQLite database path (embedded into hook commands)
  const dbPathIdx = args.findIndex((a) => a === '--db-path');
  const dbPathValue = dbPathIdx !== -1 ? args[dbPathIdx + 1] : undefined;
  const dbPathSuffix = dbPathValue ? ` --db-path "${dbPathValue}"` : '';

  // Parse --role flag
  const roleArgIdx = args.findIndex((a) => a === '--role');
  const roleArg = roleArgIdx !== -1 ? (args[roleArgIdx + 1] as Role) : undefined;

  // Parse --driver flag (override auto-detection)
  const driverArgIdx = args.findIndex((a) => a === '--driver');
  const driverArg = driverArgIdx !== -1 ? args[driverArgIdx + 1] : undefined;

  // Parse --no-skills flag
  const noSkills = args.includes('--no-skills');

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

  if (isRefresh && hasAgentGuardHook(settings)) {
    const { storeHookBaseline } = await import('@red-codes/adapters');
    storeHookBaseline(settingsPath);
    process.stderr.write(
      `  ${FG.green}✓${RESET}  Hook baseline refreshed for ${settingsLabel}\n\n`
    );

    // Ensure .agentguard-identity exists even on --refresh (fresh worktrees/clones won't have it)
    const refreshRepoRoot = resolveMainRepoRoot();
    const refreshIdentityPath = join(refreshRepoRoot, '.agentguard-identity');
    if (!existsSync(refreshIdentityPath)) {
      const refreshDriver = driverArg ?? detectDriver();
      const refreshModel = detectModel();
      const refreshRole = roleArg ?? 'developer';
      writeFileSync(refreshIdentityPath, `${refreshDriver}:${refreshModel}:${refreshRole}`);
      process.stderr.write(
        `  ${FG.green}✓${RESET}  Identity file created: ${FG.cyan}.agentguard-identity${RESET}\n\n`
      );
    }

    return;
  }

  if (hasAgentGuardHook(settings)) {
    // Hooks exist in settings — but verify referenced scripts/binaries are intact
    const integrity = validateHookIntegrity();
    if (!integrity.ok || !integrity.binaryResolved) {
      const issues: string[] = [];
      if (integrity.missingScripts.length > 0) {
        issues.push(`missing scripts: ${integrity.missingScripts.join(', ')}`);
      }
      if (!integrity.binaryResolved) {
        issues.push('agentguard binary not found');
      }
      process.stderr.write(
        `  ${FG.yellow}Hooks are configured but some referenced scripts are missing:${RESET}\n`
      );
      for (const issue of issues) {
        process.stderr.write(`    ${FG.red}✗${RESET} ${issue}\n`);
      }
      process.stderr.write(`  ${DIM}Continuing with init to repair...${RESET}\n\n`);
      // Fall through to re-run init and repair the broken state
    } else if (!isReset) {
      process.stderr.write(
        `  ${FG.yellow}Already configured.${RESET} AgentGuard hook found in ${settingsLabel}.\n`
      );
      process.stderr.write(
        `  ${DIM}Use --remove to uninstall, or --reset to regenerate policy.${RESET}\n\n`
      );
      return;
    }
    // --reset: fall through to regenerate policy even when hooks are intact
  }

  // Parse --mode and --pack flags for non-interactive mode
  const modeArgIdx = args.findIndex((a) => a === '--mode');
  const modeArg = modeArgIdx !== -1 ? args[modeArgIdx + 1] : undefined;
  const packArgIdx = args.findIndex((a) => a === '--pack');
  const packArg = packArgIdx !== -1 ? args[packArgIdx + 1] : undefined;

  let selectedMode: EnforcementMode = 'guide';
  let selectedPack: string | undefined = 'essentials';

  const VALID_MODES: EnforcementMode[] = ['guide', 'educate', 'monitor', 'enforce'];

  if (modeArg) {
    selectedMode = VALID_MODES.includes(modeArg as EnforcementMode)
      ? (modeArg as EnforcementMode)
      : 'guide';
  } else if (process.stdin.isTTY && !isRefresh) {
    const modeChoice = await promptChoice(
      'Start in which mode?',
      [
        `Guide ${DIM}— block dangerous actions with corrective suggestions (recommended)${RESET}`,
        `Educate ${DIM}— allow actions but teach correct patterns${RESET}`,
        `Monitor ${DIM}— log threats, don't block${RESET}`,
        `Enforce ${DIM}— block dangerous actions, no suggestions${RESET}`,
      ],
      0
    );
    const modeMap: EnforcementMode[] = ['guide', 'educate', 'monitor', 'enforce'];
    selectedMode = modeMap[modeChoice];
  }

  if (packArg !== undefined) {
    selectedPack = packArg === 'none' ? undefined : packArg;
  } else if (process.stdin.isTTY && !isRefresh) {
    const packChoice = await promptChoice(
      'Enable a policy pack?',
      [
        `essentials ${DIM}— secrets, force push, protected branches, credentials${RESET}`,
        `strict ${DIM}— all 22 invariants enforced${RESET}`,
        `none ${DIM}— monitor only, configure later${RESET}`,
      ],
      0
    );
    selectedPack = packChoice === 2 ? undefined : packChoice === 1 ? 'strict' : 'essentials';
  }

  let selectedRole: Role = 'developer';

  if (roleArg && VALID_ROLES.includes(roleArg)) {
    selectedRole = roleArg;
  } else if (process.stdin.isTTY && !isRefresh) {
    const roleChoice = await promptChoice(
      'Your role (for governance telemetry)',
      [
        `developer ${DIM}— writing and shipping code${RESET}`,
        `reviewer ${DIM}— reviewing PRs and auditing${RESET}`,
        `ops ${DIM}— deployment, releases, infrastructure${RESET}`,
        `security ${DIM}— security scanning and hardening${RESET}`,
        `planner ${DIM}— sprint planning and roadmap${RESET}`,
      ],
      0
    );
    selectedRole = VALID_ROLES[roleChoice] ?? 'developer';
  }

  if (!settings.hooks) settings.hooks = {};

  const { cli, isLocal } = resolveCliPrefix(isGlobal);

  // PreToolUse — governance enforcement (routes all tool calls through the kernel)
  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
  settings.hooks.PreToolUse.push({
    hooks: [
      {
        type: 'command',
        command: `bash scripts/claude-hook-wrapper.sh`,
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
    command: 'bash scripts/session-persona-check.sh',
    timeout: 5000,
    blocking: true,
  });
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

  // Resolve repo root early — needed for script installation and telemetry dirs
  const repoRoot = resolveMainRepoRoot();

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

  // Install identity scripts
  const scriptsDir = join(repoRoot, 'scripts');
  if (!existsSync(scriptsDir)) {
    mkdirSync(scriptsDir, { recursive: true });
  }

  const scriptFiles: Array<{ name: string; content: string }> = [
    { name: 'agent-identity-bridge.sh', content: AGENT_IDENTITY_BRIDGE },
    { name: 'write-persona.sh', content: WRITE_PERSONA },
    { name: 'session-persona-check.sh', content: SESSION_PERSONA_CHECK },
    { name: 'claude-hook-wrapper.sh', content: claudeHookWrapper(cli, storeSuffix, dbPathSuffix) },
  ];

  for (const { name, content } of scriptFiles) {
    const scriptPath = join(scriptsDir, name);
    if (existsSync(scriptPath) && !isRefresh) {
      continue;
    }
    writeFileSync(scriptPath, content, { mode: 0o755 });
  }

  // Write initial persona
  const driver = driverArg ?? detectDriver();
  const model = detectModel();
  const project = detectProject();
  try {
    const { execFileSync } = await import('node:child_process');
    execFileSync('bash', ['scripts/write-persona.sh', driver, selectedRole], {
      cwd: repoRoot,
      stdio: 'pipe',
    });
  } catch {
    // Non-fatal — persona can be set later via SessionStart hook
  }

  process.stderr.write(
    `  ${FG.green}✓${RESET}  Identity set: ${FG.cyan}${driver}:${model}:${selectedRole}${RESET} (project: ${project})\n`
  );

  // Create .agentguard-identity file (gitignored — each clone/worktree creates its own).
  // This file is required by the PreToolUse hook; without it all tool calls are blocked (#850).
  // For CI/cron agents, AGENTGUARD_AGENT_NAME env var overrides this file at runtime.
  const identityFilePath = join(repoRoot, '.agentguard-identity');
  if (!existsSync(identityFilePath)) {
    writeFileSync(identityFilePath, `${driver}:${model}:${selectedRole}`);
    process.stderr.write(
      `  ${FG.green}✓${RESET}  Identity file created: ${FG.cyan}.agentguard-identity${RESET}\n`
    );
    process.stderr.write(
      `  ${DIM}   CI/cron agents: set AGENTGUARD_AGENT_NAME env var to override${RESET}\n`
    );
  }

  // Scaffold starter skills
  if (!noSkills) {
    const skillsDir = join(settingsDir, 'skills');
    if (!existsSync(skillsDir)) {
      mkdirSync(skillsDir, { recursive: true });
    }

    let skillCount = 0;
    for (const skill of STARTER_SKILLS) {
      const skillPath = join(skillsDir, skill.filename);
      if (!existsSync(skillPath)) {
        writeFileSync(skillPath, skill.content);
        skillCount++;
      }
    }

    if (skillCount > 0) {
      process.stderr.write(
        `  ${FG.green}✓${RESET}  Starter skills: ${FG.cyan}.claude/skills/${RESET} (${skillCount} files)\n`
      );
    }
  }

  // Append identity instructions to CLAUDE.md
  const claudeMdPath = join(repoRoot, 'CLAUDE.md');
  const identityBlock = `
## Agent Identity

At session start, if you see \`[AgentGuard] No agent identity set\`, ask the user:
1. **Role**: developer / reviewer / ops / security / planner
2. **Driver**: human / claude-code / copilot / opencode / ci

Then run: \`scripts/write-persona.sh <driver> <role>\`
`;

  if (existsSync(claudeMdPath)) {
    const existing = readFileSync(claudeMdPath, 'utf8');
    if (!existing.includes('Agent Identity')) {
      writeFileSync(claudeMdPath, existing + '\n' + identityBlock);
    }
  } else {
    writeFileSync(claudeMdPath, identityBlock.trimStart());
  }

  // Store hook integrity baseline
  try {
    const { storeHookBaseline } = await import('@red-codes/adapters');
    storeHookBaseline(settingsPath);
  } catch {
    // Non-fatal — integrity will report no_baseline
  }

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

  // Ensure telemetry directories exist (use main repo root so worktrees share them)
  const dirs = ['.agentguard/events', '.agentguard/decisions', 'logs'];
  for (const dir of dirs) {
    const dirPath = join(repoRoot, dir);
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
  }

  // Auto-generate starter policy if none exists (or overwrite if --reset)
  const policyGenerated = generateStarterPolicy(selectedMode, selectedPack, isReset);

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
  showProtectionSummary(policyGenerated, rtkStatus, isGlobal, selectedMode);
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

  const WRAPPER_MARKER = 'claude-hook-wrapper';
  const preToolUse = settings.hooks?.PreToolUse || [];
  settings.hooks!.PreToolUse = filterByCommand(preToolUse, HOOK_MARKER);
  // Also remove wrapper-based hooks
  settings.hooks!.PreToolUse = filterByCommand(settings.hooks!.PreToolUse, WRAPPER_MARKER);
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
  // Also remove persona check hook
  const PERSONA_MARKER = 'session-persona-check';
  (settings.hooks as Record<string, unknown>).SessionStart = filterByCommand(
    (settings.hooks as Record<string, unknown>).SessionStart as HookEntry[],
    PERSONA_MARKER
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

  // Clean up identity scripts
  const repoRoot = resolveMainRepoRoot();
  const identityScripts = [
    'agent-identity-bridge.sh',
    'write-persona.sh',
    'session-persona-check.sh',
    'claude-hook-wrapper.sh',
  ];
  for (const name of identityScripts) {
    const scriptPath = join(repoRoot, 'scripts', name);
    if (existsSync(scriptPath)) {
      try {
        unlinkSync(scriptPath);
      } catch {
        /* ignore */
      }
    }
  }

  // Clean up persona file
  const personaPath = join(repoRoot, '.agentguard', 'persona.env');
  if (existsSync(personaPath)) {
    try {
      unlinkSync(personaPath);
    } catch {
      /* ignore */
    }
  }

  process.stderr.write(
    `  ${FG.green}✓${RESET}  Hook removed from ${FG.cyan}${settingsLabel}${RESET}\n`
  );
  process.stderr.write(
    `  ${DIM}AgentGuard governance will no longer monitor in Claude Code.${RESET}\n\n`
  );
}

const STARTER_POLICY_TEMPLATE = (mode: EnforcementMode, pack?: string) => {
  const packLine = pack ? `pack: ${pack}` : '# pack: essentials';
  return `# AgentGuard policy — runtime protection for AI coding agents.
# Docs: https://github.com/AgentGuardHQ/agentguard

id: default-policy
name: Default Safety Policy
description: Baseline safety rules for AI coding agents

# Enforcement mode: guide | educate | monitor | enforce
#   guide   — block dangerous actions with corrective suggestions (recommended)
#   educate — allow actions but teach correct patterns
#   monitor — log threats, don't block
#   enforce — block dangerous actions, no suggestions
mode: ${mode}

# Agent identity: defaults to .agentguard-identity file (created by claude-init).
# For CI/cron agents, set AGENTGUARD_AGENT_NAME env var to override.
# e.g., AGENTGUARD_AGENT_NAME=ci:github-actions:ops

# Policy pack — curated invariant enforcement profiles
${packLine}

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

  # ─── Allowed operations ──────────────────────────────────────────────
  # With default-deny enabled, actions without an explicit allow rule are
  # denied. The rules below cover standard development workflows.

  # Reading is always safe
  - action: file.read
    effect: allow
    reason: Reading is always safe

  # File writes (subject to deny rules above for secrets)
  - action: file.write
    effect: allow
    reason: File writes allowed by default

  # File deletion and move
  - action: file.delete
    effect: allow
    reason: File deletion allowed by default

  - action: file.move
    effect: allow
    reason: File move allowed by default

  # Shell commands (subject to deny rules above for rm -rf)
  - action: shell.exec
    effect: allow
    reason: Shell execution allowed by default

  # Git operations (subject to deny rules for protected branches)
  - action: git.diff
    effect: allow
    reason: Viewing diffs is always safe

  - action: git.commit
    effect: allow
    reason: Commits allowed by default

  - action: git.push
    effect: allow
    reason: Pushes allowed to non-protected branches

  - action: git.checkout
    effect: allow
    reason: Branch checkout allowed by default

  - action: git.branch.create
    effect: allow
    reason: Branch creation allowed by default

  - action: git.merge
    effect: allow
    reason: Merge allowed by default

  # Worktree operations
  - action: git.worktree.list
    effect: allow
    reason: Worktree listing is read-only and safe

  - action: git.worktree.add
    effect: allow
    reason: Worktree creation encouraged for isolated agent work

  - action: git.worktree.remove
    effect: allow
    reason: Worktree cleanup needed for housekeeping

  - action: git.branch.delete
    effect: allow
    reason: Branch cleanup allowed for non-protected branches

  # Testing is always encouraged
  - action:
      - test.run
      - test.run.unit
      - test.run.integration
    effect: allow
    reason: Running tests is always safe

  # Package management
  - action: npm.install
    effect: allow
    reason: Package installation allowed by default

  - action: npm.script.run
    effect: allow
    reason: NPM script execution allowed by default

  # HTTP requests
  - action: http.request
    effect: allow
    reason: HTTP requests allowed by default

  # GitHub CLI operations (subject to deny rules above)
  - action:
      - github.pr.list
      - github.pr.view
      - github.pr.checks
      - github.pr.create
      - github.issue.list
      - github.issue.create
      - github.run.list
      - github.run.view
      - github.api
    effect: allow
    reason: GitHub CLI operations allowed by default

  # GitHub state-changing operations require explicit allow
  - action:
      - github.pr.merge
      - github.pr.close
      - github.issue.close
      - github.release.create
    effect: allow
    reason: GitHub state-changing operations allowed by default

  # MCP tool invocations (add your MCP servers here)
  # - action: mcp.call
  #   effect: allow
  #   target: "your-mcp-server"
  #   reason: MCP server access allowed
`;
};

const POLICY_CANDIDATES = [
  'agentguard.yaml',
  'agentguard.yml',
  'agentguard.json',
  '.agentguard.yaml',
  '.agentguard.yml',
];

function generateStarterPolicy(
  mode: EnforcementMode = 'guide',
  pack?: string,
  forceOverwrite = false
): boolean {
  const repoRoot = resolveMainRepoRoot();
  if (!forceOverwrite) {
    for (const candidate of POLICY_CANDIDATES) {
      if (existsSync(join(repoRoot, candidate))) {
        return false;
      }
    }
  }

  const policyPath = join(repoRoot, 'agentguard.yaml');
  writeFileSync(policyPath, STARTER_POLICY_TEMPLATE(mode, pack), 'utf8');
  const verb = forceOverwrite ? 'Reset' : 'Created';
  process.stderr.write(
    `  ${FG.green}✓${RESET}  Policy ${verb.toLowerCase()}: ${FG.cyan}agentguard.yaml${RESET} (${mode} mode${pack ? `, ${pack} pack` : ''})\n`
  );
  return true;
}

function showProtectionSummary(
  _policyGenerated: boolean,
  rtkStatus?: { available: boolean; version?: string },
  isGlobal?: boolean,
  mode: EnforcementMode = 'guide'
): void {
  process.stderr.write('\n');
  process.stderr.write(`  ${FG.green}${BOLD}AgentGuard is active.${RESET}\n\n`);

  if (mode === 'guide') {
    process.stderr.write(
      `  ${BOLD}Mode: ${FG.cyan}guide${RESET}${BOLD} — dangerous actions blocked with corrective suggestions${RESET}\n\n`
    );
    process.stderr.write(`  ${BOLD}Guiding:${RESET}\n`);
    process.stderr.write(
      `  ${FG.cyan}■${RESET} ${DIM}Block + suggest${RESET} push to main/master\n`
    );
    process.stderr.write(`  ${FG.cyan}■${RESET} ${DIM}Block + suggest${RESET} force push\n`);
    process.stderr.write(
      `  ${FG.cyan}■${RESET} ${DIM}Block + suggest${RESET} writes to .env, credentials\n`
    );
    process.stderr.write(
      `  ${FG.cyan}■${RESET} ${DIM}Block + suggest${RESET} rm -rf, deploy, infra destroy\n`
    );
  } else if (mode === 'educate') {
    process.stderr.write(
      `  ${BOLD}Mode: ${FG.blue}educate${RESET}${BOLD} — actions allowed with corrective teaching${RESET}\n\n`
    );
    process.stderr.write(`  ${BOLD}Teaching:${RESET}\n`);
    process.stderr.write(`  ${FG.blue}■${RESET} ${DIM}Allow + teach${RESET} push to main/master\n`);
    process.stderr.write(`  ${FG.blue}■${RESET} ${DIM}Allow + teach${RESET} force push\n`);
    process.stderr.write(
      `  ${FG.blue}■${RESET} ${DIM}Allow + teach${RESET} credential file creation\n`
    );
    process.stderr.write(
      `  ${FG.blue}■${RESET} ${DIM}Allow + teach${RESET} permission escalation\n`
    );
    process.stderr.write(
      `  ${FG.red}■${RESET} ${DIM}Block${RESET} secret exposure (always enforced)\n`
    );
  } else if (mode === 'monitor') {
    process.stderr.write(
      `  ${BOLD}Mode: ${FG.yellow}monitor${RESET}${BOLD} — threats are logged, not blocked${RESET}\n\n`
    );
    process.stderr.write(`  ${BOLD}Monitoring for:${RESET}\n`);
    process.stderr.write(`  ${FG.yellow}■${RESET} ${DIM}Warn${RESET} push to main/master\n`);
    process.stderr.write(`  ${FG.yellow}■${RESET} ${DIM}Warn${RESET} force push\n`);
    process.stderr.write(`  ${FG.yellow}■${RESET} ${DIM}Warn${RESET} credential file creation\n`);
    process.stderr.write(`  ${FG.yellow}■${RESET} ${DIM}Warn${RESET} permission escalation\n`);
    process.stderr.write(`  ${FG.yellow}■${RESET} ${DIM}Warn${RESET} blast radius exceeded\n`);
    process.stderr.write(
      `  ${FG.red}■${RESET} ${DIM}Block${RESET} secret exposure (always enforced)\n`
    );
  } else {
    process.stderr.write(
      `  ${BOLD}Mode: ${FG.red}enforce${RESET}${BOLD} — dangerous actions are blocked${RESET}\n\n`
    );
    process.stderr.write(`  ${BOLD}Enforcing:${RESET}\n`);
    process.stderr.write(`  ${FG.red}■${RESET} ${DIM}Block${RESET} push to main/master\n`);
    process.stderr.write(`  ${FG.red}■${RESET} ${DIM}Block${RESET} force push\n`);
    process.stderr.write(`  ${FG.red}■${RESET} ${DIM}Block${RESET} writes to .env, credentials\n`);
    process.stderr.write(
      `  ${FG.red}■${RESET} ${DIM}Block${RESET} rm -rf, deploy, infra destroy\n`
    );
  }
  process.stderr.write(`  ${FG.blue}■${RESET} ${DIM}Track${RESET} all actions with audit trail\n`);

  if (rtkStatus?.available) {
    const ver = rtkStatus.version ? ` v${rtkStatus.version}` : '';
    process.stderr.write(
      `  ${FG.cyan}■${RESET} ${DIM}Optimize${RESET} token usage via rtk${ver}\n`
    );
  }
  process.stderr.write('\n');

  process.stderr.write(`  ${BOLD}Next steps:${RESET}\n`);
  if (mode === 'monitor') {
    process.stderr.write(
      `  ${DIM}1. Start a Claude Code session — warnings appear in your terminal${RESET}\n`
    );
    process.stderr.write(
      `  ${DIM}2. Run ${FG.cyan}agentguard inspect --last${RESET}${DIM} to review the audit trail${RESET}\n`
    );
    process.stderr.write(
      `  ${DIM}3. Edit ${FG.cyan}agentguard.yaml${RESET}${DIM} → set ${FG.cyan}mode: guide${RESET}${DIM} when ready to block with suggestions${RESET}\n`
    );
  } else if (mode === 'educate') {
    process.stderr.write(
      `  ${DIM}1. Start a Claude Code session — teaching feedback appears in your terminal${RESET}\n`
    );
    process.stderr.write(
      `  ${DIM}2. Run ${FG.cyan}agentguard inspect --last${RESET}${DIM} to review the audit trail${RESET}\n`
    );
    process.stderr.write(
      `  ${DIM}3. Edit ${FG.cyan}agentguard.yaml${RESET}${DIM} → set ${FG.cyan}mode: guide${RESET}${DIM} when ready to block with suggestions${RESET}\n`
    );
  } else {
    process.stderr.write(
      `  ${DIM}1. Start a Claude Code session — governance is automatic${RESET}\n`
    );
    process.stderr.write(
      `  ${DIM}2. Run ${FG.cyan}agentguard inspect --last${RESET}${DIM} to review decisions${RESET}\n`
    );
  }
  if (!isGlobal) {
    process.stderr.write(
      `\n  ${FG.yellow}Tip:${RESET} Run ${FG.cyan}agentguard claude-init --global${RESET} to install hooks globally.\n`
    );
  }
  process.stderr.write(`\n  ${DIM}ℹ Claude Desktop support coming soon.${RESET}\n`);
  process.stderr.write('\n');

  // User capture funnel: cloud signup + community links
  process.stderr.write(`  ${BOLD}Join the community:${RESET}\n`);
  process.stderr.write(
    `  ${DIM}Cloud dashboard:${RESET} ${FG.cyan}https://agentguard-cloud-dashboard.vercel.app/signup${RESET}\n`
  );
  process.stderr.write(
    `  ${DIM}Discussions:${RESET}     ${FG.cyan}https://github.com/AgentGuardHQ/agentguard/discussions${RESET}\n`
  );
  process.stderr.write(
    `\n  ${DIM}Run ${FG.cyan}agentguard cloud signup${RESET}${DIM} for early access to team governance.${RESET}\n`
  );
  process.stderr.write('\n');
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

/** Wrapper scripts that hooks may reference. */
const WRAPPER_SCRIPTS = [
  'scripts/claude-hook-wrapper.sh',
  'scripts/session-persona-check.sh',
  'scripts/agent-identity-bridge.sh',
  'scripts/write-persona.sh',
];

interface HookIntegrityResult {
  ok: boolean;
  missingScripts: string[];
  binaryResolved: boolean;
}

/** Validate that hook-referenced scripts and binaries actually exist on disk. */
export function validateHookIntegrity(): HookIntegrityResult {
  const repoRoot = resolveMainRepoRoot();
  const missingScripts: string[] = [];

  for (const script of WRAPPER_SCRIPTS) {
    const scriptPath = join(repoRoot, script);
    if (!existsSync(scriptPath)) {
      missingScripts.push(script);
    }
  }

  // Check if the agentguard binary can be resolved
  let binaryResolved = false;
  const localBinPath = join(repoRoot, 'node_modules', '.bin', 'agentguard');
  if (existsSync(localBinPath)) {
    binaryResolved = true;
  } else {
    // Check PATH via execFileSync (safe — no shell injection)
    try {
      execFileSync('which', ['agentguard'], { stdio: 'pipe', timeout: 3000 });
      binaryResolved = true;
    } catch {
      // Also check if we're in local dev mode (apps/cli/dist/bin.js exists)
      const localDevBin = join(repoRoot, 'apps', 'cli', 'dist', 'bin.js');
      if (existsSync(localDevBin)) {
        binaryResolved = true;
      }
    }
  }

  return {
    ok: missingScripts.length === 0,
    missingScripts,
    binaryResolved,
  };
}

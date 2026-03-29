// AgentGuard postinstall — auto-configure governance hooks for all AI coding drivers.
// Supports: Claude Code, Copilot CLI, Codex CLI, Gemini CLI.
// Standalone entry point. Uses ONLY Node.js built-ins (no @red-codes/*, no child_process).
// Must NEVER fail npm install — all errors caught and silently ignored.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, parse, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import * as https from 'node:https';

// ── Constants ──

const HOOK_MARKER = 'claude-hook';
const COPILOT_HOOK_MARKER = 'copilot-hook';
const CODEX_HOOK_MARKER = 'codex-hook';
const GEMINI_HOOK_MARKER = 'gemini-hook';

const POLICY_CANDIDATES = [
  'agentguard.yaml',
  'agentguard.yml',
  'agentguard.json',
  '.agentguard.yaml',
  '.agentguard.yml',
];

const STARTER_POLICY = `# AgentGuard policy — safety rules for AI coding agents.
# Customize this file to match your project's security requirements.
# Docs: https://github.com/AgentGuardHQ/agentguard

id: default-policy
name: Default Safety Policy
description: Baseline safety rules for AI coding agents
severity: 4
mode: guide
pack: essentials

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

  # --- Safe operations (default-deny baseline) ---
  - action: file.read
    effect: allow
    reason: Reading is always safe

  - action: file.write
    effect: allow
    reason: File writes allowed (secrets denied above)

  - action: file.delete
    effect: allow
    reason: File deletion allowed

  - action: file.move
    effect: allow
    reason: File move/rename allowed

  - action: git.diff
    effect: allow
    reason: Viewing diffs is always safe

  - action: git.commit
    effect: allow
    reason: Commits allowed

  - action: git.push
    effect: allow
    reason: Pushes to feature branches allowed (protected branches denied above)

  - action: git.branch.create
    effect: allow
    reason: Branch creation allowed

  - action: git.checkout
    effect: allow
    reason: Branch switching allowed

  - action: git.merge
    effect: allow
    reason: Merges allowed

  - action: shell.exec
    effect: allow
    reason: Shell commands allowed (destructive commands denied above)

  - action: [test.run, test.run.unit, test.run.integration]
    effect: allow
    reason: Running tests is always safe

  - action: npm.install
    effect: allow
    reason: Dependency installation allowed

  - action: npm.script.run
    effect: allow
    reason: NPM scripts allowed

  - action: http.request
    effect: allow
    reason: HTTP requests allowed

  - action: mcp.call
    effect: allow
    reason: MCP tool calls allowed
`;

// ── Types ──

interface HookDef {
  type: string;
  command: string;
  timeout?: number;
}

interface HookGroup {
  matcher?: string;
  hooks: HookDef[];
}

interface ClaudeSettings {
  hooks?: {
    PreToolUse?: HookGroup[];
    PostToolUse?: HookGroup[];
    Notification?: HookGroup[];
    Stop?: HookGroup[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface CopilotHookEntry {
  type?: string;
  bash?: string;
  timeoutSec?: number;
  [key: string]: unknown;
}

interface CopilotHooksConfig {
  version: number;
  hooks: {
    preToolUse?: CopilotHookEntry[];
    postToolUse?: CopilotHookEntry[];
    [key: string]: unknown;
  };
}

interface CodexHookEntry {
  type?: string;
  command?: string;
  statusMessage?: string;
  [key: string]: unknown;
}

interface CodexHookGroup {
  matcher?: string;
  hooks: CodexHookEntry[];
}

interface CodexHooksConfig {
  hooks: {
    PreToolUse?: CodexHookGroup[];
    PostToolUse?: CodexHookGroup[];
    [key: string]: unknown;
  };
}

interface GeminiHookEntry {
  type?: string;
  command?: string;
  [key: string]: unknown;
}

interface GeminiHookGroup {
  matcher?: string;
  hooks: GeminiHookEntry[];
}

interface GeminiSettings {
  hooks?: {
    BeforeTool?: GeminiHookGroup[];
    AfterTool?: GeminiHookGroup[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const TELEMETRY_ENDPOINT_HOST = 'agentguard-cloud.vercel.app';
const TELEMETRY_INSTALL_PATH = '/api/v1/telemetry/install';
const TELEMETRY_TIMEOUT_MS = 5000;
const AGENTGUARD_IDENTITY_PATH = join(homedir(), '.agentguard', 'telemetry.json');

// ── Exported functions (for testability) ──

/**
 * Resolve the project root by walking up from startDir past any node_modules/ directories.
 * Returns the first ancestor that is NOT inside any node_modules/ and contains a package.json.
 * Returns null if filesystem root is reached without finding one.
 */
export function resolveProjectRoot(startDir: string): string | null {
  let current = resolve(startDir);
  const { root } = parse(current);

  while (current !== root) {
    // Check if current directory is inside a node_modules segment
    if (!isInsideNodeModules(current)) {
      if (existsSync(join(current, 'package.json'))) {
        return current;
      }
    }

    // Move up one directory
    const parent = resolve(current, '..');
    if (parent === current) break; // Safety: filesystem root
    current = parent;
  }

  // Check root itself
  if (!isInsideNodeModules(current) && existsSync(join(current, 'package.json'))) {
    return current;
  }

  return null;
}

/**
 * Check if a path has any segment that IS exactly 'node_modules'.
 */
function isInsideNodeModules(absPath: string): boolean {
  const segments = absPath.split(sep);
  return segments.some((segment) => segment === 'node_modules');
}

/**
 * Write Claude Code hooks to .claude/settings.json.
 * Merges with existing settings. Skips if AgentGuard hooks already present.
 */
export function writeClaudeCodeHooks(projectRoot: string): 'created' | 'skipped' {
  const claudeDir = join(projectRoot, '.claude');
  const settingsPath = join(claudeDir, 'settings.json');

  // Load existing settings
  let settings: ClaudeSettings = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as ClaudeSettings;
    } catch {
      // Corrupt file — start fresh but preserve nothing
      settings = {};
    }
  }

  // Check if already installed
  if (hasClaudeHook(settings)) {
    return 'skipped';
  }

  // Ensure .claude/ directory exists
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }

  // Initialize hooks object, preserving existing hook arrays
  if (!settings.hooks) settings.hooks = {};

  // PreToolUse — governance enforcement for all tools
  // Use `npx --no-install` so the command resolves via local node_modules/.bin
  // without falling back to downloading a (nonexistent) `agentguard` package from npm.
  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
  settings.hooks.PreToolUse.push({
    hooks: [
      {
        type: 'command',
        command: 'npx --no-install agentguard claude-hook pre --store sqlite',
        timeout: 30000,
      },
    ],
  });

  // PostToolUse — error monitoring for Bash
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
  settings.hooks.PostToolUse.push({
    matcher: 'Bash',
    hooks: [
      {
        type: 'command',
        command: 'npx --no-install agentguard claude-hook post --store sqlite',
        timeout: 10000,
      },
    ],
  });

  // Notification — event logging
  if (!settings.hooks.Notification) settings.hooks.Notification = [];
  settings.hooks.Notification.push({
    hooks: [
      {
        type: 'command',
        command: 'npx --no-install agentguard claude-hook notification --store sqlite',
        timeout: 10000,
      },
    ],
  });

  // Stop — session end logging
  if (!settings.hooks.Stop) settings.hooks.Stop = [];
  settings.hooks.Stop.push({
    hooks: [
      {
        type: 'command',
        command: 'npx --no-install agentguard claude-hook stop --store sqlite',
        timeout: 10000,
      },
    ],
  });

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  return 'created';
}

/**
 * Write Copilot CLI hooks to .github/hooks/hooks.json.
 * Merges with existing config. Skips if AgentGuard hooks already present.
 */
export function writeCopilotCliHooks(projectRoot: string): 'created' | 'skipped' {
  const hooksDir = join(projectRoot, '.github', 'hooks');
  const hooksPath = join(hooksDir, 'hooks.json');

  // Load existing config
  let config: CopilotHooksConfig = { version: 1, hooks: {} };
  if (existsSync(hooksPath)) {
    try {
      config = JSON.parse(readFileSync(hooksPath, 'utf8')) as CopilotHooksConfig;
    } catch {
      // Corrupt file — start fresh
      config = { version: 1, hooks: {} };
    }
  }

  // Check if already installed
  if (hasCopilotHook(config)) {
    return 'skipped';
  }

  // Ensure directory exists
  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  if (!config.hooks) config.hooks = {};

  // preToolUse — governance enforcement
  // Use `npx --no-install` to resolve via local node_modules/.bin (see Claude Code hooks comment).
  if (!config.hooks.preToolUse) config.hooks.preToolUse = [];
  config.hooks.preToolUse.push({
    type: 'command',
    bash: 'npx --no-install agentguard copilot-hook pre --store sqlite',
    timeoutSec: 30,
  });

  // postToolUse — error monitoring
  if (!config.hooks.postToolUse) config.hooks.postToolUse = [];
  config.hooks.postToolUse.push({
    type: 'command',
    bash: 'npx --no-install agentguard copilot-hook post --store sqlite',
    timeoutSec: 10,
  });

  writeFileSync(hooksPath, JSON.stringify(config, null, 2), 'utf8');
  return 'created';
}

/**
 * Write Codex CLI hooks to .codex/hooks.json.
 * Codex uses the same PreToolUse/PostToolUse schema as Claude Code.
 * Skips if AgentGuard hooks already present or .codex/ directory does not exist.
 */
export function writeCodexHooks(projectRoot: string): 'created' | 'skipped' | 'not-detected' {
  const codexDir = join(projectRoot, '.codex');
  if (!existsSync(codexDir)) {
    return 'not-detected';
  }

  const hooksPath = join(codexDir, 'hooks.json');

  let config: CodexHooksConfig = { hooks: {} };
  if (existsSync(hooksPath)) {
    try {
      config = JSON.parse(readFileSync(hooksPath, 'utf8')) as CodexHooksConfig;
    } catch {
      config = { hooks: {} };
    }
  }

  if (hasCodexHook(config)) {
    return 'skipped';
  }

  if (!config.hooks) config.hooks = {};

  if (!config.hooks.PreToolUse) config.hooks.PreToolUse = [];
  config.hooks.PreToolUse.push({
    hooks: [
      {
        type: 'command',
        command: 'npx --no-install agentguard codex-hook pre --store sqlite',
        statusMessage: 'AgentGuard governance check',
      },
    ],
  });

  if (!config.hooks.PostToolUse) config.hooks.PostToolUse = [];
  config.hooks.PostToolUse.push({
    matcher: 'Bash',
    hooks: [
      {
        type: 'command',
        command: 'npx --no-install agentguard codex-hook post --store sqlite',
        statusMessage: 'AgentGuard error monitoring',
      },
    ],
  });

  writeFileSync(hooksPath, JSON.stringify(config, null, 2), 'utf8');
  return 'created';
}

/**
 * Write Gemini CLI hooks to .gemini/settings.json.
 * Gemini uses BeforeTool/AfterTool (different key names from Claude/Codex).
 * Skips if AgentGuard hooks already present or .gemini/ directory does not exist.
 */
export function writeGeminiHooks(projectRoot: string): 'created' | 'skipped' | 'not-detected' {
  const geminiDir = join(projectRoot, '.gemini');
  if (!existsSync(geminiDir)) {
    return 'not-detected';
  }

  const settingsPath = join(geminiDir, 'settings.json');

  let settings: GeminiSettings = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as GeminiSettings;
    } catch {
      settings = {};
    }
  }

  if (hasGeminiHook(settings)) {
    return 'skipped';
  }

  if (!settings.hooks) settings.hooks = {};

  if (!settings.hooks.BeforeTool) settings.hooks.BeforeTool = [];
  settings.hooks.BeforeTool.push({
    hooks: [
      {
        type: 'command',
        command: 'npx --no-install agentguard gemini-hook pre --store sqlite',
      },
    ],
  });

  if (!settings.hooks.AfterTool) settings.hooks.AfterTool = [];
  settings.hooks.AfterTool.push({
    matcher: 'Shell',
    hooks: [
      {
        type: 'command',
        command: 'npx --no-install agentguard gemini-hook post --store sqlite',
      },
    ],
  });

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  return 'created';
}

/**
 * Write a starter agentguard.yaml policy if no policy file exists.
 */
export function writeStarterPolicy(projectRoot: string): 'created' | 'skipped' {
  // Check if any policy file variant exists
  for (const candidate of POLICY_CANDIDATES) {
    if (existsSync(join(projectRoot, candidate))) {
      return 'skipped';
    }
  }

  const policyPath = join(projectRoot, 'agentguard.yaml');
  writeFileSync(policyPath, STARTER_POLICY, 'utf8');
  return 'created';
}

/**
 * Detect if this install is an upgrade from a previously recorded version.
 * Reads the last-recorded version from the identity file and compares with currentVersion.
 * Returns { isUpgrade: true, fromVersion, toVersion } or { isUpgrade: false }.
 */
export function detectVersionUpgrade(
  currentVersion: string
): { isUpgrade: false } | { isUpgrade: true; fromVersion: string; toVersion: string } {
  try {
    if (!existsSync(AGENTGUARD_IDENTITY_PATH)) return { isUpgrade: false };
    const data = JSON.parse(readFileSync(AGENTGUARD_IDENTITY_PATH, 'utf8')) as {
      install_id?: string;
      version?: string;
    };
    const prevVersion = data.version;
    if (prevVersion && prevVersion !== currentVersion) {
      return { isUpgrade: true, fromVersion: prevVersion, toVersion: currentVersion };
    }
  } catch {
    // Unreadable identity file — treat as fresh install
  }
  return { isUpgrade: false };
}

/**
 * Returns true if install telemetry is enabled (checks AGENTGUARD_TELEMETRY and DO_NOT_TRACK).
 */
export function isTelemetryEnabled(): boolean {
  const mode = process.env.AGENTGUARD_TELEMETRY;
  if (mode === 'off') return false;
  const dnt = process.env.DO_NOT_TRACK;
  if (dnt === '1' || dnt === 'true') return false;
  return true;
}

/**
 * Detect CI environment from well-known environment variables.
 * Returns a short identifier string or null if not running in CI.
 */
export function detectCiEnvironment(): string | null {
  if (process.env.GITHUB_ACTIONS === 'true') return 'github-actions';
  if (process.env.VERCEL) return 'vercel';
  if (process.env.GITLAB_CI === 'true') return 'gitlab-ci';
  if (process.env.CI === 'true' || process.env.CI === '1') return 'ci';
  return null;
}

/**
 * Resolve the anonymous install ID from the persisted identity file.
 * Falls back to a fresh UUID if no identity exists or the file is unreadable.
 */
export function resolveInstallId(): string {
  try {
    if (existsSync(AGENTGUARD_IDENTITY_PATH)) {
      const data = JSON.parse(readFileSync(AGENTGUARD_IDENTITY_PATH, 'utf8')) as {
        install_id?: string;
      };
      if (data.install_id) return data.install_id;
    }
  } catch {
    // fall through to fresh UUID
  }
  return randomUUID();
}

/**
 * Send a fire-and-forget install event to the telemetry endpoint.
 * Errors are silently ignored — this must never break npm install.
 */
function sendInstallEvent(payload: Record<string, unknown>): void {
  try {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: TELEMETRY_ENDPOINT_HOST,
      path: TELEMETRY_INSTALL_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: TELEMETRY_TIMEOUT_MS,
    });
    req.on('error', () => {
      /* ignore */
    });
    req.on('timeout', () => {
      req.destroy();
    });
    req.write(body);
    req.end();
  } catch {
    // Telemetry must never break npm install
  }
}

/**
 * Report an install event to AgentGuard Cloud telemetry (opt-in, fire-and-forget).
 * Respects AGENTGUARD_TELEMETRY=off and DO_NOT_TRACK=1.
 * Reports: package version, OS, Node version, CI environment, anonymous install ID.
 */
export function reportInstallTelemetry(scriptDir: string): void {
  try {
    if (!isTelemetryEnabled()) return;

    // Resolve package version from the package.json adjacent to the compiled script
    let packageVersion = 'unknown';
    try {
      const pkgPath = join(dirname(scriptDir), 'package.json');
      const pkgAlt = join(scriptDir, '..', 'package.json');
      const pkgFile = existsSync(pkgPath) ? pkgPath : pkgAlt;
      if (existsSync(pkgFile)) {
        const pkg = JSON.parse(readFileSync(pkgFile, 'utf8')) as { version?: string };
        packageVersion = pkg.version ?? 'unknown';
      }
    } catch {
      // version stays 'unknown'
    }

    const payload: Record<string, unknown> = {
      event: 'install',
      install_id: resolveInstallId(),
      version: packageVersion,
      os: process.platform,
      node_version: process.version,
      ci: detectCiEnvironment(),
      timestamp: Date.now(),
    };

    sendInstallEvent(payload);

    // Persist the version into the identity file so detectVersionUpgrade works on future installs
    try {
      const agentguardDir = join(homedir(), '.agentguard');
      if (!existsSync(agentguardDir)) mkdirSync(agentguardDir, { recursive: true });
      let identity: Record<string, unknown> = {};
      if (existsSync(AGENTGUARD_IDENTITY_PATH)) {
        try {
          identity = JSON.parse(readFileSync(AGENTGUARD_IDENTITY_PATH, 'utf8')) as Record<
            string,
            unknown
          >;
        } catch {
          identity = {};
        }
      }
      identity.version = packageVersion;
      if (!identity.install_id) identity.install_id = payload.install_id;
      writeFileSync(AGENTGUARD_IDENTITY_PATH, JSON.stringify(identity, null, 2), 'utf8');
    } catch {
      // Version persistence must never break npm install
    }
  } catch {
    // Never break npm install
  }
}

// ── Private helpers ──

function hasClaudeHook(settings: ClaudeSettings): boolean {
  const hookArrays = [settings.hooks?.PreToolUse, settings.hooks?.PostToolUse];
  for (const arr of hookArrays) {
    if (!arr) continue;
    for (const group of arr) {
      for (const hook of group.hooks ?? []) {
        if (hook.command && hook.command.includes(HOOK_MARKER)) {
          return true;
        }
      }
    }
  }
  return false;
}

function hasCopilotHook(config: CopilotHooksConfig): boolean {
  const hookArrays = [config.hooks?.preToolUse, config.hooks?.postToolUse];
  for (const arr of hookArrays) {
    if (!arr) continue;
    for (const entry of arr) {
      if (entry.bash && entry.bash.includes(COPILOT_HOOK_MARKER)) {
        return true;
      }
    }
  }
  return false;
}

function hasCodexHook(config: CodexHooksConfig): boolean {
  const hookArrays = [config.hooks?.PreToolUse, config.hooks?.PostToolUse];
  for (const arr of hookArrays) {
    if (!arr) continue;
    for (const group of arr) {
      for (const hook of group.hooks ?? []) {
        if (hook.command && hook.command.includes(CODEX_HOOK_MARKER)) {
          return true;
        }
      }
    }
  }
  return false;
}

function hasGeminiHook(settings: GeminiSettings): boolean {
  const hookArrays = [settings.hooks?.BeforeTool, settings.hooks?.AfterTool];
  for (const arr of hookArrays) {
    if (!arr) continue;
    for (const group of arr) {
      for (const hook of group.hooks ?? []) {
        if (hook.command && hook.command.includes(GEMINI_HOOK_MARKER)) {
          return true;
        }
      }
    }
  }
  return false;
}

type HookResult = 'created' | 'skipped';
type DriverHookResult = HookResult | 'not-detected';

interface SummaryOptions {
  claudeResult: HookResult;
  copilotResult: HookResult;
  codexResult: DriverHookResult;
  geminiResult: DriverHookResult;
  policyResult: HookResult;
  projectRoot: string;
  upgradeInfo: ReturnType<typeof detectVersionUpgrade>;
}

function printSummary(opts: SummaryOptions): void {
  const {
    claudeResult,
    copilotResult,
    codexResult,
    geminiResult,
    policyResult,
    projectRoot,
    upgradeInfo,
  } = opts;

  const tag = (r: DriverHookResult): string => {
    if (r === 'created') return '[created]';
    if (r === 'not-detected') return '[not detected]';
    return '[skipped]';
  };

  const claudeDetected = existsSync(join(projectRoot, '.claude'));
  const anyCreated =
    claudeResult === 'created' ||
    copilotResult === 'created' ||
    codexResult === 'created' ||
    geminiResult === 'created';

  process.stderr.write('\n');
  process.stderr.write('  AgentGuard postinstall\n');
  process.stderr.write(`  Project: ${projectRoot}\n\n`);
  process.stderr.write(`  Claude Code hooks:  ${tag(claudeResult)}\n`);
  process.stderr.write(`  Copilot CLI hooks:  ${tag(copilotResult)}\n`);
  process.stderr.write(`  Codex CLI hooks:    ${tag(codexResult)}\n`);
  process.stderr.write(`  Gemini CLI hooks:   ${tag(geminiResult)}\n`);
  process.stderr.write(`  Starter policy:     ${tag(policyResult)}\n`);
  process.stderr.write('\n');

  if (upgradeInfo.isUpgrade) {
    process.stderr.write(
      `  AgentGuard upgraded ${upgradeInfo.fromVersion} \u2192 ${upgradeInfo.toVersion}\n`
    );
    process.stderr.write(
      '  Run: npx @red-codes/agentguard auto-setup    (reinit all driver hooks)\n\n'
    );
  }

  if (!claudeDetected) {
    process.stderr.write(
      '  \u26a0 Claude Code not detected \u2014 hooks ready for when you start\n\n'
    );
  }

  if (anyCreated) {
    process.stderr.write('  Governance is active. Run: agentguard inspect --last\n\n');
  }

  process.stderr.write(
    '  Customize:  npx @red-codes/agentguard claude-init   (full Claude Code wizard)\n'
  );
  process.stderr.write(
    '              npx @red-codes/agentguard copilot-init  (full Copilot CLI wizard)\n'
  );
  process.stderr.write('  Enforce:    set mode: enforce in agentguard.yaml\n');
  process.stderr.write('\n');
}

function main(): void {
  // Resolve __dirname for ESM
  let scriptDir: string;
  try {
    scriptDir = fileURLToPath(new URL('.', import.meta.url));
  } catch {
    // Fallback for non-ESM contexts (e.g., bundled CJS)
    scriptDir = __dirname;
  }

  // Skip if running inside agentguard dev repo
  const projectRoot = resolveProjectRoot(scriptDir);
  if (!projectRoot) return;

  if (existsSync(join(projectRoot, 'apps', 'cli', 'src', 'bin.ts'))) {
    return; // dev repo — skip postinstall
  }

  // Detect upgrade before telemetry writes the new version
  const upgradeInfo = detectVersionUpgrade(resolveCurrentVersion(scriptDir));

  const claudeResult = writeClaudeCodeHooks(projectRoot);
  const copilotResult = writeCopilotCliHooks(projectRoot);
  const codexResult = writeCodexHooks(projectRoot);
  const geminiResult = writeGeminiHooks(projectRoot);
  const policyResult = writeStarterPolicy(projectRoot);

  reportInstallTelemetry(scriptDir);

  printSummary({
    claudeResult,
    copilotResult,
    codexResult,
    geminiResult,
    policyResult,
    projectRoot,
    upgradeInfo,
  });
}

/**
 * Resolve the current package version from the package.json adjacent to scriptDir.
 * Returns 'unknown' if not resolvable.
 */
function resolveCurrentVersion(scriptDir: string): string {
  try {
    const pkgPath = join(dirname(scriptDir), 'package.json');
    const pkgAlt = join(scriptDir, '..', 'package.json');
    const pkgFile = existsSync(pkgPath) ? pkgPath : pkgAlt;
    if (existsSync(pkgFile)) {
      const pkg = JSON.parse(readFileSync(pkgFile, 'utf8')) as { version?: string };
      return pkg.version ?? 'unknown';
    }
  } catch {
    // version stays 'unknown'
  }
  return 'unknown';
}

// ── Entry point — only run when executed directly, not when imported ──

function isMainModule(): boolean {
  try {
    const scriptPath = fileURLToPath(import.meta.url);
    const argv1 = process.argv[1];
    if (!argv1) return false;
    // Compare resolved paths to handle symlinks and relative paths
    return resolve(scriptPath) === resolve(argv1);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    main();
  } catch {
    // Postinstall must NEVER break npm install — silently ignore all errors
    process.exit(0);
  }
}

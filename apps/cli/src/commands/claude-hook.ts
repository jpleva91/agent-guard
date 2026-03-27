// AgentGuard Claude Code hook — PreToolUse governance + PostToolUse error monitoring + Notification session viewer.
// PreToolUse: routes actions through the kernel for policy/invariant enforcement.
// PostToolUse: reports Bash stderr errors (informational only).
// Notification: auto-opens the session viewer when the agent pauses for human input.
// Stop: generates session viewer HTML (no browser open — Notification handles that).
// Always exits 0 — hooks must never fail.
// Supports both JSONL (default) and SQLite storage backends via --store flag or AGENTGUARD_STORE env var.

import { randomUUID } from 'node:crypto';
import { execFileSync, execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, parse as parsePath } from 'node:path';
import { tmpdir } from 'node:os';
import type { ClaudeCodeHookPayload, HookResponseOptions } from '@red-codes/adapters';
import type { LoadedPolicy } from '@red-codes/policy';
import { resolveMainRepoRoot } from '@red-codes/core';
import type { CloudSinkBundle } from '@red-codes/telemetry';
import { detectDriver, detectModel, VALID_ROLES } from '../identity.js';
import type { Driver } from '../identity.js';

/**
 * Read-only tools that should fail-open (not fail-closed) when no policy rule matches.
 * These tools cannot mutate state, so blocking them by default when policies exist
 * is overly strict and breaks common workflows (e.g. reading files in sub-repos).
 * Write/exec tools remain fail-closed (default-deny) for security.
 */
const READ_ONLY_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'LS',
  'NotebookRead',
  'WebSearch',
  'WebFetch',
]);

// --- Session state: persist formatPass/testsPass across hook invocations ----
// Each Claude Code session is stateless per hook call. We bridge this by writing
// a small JSON file keyed by session_id so format/test results from one call are
// visible to subsequent PreToolUse governance checks in the same session.

interface SessionState extends Record<string, unknown> {
  formatPass?: boolean;
  testsPass?: boolean;
  /** File paths written/modified in this session — for commit-scope-guard invariant */
  writtenFiles?: string[];
}

/**
 * Detect the agent's squad from identity format (driver:model:squad:rank)
 * or from AGENTGUARD_AGENT_NAME env var.
 */
function detectSquad(payload: { session_id?: string } & Record<string, unknown>): string | null {
  // Try env var first (set by write-persona.sh or --agent-name flag)
  const agentName = process.env.AGENTGUARD_AGENT_NAME;
  if (agentName) {
    const parts = agentName.split(':');
    if (parts.length >= 3) return parts[2]; // driver:model:squad:rank
  }
  // Try session state
  try {
    const state = readSessionState(payload.session_id as string | undefined);
    if (state.agentName) {
      const parts = (state.agentName as string).split(':');
      if (parts.length >= 3) return parts[2];
    }
  } catch {
    // ignore
  }
  return null;
}

function sessionStatePath(sessionId: string): string {
  // Use a dedicated subdirectory rather than flat tmpdir to reduce path
  // predictability on shared systems (e.g. multi-user CI machines).
  return join(tmpdir(), 'agentguard', `session-${sessionId}.json`);
}

function readSessionState(sessionId: string | undefined): SessionState {
  const key = sessionId || String(process.ppid) || 'default';
  try {
    return JSON.parse(readFileSync(sessionStatePath(key), 'utf8')) as SessionState;
  } catch {
    return {};
  }
}

function writeSessionState(sessionId: string | undefined, patch: Partial<SessionState>): void {
  const key = sessionId || String(process.ppid) || 'default';
  try {
    mkdirSync(join(tmpdir(), 'agentguard'), { recursive: true });
    const current = readSessionState(key);
    writeFileSync(sessionStatePath(key), JSON.stringify({ ...current, ...patch }));
  } catch {
    // Non-fatal — state tracking is best-effort
  }
}

// --- Retry counter helpers: track per-violation retry attempts across hook calls ---

export function getRetryCount(state: Record<string, unknown>, key: string): number {
  const counts = (state.retryCounts ?? {}) as Record<string, number>;
  return counts[key] ?? 0;
}

export function incrementRetry(state: Record<string, unknown>, key: string): void {
  if (!state.retryCounts) state.retryCounts = {};
  const counts = state.retryCounts as Record<string, number>;
  counts[key] = (counts[key] ?? 0) + 1;
}

/**
 * Load AGENTGUARD_* variables from the nearest .env file, walking up from cwd.
 * Only sets variables that are not already in process.env (env vars take precedence).
 * This allows the hook to pick up the API key from the project's .env without
 * hardcoding secrets in the hook command or global config files.
 */
function loadProjectEnv(): void {
  let dir = process.env.AGENTGUARD_WORKSPACE || process.cwd();
  const { root } = parsePath(dir);

  while (dir !== root) {
    const envPath = join(dir, '.env');
    if (existsSync(envPath)) {
      try {
        const content = readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx < 0) continue;
          const key = trimmed.slice(0, eqIdx).trim();
          // Only load AGENTGUARD_* vars — don't pollute the env with unrelated keys
          if (!key.startsWith('AGENTGUARD_')) continue;
          if (process.env[key] !== undefined) continue; // env vars take precedence
          let value = trimmed.slice(eqIdx + 1).trim();
          // Strip surrounding quotes
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          process.env[key] = value;
        }
      } catch {
        // Non-fatal — continue without .env
      }
      return; // Stop at the first .env found
    }
    dir = dirname(dir);
  }
}

// --- Agent identity resolution ---
// Identity is resolved from .agentguard-identity file or AGENTGUARD_AGENT_NAME env var.
// Identity persists across sessions — no blanking on stop. Users set it once via the wizard.

/** Check if a process is still alive (signal 0 = existence check). */
function isProcessAlive(pid: number): boolean {
  if (!pid || isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Resolve the project root for identity file placement.
 *  Priority: AGENTGUARD_WORKSPACE env > .agentguard-identity walk > .git walk > git rev-parse > cwd.
 *  Hook subprocesses may run with arbitrary CWD, so we can't rely on process.cwd(). */
function resolveIdentityDir(): string {
  if (process.env.AGENTGUARD_WORKSPACE) return process.env.AGENTGUARD_WORKSPACE;

  // Walk up from the script's location to find the project root.
  // Prioritize .agentguard-identity (exact match) over .git (may be a nested repo).
  const scriptPath = process.argv[1];
  if (scriptPath) {
    let dir = dirname(scriptPath);
    const fsRoot = parsePath(dir).root;
    let firstGitDir: string | undefined;
    while (dir !== fsRoot) {
      if (existsSync(join(dir, '.agentguard-identity'))) return dir;
      if (!firstGitDir && existsSync(join(dir, '.git'))) firstGitDir = dir;
      dir = dirname(dir);
    }
    if (firstGitDir) return firstGitDir;
  }

  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    return process.cwd();
  }
}

function resolveAgentIdentity(): string | null {
  // 1. Check .agentguard-identity file at project root (not cwd — hook subprocess cwd may differ)
  const identityPath = join(resolveIdentityDir(), '.agentguard-identity');
  try {
    const content = readFileSync(identityPath, 'utf8').trim();
    if (content) return content;
  } catch {
    // File doesn't exist or unreadable
  }

  // 2. Check env var
  const envName = process.env.AGENTGUARD_AGENT_NAME;
  if (envName) return envName;

  return null;
}

function writeIdentityFile(name: string): void {
  const identityPath = join(resolveIdentityDir(), '.agentguard-identity');
  try {
    writeFileSync(identityPath, name);
  } catch {
    // Non-fatal
  }
}

/**
 * Build the identity wizard prompt shown when .agentguard-identity is missing.
 * Auto-detects driver/model and presents a structured prompt so the agent can
 * ask the user and write the identity file.
 */
function buildIdentityWizardPrompt(driver: Driver, model: string, suggested: string): string {
  const roles = VALID_ROLES.join(', ');
  return [
    'AgentGuard Identity Setup',
    '═════════════════════════',
    '',
    'No agent identity found. Ask the user for their identity, then write it to .agentguard-identity in the project root.',
    '',
    'Auto-detected:',
    `  Driver: ${driver}`,
    `  Model:  ${model}`,
    '',
    `Suggested default: ${suggested}`,
    '',
    'Format: <driver>:<user-or-model>:<role>',
    `  Roles: ${roles}`,
    '  Examples: claude-code:opus:developer, human:jared:reviewer, ci:github-actions:ops',
    '',
    'Ask the user:',
    `  "AgentGuard needs an identity for this session. I detected ${driver}:${model}. What identity should I use? (default: ${suggested})"`,
    '',
    'Then write their answer (or the default) to .agentguard-identity in the project root.',
  ].join('\n');
}

/** Resolve the CLI command — use local bin.js if in the agentguard dev repo, else bare `agentguard`. */
function resolveCliCommand(): string {
  const mainRoot = resolveMainRepoRoot();
  const localBin = join(mainRoot, 'apps', 'cli', 'dist', 'bin.js');
  if (existsSync(localBin)) return `node ${localBin}`;
  return 'agentguard';
}

export async function claudeHook(hookType?: string, extraArgs: string[] = []): Promise<void> {
  // Load AGENTGUARD_* env vars from the project's .env file before anything reads them.
  // This is the canonical way to configure the API key — no secrets in hook commands or global config.
  loadProjectEnv();

  try {
    // Stop hook has no stdin payload — generates session viewer HTML quietly (no browser open)
    if (hookType === 'stop') {
      await handleStop(extraArgs);
      process.exit(0);
      return;
    }

    // Notification hook — fires when the agent pauses for human input.
    // Auto-opens the session viewer in the browser so the user can review governance decisions.
    if (hookType === 'notify') {
      await handleNotification(extraArgs);
      process.exit(0);
      return;
    }

    const input = await readStdin();
    if (!input) process.exit(0);

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(input) as Record<string, unknown>;
    } catch {
      process.exit(0);
      return;
    }

    // Determine hook type: explicit CLI arg > payload field > inference from tool_output
    const isPreToolUse =
      hookType === 'pre' || data.hook === 'PreToolUse' || (!hookType && !data.tool_output);

    if (isPreToolUse) {
      // Agent identity — wizard prompt on first miss.
      // Fresh worktrees/clones won't have .agentguard-identity (gitignored).
      // We auto-detect what we can and prompt the agent to confirm via a wizard,
      // while allowing writes to the identity file so the agent can set it.
      const agentIdentity = resolveAgentIdentity();
      if (!agentIdentity) {
        // Allow writes targeting .agentguard-identity — the agent needs to set it.
        const toolInput = (data.tool_input || {}) as Record<string, unknown>;
        const isIdentityWrite =
          ((data.tool_name === 'Write' || data.tool_name === 'Edit') &&
            typeof toolInput.file_path === 'string' &&
            toolInput.file_path.replace(/\\/g, '/').endsWith('.agentguard-identity')) ||
          (data.tool_name === 'Bash' &&
            typeof toolInput.command === 'string' &&
            toolInput.command.includes('.agentguard-identity'));

        if (isIdentityWrite) {
          process.exit(0);
          return;
        }

        // Auto-detect driver and model from environment
        const detected: { driver: Driver; model: string } = {
          driver: detectDriver(),
          model: detectModel(),
        };
        const suggestedDefault = `${detected.driver}:${detected.model}:developer`;

        process.stdout.write(
          JSON.stringify({
            decision: 'block',
            reason: buildIdentityWizardPrompt(detected.driver, detected.model, suggestedDefault),
          })
        );
        process.exit(2);
        return;
      }
      if (process.env.AGENTGUARD_AGENT_NAME) {
        writeIdentityFile(agentIdentity);
      }

      // Resolve session_id: payload field > environment variable > undefined
      const sessionId =
        (data.session_id as string | undefined) || process.env.CLAUDE_SESSION_ID || undefined;

      // Detect parent/child session relationship via root session marker.
      const rootSessionPath = join(resolveIdentityDir(), '.agentguard-root-session');
      let parentSessionId: string | undefined;

      if (sessionId) {
        try {
          const lines = readFileSync(rootSessionPath, 'utf8').trim().split('\n');
          const existingSessionId = lines[0];
          const existingPid = parseInt(lines[1], 10);

          if (existingSessionId && existingSessionId !== sessionId) {
            if (isProcessAlive(existingPid)) {
              parentSessionId = existingSessionId;
            }
          }
        } catch {
          // File doesn't exist → first (root) session
        }

        if (!parentSessionId) {
          try {
            writeFileSync(rootSessionPath, `${sessionId}\n${process.ppid}`);
          } catch {
            /* non-fatal */
          }
        }
      }

      try {
        const payload = { ...data, session_id: sessionId } as unknown as ClaudeCodeHookPayload;
        const denied = await handlePreToolUse(payload, extraArgs, parentSessionId);
        // Exit code 2 tells Claude Code to block the action
        process.exit(denied ? 2 : 0);
      } catch (preErr) {
        // SECURITY: fail closed on PreToolUse — if the kernel crashes, block the action
        // rather than silently allowing it through.
        process.stderr.write(
          `[agentguard] PreToolUse hook error: ${preErr instanceof Error ? preErr.message : String(preErr)}\n`
        );
        process.stdout.write(
          JSON.stringify({
            decision: 'block',
            reason: `AgentGuard governance hook crashed: ${preErr instanceof Error ? preErr.message : 'unknown error'}. Action blocked for safety.`,
          })
        );
        process.exit(2);
      }
    } else {
      handlePostToolUse(data, extraArgs);
    }
  } catch {
    // PostToolUse/stdin parsing errors are non-fatal — fail open
  }
  process.exit(0);
}

/**
 * Extract the target file path from a hook payload for path-aware policy resolution.
 * Used to find the nearest agentguard.yaml when cwd differs from the project root.
 */
function extractTargetPath(payload: ClaudeCodeHookPayload): string | undefined {
  const input = payload.tool_input || {};

  // File tools have an explicit file_path
  if (input.file_path && typeof input.file_path === 'string') {
    return input.file_path;
  }

  // Glob/Grep have a path parameter
  if (input.path && typeof input.path === 'string') {
    return input.path;
  }

  // Bash: look for absolute paths in the command
  if (payload.tool_name === 'Bash' && typeof input.command === 'string') {
    // Match Unix or Windows absolute paths (avoid matching flags like --force)
    const match = input.command.match(/(?:^|\s)(\/(?!dev\/null)[^\s"']+|[A-Z]:\\[^\s"']+)/);
    if (match) return match[1];
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Go kernel fast-path — delegates policy evaluation to the Go binary when
// available. Returns { used: true, allowed: true } on fast-path allow,
// { used: true, allowed: false } on fast-path deny, or { used: false }
// when the Go binary is unavailable or errors (caller falls through to TS).
// ---------------------------------------------------------------------------

export interface GoFastPathResult {
  used: boolean;
  allowed?: boolean;
  reason?: string;
  suggestion?: string;
  correctedCommand?: string;
}

/**
 * Resolve the Go kernel binary path. Searches in order:
 * 1. AGENTGUARD_GO_BIN environment variable
 * 2. dist/go-bin/agentguard-go relative to the running CLI binary
 * 3. go/bin/agentguard-go in the repo (dev mode)
 */
export function resolveGoBinaryPath(): string | null {
  const envPath = process.env.AGENTGUARD_GO_BIN;
  if (envPath && existsSync(envPath)) return envPath;

  const ext = process.platform === 'win32' ? '.exe' : '';
  const binaryName = `agentguard-go${ext}`;

  // Relative to the running CLI script (works in npm install)
  try {
    const scriptDir = dirname(process.argv[1] ?? '');
    const distPath = join(scriptDir, 'go-bin', binaryName);
    if (existsSync(distPath)) return distPath;
  } catch {
    // process.argv[1] might not exist
  }

  // Dev mode: check go/bin/ in the repo
  try {
    const mainRoot = resolveMainRepoRoot();
    const devPath = join(mainRoot, 'go', 'bin', binaryName);
    if (existsSync(devPath)) return devPath;
  } catch {
    // Not in a repo
  }

  return null;
}

/**
 * Try Go kernel fast-path for policy evaluation.
 * Pre-resolves policies via TS (handles pack:/extends:), serializes to a temp
 * JSON file, and spawns the Go binary's `evaluate` command.
 */
export function tryGoFastPath(
  policyDefs: unknown[],
  payload: ClaudeCodeHookPayload
): GoFastPathResult {
  if (process.env.AGENTGUARD_SKIP_GO === '1') return { used: false };
  if (policyDefs.length === 0) return { used: false };

  const goBin = resolveGoBinaryPath();
  if (!goBin) return { used: false };

  // Build the action payload in the format Go's evaluate expects
  const toolInput = (payload.tool_input ?? {}) as Record<string, unknown>;
  const actionPayload = JSON.stringify({
    tool: payload.tool_name,
    input: toolInput,
  });

  // Write pre-resolved policies as a JSON policy file the Go binary can read.
  // We merge all resolved policies into a single document since Go's evaluate
  // command loads one policy file. Rules are concatenated in precedence order.
  const mergedPolicy = {
    id: 'ts-resolved',
    name: 'Pre-resolved policies',
    rules: (policyDefs as LoadedPolicy[]).flatMap((p) => p.rules ?? []),
    severity: Math.max(...(policyDefs as LoadedPolicy[]).map((p) => p.severity ?? 0)),
  };

  const tmpPolicyPath = join(tmpdir(), `agentguard-policy-${process.pid}-${Date.now()}.json`);

  try {
    writeFileSync(tmpPolicyPath, JSON.stringify(mergedPolicy), 'utf8');

    const goTimeoutMs = parseInt(process.env.AGENTGUARD_GO_TIMEOUT ?? '200', 10);
    const result = execFileSync(goBin, ['evaluate', '--policy', tmpPolicyPath], {
      input: actionPayload,
      encoding: 'utf8',
      timeout: goTimeoutMs,
      maxBuffer: 64 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const evalResult = JSON.parse(result) as {
      allowed: boolean;
      decision: string;
      reason?: string;
      suggestion?: string;
      correctedCommand?: string;
    };

    return {
      used: true,
      allowed: evalResult.allowed,
      reason: evalResult.reason,
      suggestion: evalResult.suggestion,
      correctedCommand: evalResult.correctedCommand,
    };
  } catch (err: unknown) {
    // Go binary returned exit code 2 (denied) — stdout still has the result
    if (
      err &&
      typeof err === 'object' &&
      'status' in err &&
      (err as { status: number }).status === 2 &&
      'stdout' in err
    ) {
      try {
        const evalResult = JSON.parse((err as { stdout: string }).stdout) as {
          allowed: boolean;
          reason?: string;
          suggestion?: string;
          correctedCommand?: string;
        };
        return {
          used: true,
          allowed: false,
          reason: evalResult.reason,
          suggestion: evalResult.suggestion,
          correctedCommand: evalResult.correctedCommand,
        };
      } catch {
        // Parse failure — fall through to TS
      }
    }
    // Any other error (binary crashed, timeout, parse error) — silent fallback to TS
    return { used: false };
  } finally {
    try {
      unlinkSync(tmpPolicyPath);
    } catch {
      // Cleanup failure is non-fatal
    }
  }
}

/** Returns true if the action was denied. */
async function handlePreToolUse(
  payload: ClaudeCodeHookPayload,
  cliArgs: string[],
  parentSessionId?: string
): Promise<boolean> {
  const { processClaudeCodeHook, formatHookResponse } = await import('@red-codes/adapters');
  const { createKernel } = await import('@red-codes/kernel');
  const { DEFAULT_INVARIANTS } = await import('@red-codes/invariants');
  const { loadPolicyDefs, findPolicyForPath } = await import('../policy-resolver.js');
  const { resolveStorageConfig, createStorageBundle } = await import('@red-codes/storage');

  // Ensure hook field is set
  const normalizedPayload: ClaudeCodeHookPayload = {
    ...payload,
    hook: 'PreToolUse',
  };

  // Extract target path for path-aware policy resolution.
  // This fixes the governance bypass when Claude Code runs from a parent directory.
  const targetPath = extractTargetPath(normalizedPayload);
  let projectRoot: string | undefined;

  // If we have a target path, try to find the project root and policy together (one walk-up)
  if (targetPath) {
    const policyResult = findPolicyForPath(targetPath);
    if (policyResult) {
      projectRoot = policyResult.projectRoot;
    }
  }

  // Load policy — when policies are loaded, default-deny applies (fail-closed).
  // When no policy file is found, default-deny is disabled (fail-open).
  let policyDefs: unknown[] = [];
  try {
    policyDefs = loadPolicyDefs(undefined, targetPath);
  } catch (policyErr) {
    // Policy loading failure is non-fatal — continue with no policy (fail-open)
    process.stderr.write(
      `agentguard: warning — no policy loaded (${policyErr instanceof Error ? policyErr.message : 'unknown error'}). All actions will be allowed.\n`
    );
  }

  // Read-only fast-exit: if this is a read-only tool and no policies loaded, skip kernel entirely.
  // Even with policies loaded, read-only tools use fail-open, so if Go denies only
  // because of default-deny (no matching rule), the TS kernel would allow anyway.
  if (READ_ONLY_TOOLS.has(normalizedPayload.tool_name) && policyDefs.length === 0) {
    return false;
  }

  // --- Go kernel fast-path: try the Go binary for policy evaluation (~2ms vs ~290ms) ---
  // If the Go binary is installed and policies loaded, delegate to it for fast evaluation.
  // On allow: return immediately (skip TS kernel entirely — massive perf win).
  // On deny: fall through to the TS kernel for full mode handling, formatting, and telemetry.
  if (policyDefs.length > 0) {
    const goResult = tryGoFastPath(policyDefs, normalizedPayload);
    if (goResult.used && goResult.allowed) {
      return false; // Action allowed by Go fast-path — not denied
    }
    // If Go denied or was not used, continue to TS kernel for full processing
  }

  // Generate run ID
  const runId = `hook_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 8)}`;

  // Resolve storage backend from CLI args (e.g. --store sqlite) or AGENTGUARD_STORE env var
  const storageConfig = resolveStorageConfig(cliArgs);
  let storage: Awaited<ReturnType<typeof createStorageBundle>> | null = null;
  let eventSink: import('@red-codes/core').EventSink | undefined;
  let decisionSink: import('@red-codes/core').DecisionSink | undefined;

  try {
    storage = await createStorageBundle(storageConfig);
    eventSink = storage.createEventSink(runId);
    decisionSink = storage.createDecisionSink(runId);
  } catch {
    // Sink creation failure is non-fatal
  }

  // Cloud telemetry — send governance events to the telemetry server so the
  // office-sim (and any dashboard) can visualize real agent activity.
  // Short-lived hook: we flush immediately after processing, not on an interval.
  let cloudSinks: CloudSinkBundle | null = null;
  try {
    const { createCloudSinks } = await import('@red-codes/telemetry');
    const { loadIdentity, resolveMode } = await import('@red-codes/telemetry-client');
    const identity = loadIdentity();
    const telemetryMode = resolveMode(identity);
    if (telemetryMode !== 'off') {
      const apiKey = process.env.AGENTGUARD_API_KEY ?? identity?.enrollment_token;
      // Use Claude Code's session_id for cloud run grouping so multiple hook
      // invocations within one session share a single governance run, rather
      // than creating hundreds of orphan runs.  Fall back to the per-hook
      // runId when no session_id is available (e.g. manual CLI usage).
      const cloudSessionId = payload.session_id || runId;
      cloudSinks = await createCloudSinks({
        mode: telemetryMode,
        serverUrl:
          process.env.AGENTGUARD_TELEMETRY_URL ??
          identity?.server_url ??
          'https://telemetry.agentguard.dev',
        runId: cloudSessionId,
        agentId: resolveAgentIdentity() ?? 'claude-code',
        installId: identity?.install_id,
        apiKey,
        flushIntervalMs: 0, // No interval — we flush manually before exit
        parentSessionId,
      });
    }
  } catch {
    // Cloud telemetry setup failure is non-fatal
  }

  // Build kernel — dryRun: true = evaluate policies/invariants only (no adapter execution).
  // Claude Code handles actual tool execution; the hook only governs (allow/deny).
  // Events and decision records are still emitted and persisted to the configured storage backend.
  //
  // Default-deny: when policies are loaded, unknown actions are denied (fail-closed).
  // When no policies exist, fail-open to avoid blocking users who haven't configured governance.
  const allEventSinks = [eventSink, cloudSinks?.eventSink].filter(
    Boolean
  ) as import('@red-codes/core').EventSink[];
  const allDecisionSinks = [decisionSink, cloudSinks?.decisionSink].filter(
    Boolean
  ) as import('@red-codes/core').DecisionSink[];

  // Optional JSONL streaming sink (for real-time tailing via `tail -f`)
  if (storageConfig.jsonlPath) {
    const { createJsonlEventSink, createJsonlDecisionSink } = await import('@red-codes/storage');
    allEventSinks.push(createJsonlEventSink(storageConfig.jsonlPath, runId));
    allDecisionSinks.push(createJsonlDecisionSink(storageConfig.jsonlPath, runId));
  }

  // Collect disabledInvariants from loaded policies (human-operator override).
  // Multiple policies may each disable different invariants — merge them all.
  const disabledIds = new Set<string>();
  for (const def of policyDefs) {
    const di = (def as LoadedPolicy).disabledInvariants;
    if (Array.isArray(di)) {
      for (const id of di) {
        disabledIds.add(id);
      }
    }
  }

  // Filter DEFAULT_INVARIANTS if any are disabled by policy.
  let invariants: typeof DEFAULT_INVARIANTS | undefined;
  if (disabledIds.size > 0) {
    invariants = DEFAULT_INVARIANTS.filter((inv) => !disabledIds.has(inv.id));
  }

  if (policyDefs.length === 0) {
    process.stderr.write(
      '[agentguard] WARNING: No policies loaded — running in fail-open mode. All unmatched actions will be allowed.\n'
    );
  }

  // Do NOT pass a manifest here. A manifest with empty grants would trigger capability
  // enforcement and deny ALL actions. The hook's role is policy/invariant enforcement,
  // not capability gating. Agent identity is tracked via the session table and events.

  const kernel = createKernel({
    runId,
    policyDefs,
    dryRun: true,
    evaluateOptions: {
      defaultDeny: policyDefs.length > 0 && !READ_ONLY_TOOLS.has(normalizedPayload.tool_name),
    },
    sinks: allEventSinks,
    decisionSinks: allDecisionSinks,
    ...(invariants ? { invariants } : {}),
  });

  // Record session in the sessions table (SQLite only).
  // Uses session_id from Claude Code so multiple hook invocations share one session row.
  const sessionKey = normalizedPayload.session_id || runId;
  if (storage?.sessions) {
    storage.sessions.start(sessionKey, 'claude-hook', {
      storageBackend: storageConfig.backend,
    });
  }

  // Resolve agent persona from environment variables.
  // Persona enriches telemetry and enables persona-based policy conditions.
  const { personaFromEnv: readPersonaFromEnv, resolvePersona } = await import('@red-codes/core');
  const envPersona = readPersonaFromEnv();
  const resolvedPersona = envPersona ? resolvePersona(undefined, envPersona) : undefined;

  const sessionState = readSessionState(normalizedPayload.session_id);

  // Inject session write log for commit-scope-guard invariant.
  // On git.commit, the kernel's invariant needs to know which files this session wrote.
  const enrichedState: Record<string, unknown> = { ...sessionState };
  if (sessionState.writtenFiles && sessionState.writtenFiles.length > 0) {
    enrichedState.sessionWrittenFiles = sessionState.writtenFiles;
  }

  const result = await processClaudeCodeHook(
    kernel,
    normalizedPayload,
    enrichedState,
    resolvedPersona,
    projectRoot
  );
  kernel.shutdown();

  // Track file writes in session state so commit-scope-guard knows what this session touched.
  const toolName = normalizedPayload.tool_name;
  if (
    result.allowed &&
    (toolName === 'Write' || toolName === 'Edit') &&
    normalizedPayload.tool_input?.file_path
  ) {
    const filePath = normalizedPayload.tool_input.file_path as string;
    const existing = sessionState.writtenFiles ?? [];
    if (!existing.includes(filePath)) {
      writeSessionState(normalizedPayload.session_id, {
        writtenFiles: [...existing, filePath],
      });
    }
  }

  // Flush cloud telemetry before exit — hook is short-lived so we can't rely on intervals.
  // Cap at 2s to avoid blocking the agent on network issues.
  if (cloudSinks) {
    try {
      const flushTimeout = new Promise<void>((resolve) => setTimeout(resolve, 2000));
      await Promise.race([cloudSinks.flush(), flushTimeout]);
    } catch {
      // Non-fatal
    }
    cloudSinks.stop();
  }

  // Close storage (important for SQLite to flush WAL)
  if (storage) {
    try {
      storage.close();
    } catch {
      // Non-fatal
    }
  }

  // If denied, route through the four enforcement modes: enforce, guide, educate, monitor.
  // Default to 'enforce' for backward compatibility — only users who explicitly set
  // mode in agentguard.yaml get alternative behavior.
  if (!result.allowed) {
    const { resolveInvariantMode } = await import('../mode-resolver.js');
    const { buildModeConfig } = await import('../policy-resolver.js');
    const modeConfig = buildModeConfig(policyDefs as LoadedPolicy[], projectRoot);
    const violations = result.decision?.violations ?? [];

    // Resolve the effective mode — if multiple violations, use the strictest
    let resolvedMode: import('@red-codes/core').EnforcementMode = 'enforce';
    if (violations.length > 0) {
      // Invariant violations — find the strictest mode across all violations
      const modeOrder = { enforce: 3, guide: 2, educate: 1, monitor: 0 } as const;
      let strictest: import('@red-codes/core').EnforcementMode = 'monitor';
      for (const v of violations) {
        const mode = resolveInvariantMode(v.invariantId, modeConfig);
        if (modeOrder[mode] > modeOrder[strictest]) {
          strictest = mode;
        }
      }
      resolvedMode = strictest;
    } else {
      // Policy rule denial (no invariant violations) — use top-level mode
      resolvedMode = resolveInvariantMode(null, modeConfig);
    }

    // --- Route by enforcement mode ---

    if (resolvedMode === 'guide') {
      // Guide mode: block with corrective suggestion, track retries
      const action = result.decision?.intent?.action ?? 'unknown';
      const policyId = result.decision?.decision?.matchedPolicy?.id ?? 'unknown';
      // Extract ruleIndex from trace (stable key — avoids depending on reason string)
      const trace = result.decision?.decision?.trace;
      const matchedTraceEntry = trace?.rulesEvaluated?.find(
        (r: { outcome: string }) => r.outcome === 'match'
      );
      const ruleIndex = matchedTraceEntry
        ? (matchedTraceEntry as { ruleIndex: number }).ruleIndex
        : 0;
      const retryKey = `${action}:${policyId}:${ruleIndex}`;

      const retryAttempt = getRetryCount(sessionState, retryKey) + 1;
      incrementRetry(sessionState, retryKey);
      writeSessionState(normalizedPayload.session_id, sessionState);

      const options: HookResponseOptions = { mode: 'guide', retryAttempt, maxRetries: 3 };
      const response = formatHookResponse(result, result.suggestion, options);
      if (response) {
        await new Promise<void>((resolve) => process.stdout.write(response, () => resolve()));
      }
      return true;
    }

    if (resolvedMode === 'educate') {
      // Educate mode: allow the action but inject suggestion context + capture lesson
      const options: HookResponseOptions = { mode: 'educate' };
      const response = formatHookResponse(result, result.suggestion, options);
      if (response) {
        await new Promise<void>((resolve) => process.stdout.write(response, () => resolve()));
      }

      // Capture lesson for agent memory
      try {
        const { generateLesson, mergeLesson, readLessonStore, writeLessonStore } =
          await import('@red-codes/kernel');
        const action = result.decision?.intent?.action ?? 'unknown';
        const reason = result.decision?.decision?.reason ?? 'Action flagged by governance';
        const squad = detectSquad(normalizedPayload as unknown as Record<string, unknown>);

        if (squad) {
          const toolInput = normalizedPayload.tool_input as Record<string, string> | undefined;
          const lesson = generateLesson({
            action,
            tool: normalizedPayload.tool_name,
            target: toolInput?.command ?? toolInput?.file_path ?? '',
            rule: reason,
            reason,
            suggestion: result.suggestion?.message,
            correctedCommand: result.suggestion?.correctedCommand,
            agentId: (sessionState.agentName as string) ?? 'unknown',
            squad,
          });

          const store = readLessonStore(projectRoot ?? '.', squad);
          const updated = mergeLesson(store, lesson);
          writeLessonStore(projectRoot ?? '.', squad, updated);
        }
      } catch {
        // Non-fatal — lesson capture should never block the action
      }

      return false;
    }

    if (resolvedMode === 'enforce') {
      // Enforce mode: hard block (existing behavior)
      const response = formatHookResponse(result);
      if (response) {
        await new Promise<void>((resolve) => process.stdout.write(response, () => resolve()));
      }
      return true;
    }

    // Monitor mode: warn to stderr but allow the action through
    if (violations.length > 0) {
      for (const v of violations) {
        process.stderr.write(
          `\u26A0 agentguard: ${v.invariantId} triggered \u2014 ${v.name} (monitor mode)\n`
        );
      }
    } else {
      const reason = result.decision?.decision?.reason ?? 'Action denied by policy';
      process.stderr.write(`\u26A0 agentguard: policy denied \u2014 ${reason} (monitor mode)\n`);
    }
    return false;
  }
  return false;
}

function handlePostToolUse(data: Record<string, unknown>, cliArgs: string[] = []): void {
  if (data.tool_name !== 'Bash') return;

  const output = (data.tool_output || {}) as Record<string, unknown>;
  const exitCode = (output.exit_code ?? output.exitCode ?? 0) as number;
  const stderr = (output.stderr || '') as string;
  const stdout = (output.stdout || '') as string;

  if (exitCode !== 0 && stderr.trim()) {
    process.stdout.write('\n');
    process.stdout.write(
      `  \x1b[1m\x1b[31mError detected:\x1b[0m ${stderr.trim().split('\n')[0].slice(0, 80)}\n`
    );
    process.stdout.write('\n');
  }

  // Extract command string — tool_input may be a string or {command: "..."} object
  const rawInput = data.tool_input;
  const toolInput: string =
    typeof rawInput === 'string'
      ? rawInput
      : typeof (rawInput as Record<string, unknown>)?.command === 'string'
        ? ((rawInput as Record<string, unknown>).command as string)
        : typeof data.command === 'string'
          ? data.command
          : '';

  // Track rtk-optimized commands (informational — for session viewer visibility)
  if (toolInput.startsWith('rtk ') || toolInput.includes('/rtk ')) {
    process.stderr.write(`  \x1b[36m\u26A1\x1b[0m rtk: token-optimized output\n`);
  }

  // Track format pass — when a Prettier/format command exits 0, record it for the session.
  // This satisfies the `requireFormat` policy condition on subsequent git.commit actions.
  const sessionId =
    (data.session_id as string | undefined) || process.env.CLAUDE_SESSION_ID || undefined;
  if (exitCode === 0 && sessionId) {
    const isFormatCmd =
      toolInput.includes('prettier') ||
      toolInput.includes('format:fix') ||
      toolInput.includes('format --write');
    if (isFormatCmd) {
      writeSessionState(sessionId, { formatPass: true });
    }
    const isTestCmd =
      toolInput.includes('vitest') || toolInput.includes('jest') || toolInput.includes('pnpm test');
    if (isTestCmd) {
      writeSessionState(sessionId, { testsPass: true });
    }
  }

  // Detect PR creation — suggest opening the session viewer
  const isPrCreate = toolInput.includes('gh pr create') || toolInput.includes('gh pr merge');
  if (isPrCreate && exitCode === 0 && stdout.trim()) {
    generateSessionViewerQuietly(cliArgs);
  }
}

function generateSessionViewerQuietly(cliArgs: string[]): void {
  try {
    const storeFlagIdx = cliArgs.indexOf('--store');
    const storeFlag = storeFlagIdx !== -1 ? ` --store ${cliArgs[storeFlagIdx + 1]}` : '';
    const dbPathIdx = cliArgs.indexOf('--db-path');
    const dbPathFlag = dbPathIdx !== -1 ? ` --db-path "${cliArgs[dbPathIdx + 1]}"` : '';
    const cli = resolveCliCommand();
    execSync(`${cli} session-viewer --last --no-open${storeFlag}${dbPathFlag}`, {
      stdio: 'ignore',
      timeout: 10000,
    });
    process.stderr.write(
      '\n  \x1b[36m\u2139\x1b[0m  PR detected — session viewer generated. Run \x1b[1magentguard session-viewer --last\x1b[0m to open.\n\n'
    );
  } catch {
    // Non-fatal — viewer generation is best-effort
  }
}

async function handleNotification(cliArgs: string[]): Promise<void> {
  // Agent paused for human input — open the session viewer in the browser.
  // If a live server is already running, skip — the live page polls for new data.
  // Otherwise, spawn a detached live server process so events stream in without hard refresh.
  try {
    const { detectLiveServer } = await import('./session-viewer.js');
    if (detectLiveServer() !== null) {
      return;
    }

    // Spawn the live server as a detached process so the hook can exit immediately.
    // The live server stays running and the browser page polls it for updates.
    const cli = resolveCliCommand();
    const storeFlagIdx = cliArgs.indexOf('--store');
    const storeFlag = storeFlagIdx !== -1 ? ['--store', cliArgs[storeFlagIdx + 1]] : [];
    const dbPathIdx = cliArgs.indexOf('--db-path');
    const dbPathFlag = dbPathIdx !== -1 ? ['--db-path', cliArgs[dbPathIdx + 1]] : [];

    const cliParts = cli.split(' ');
    const cmd = cliParts[0];
    const baseArgs = [
      ...cliParts.slice(1),
      'session-viewer',
      '--last',
      '--live',
      ...storeFlag,
      ...dbPathFlag,
    ];

    const child = spawn(cmd, baseArgs, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch {
    // Non-fatal — viewer generation is best-effort
  }
}

async function handleStop(cliArgs: string[]): Promise<void> {
  // Clean up root session marker if we're the root session
  try {
    const rootSessionPath = join(resolveIdentityDir(), '.agentguard-root-session');
    const content = readFileSync(rootSessionPath, 'utf8').trim();
    const storedSessionId = content.split('\n')[0];
    const currentSessionId = process.env.CLAUDE_SESSION_ID;
    if (currentSessionId && storedSessionId === currentSessionId) {
      unlinkSync(rootSessionPath);
    }
  } catch {
    /* non-fatal */
  }

  // On session end, generate the session viewer HTML quietly (no browser open).
  // If a live server is running, skip — it already has the latest data.
  try {
    const { detectLiveServer, sessionViewer } = await import('./session-viewer.js');
    if (detectLiveServer() !== null) {
      return;
    }
    const { resolveStorageConfig } = await import('@red-codes/storage');
    const storageConfig = resolveStorageConfig(cliArgs);
    await sessionViewer(['--last', '--no-open', ...cliArgs], storageConfig);
  } catch {
    // Non-fatal — viewer generation is best-effort
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      input += chunk;
    });
    process.stdin.on('end', () => resolve(input));
    process.stdin.on('error', () => resolve(''));
    if (process.stdin.isTTY) resolve('');
  });
}

// Note: Self-execution guard removed. In the esbuild bundle, all modules share one
// import.meta.url, so the guard always fired — racing with bin.ts's dispatcher,
// consuming stdin, and calling process.exit() before the real invocation could run.
// The CLI dispatcher (bin.ts) handles invocation via `case 'claude-hook':`.

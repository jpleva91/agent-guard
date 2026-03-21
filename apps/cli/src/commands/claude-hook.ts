// AgentGuard Claude Code hook — PreToolUse governance + PostToolUse error monitoring + Notification session viewer.
// PreToolUse: routes actions through the kernel for policy/invariant enforcement.
// PostToolUse: reports Bash stderr errors (informational only).
// Notification: auto-opens the session viewer when the agent pauses for human input.
// Stop: generates session viewer HTML (no browser open — Notification handles that).
// Always exits 0 — hooks must never fail.
// Supports both JSONL (default) and SQLite storage backends via --store flag or AGENTGUARD_STORE env var.

import { randomUUID } from 'node:crypto';
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, parse as parsePath } from 'node:path';
import { tmpdir } from 'node:os';
import type { ClaudeCodeHookPayload } from '@red-codes/adapters';
import type { LoadedPolicy } from '@red-codes/policy';
import { resolveMainRepoRoot } from '@red-codes/core';
import type { CloudSinkBundle } from '@red-codes/telemetry';

// --- Session state: persist formatPass/testsPass across hook invocations ----
// Each Claude Code session is stateless per hook call. We bridge this by writing
// a small JSON file keyed by session_id so format/test results from one call are
// visible to subsequent PreToolUse governance checks in the same session.

interface SessionState extends Record<string, unknown> {
  formatPass?: boolean;
  testsPass?: boolean;
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

/**
 * Load AGENTGUARD_* variables from the nearest .env file, walking up from cwd.
 * Only sets variables that are not already in process.env (env vars take precedence).
 * This allows the hook to pick up the API key from the project's .env without
 * hardcoding secrets in the hook command or global config files.
 */
function loadProjectEnv(): void {
  let dir = process.cwd();
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
      // Resolve session_id: payload field > environment variable > undefined
      const sessionId =
        (data.session_id as string | undefined) || process.env.CLAUDE_SESSION_ID || undefined;
      const payload = { ...data, session_id: sessionId } as unknown as ClaudeCodeHookPayload;
      const denied = await handlePreToolUse(payload, extraArgs);
      // Exit code 2 tells Claude Code to block the action
      process.exit(denied ? 2 : 0);
    } else {
      handlePostToolUse(data, extraArgs);
    }
  } catch {
    // Swallow all errors — hooks must never fail (fail-open)
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

/** Returns true if the action was denied. */
async function handlePreToolUse(
  payload: ClaudeCodeHookPayload,
  cliArgs: string[]
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
        agentId: 'claude-code',
        installId: identity?.install_id,
        apiKey,
        flushIntervalMs: 0, // No interval — we flush manually before exit
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

  const kernel = createKernel({
    runId,
    policyDefs,
    dryRun: true,
    evaluateOptions: { defaultDeny: policyDefs.length > 0 },
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

  const result = await processClaudeCodeHook(
    kernel,
    normalizedPayload,
    sessionState,
    resolvedPersona,
    projectRoot
  );
  kernel.shutdown();

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

  // If denied, output reason to stdout and signal the caller to exit with code 2
  if (!result.allowed) {
    // Resolve enforcement mode for each violation.
    // Default to 'enforce' for backward compatibility — only users who
    // explicitly set mode: monitor in agentguard.yaml get fail-open behavior.
    const { resolveInvariantMode } = await import('../mode-resolver.js');
    const { buildModeConfig } = await import('../policy-resolver.js');
    const modeConfig = buildModeConfig(policyDefs as LoadedPolicy[], projectRoot);
    const violations = result.decision?.violations ?? [];

    // Check if ANY violation requires enforcement
    let shouldEnforce = false;
    const monitorWarnings: string[] = [];

    if (violations.length > 0) {
      // Invariant violations — check each invariant's mode
      for (const v of violations) {
        const mode = resolveInvariantMode(v.invariantId, modeConfig);
        if (mode === 'enforce') {
          shouldEnforce = true;
          break;
        }
        monitorWarnings.push(
          `\u26A0 agentguard: ${v.invariantId} triggered \u2014 ${v.name} (monitor mode)`
        );
      }
    } else {
      // Policy rule denial (no invariant violations) — use top-level mode
      const mode = resolveInvariantMode(null, modeConfig);
      if (mode === 'enforce') {
        shouldEnforce = true;
      } else {
        const reason = result.decision?.decision?.reason ?? 'Action denied by policy';
        monitorWarnings.push(`\u26A0 agentguard: policy denied \u2014 ${reason} (monitor mode)`);
      }
    }

    if (shouldEnforce) {
      // Current behavior — block the action
      const response = formatHookResponse(result);
      if (response) {
        await new Promise<void>((resolve) => process.stdout.write(response, () => resolve()));
      }
      return true;
    }

    // Monitor mode — warn but allow
    for (const warning of monitorWarnings) {
      process.stderr.write(warning + '\n');
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

// AgentGuard Claude Code hook — PreToolUse governance + PostToolUse error monitoring + Notification session viewer.
// PreToolUse: routes actions through the kernel for policy/invariant enforcement.
// PostToolUse: reports Bash stderr errors (informational only).
// Notification: auto-opens the session viewer when the agent pauses for human input.
// Stop: generates session viewer HTML (no browser open — Notification handles that).
// Always exits 0 — hooks must never fail.
// Supports both JSONL (default) and SQLite storage backends via --store flag or AGENTGUARD_STORE env var.

import { randomUUID } from 'node:crypto';
import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClaudeCodeHookPayload } from '@red-codes/adapters';
import { resolveMainRepoRoot } from '@red-codes/core';

/** Resolve the CLI command — use local bin.js if in the agentguard dev repo, else bare `agentguard`. */
function resolveCliCommand(): string {
  const mainRoot = resolveMainRepoRoot();
  const localBin = join(mainRoot, 'apps', 'cli', 'dist', 'bin.js');
  if (existsSync(localBin)) return `node ${localBin}`;
  return 'agentguard';
}

export async function claudeHook(hookType?: string, extraArgs: string[] = []): Promise<void> {
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

/** Returns true if the action was denied. */
async function handlePreToolUse(
  payload: ClaudeCodeHookPayload,
  cliArgs: string[]
): Promise<boolean> {
  const { processClaudeCodeHook, formatHookResponse } = await import('@red-codes/adapters');
  const { createKernel } = await import('@red-codes/kernel');
  const { loadPolicyDefs } = await import('../policy-resolver.js');
  const { resolveStorageConfig, createStorageBundle } = await import('@red-codes/storage');

  // Ensure hook field is set
  const normalizedPayload: ClaudeCodeHookPayload = {
    ...payload,
    hook: 'PreToolUse',
  };

  // Load policy (fail-open: empty policy if none found)
  let policyDefs: unknown[] = [];
  try {
    policyDefs = loadPolicyDefs();
  } catch (policyErr) {
    // Policy loading failure is non-fatal — continue with no policy (allow all)
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

  // Build kernel — dryRun: true = evaluate policies/invariants only (no adapter execution).
  // Claude Code handles actual tool execution; the hook only governs (allow/deny).
  // Events and decision records are still emitted and persisted to the configured storage backend.
  const kernel = createKernel({
    runId,
    policyDefs,
    dryRun: true,
    evaluateOptions: { defaultDeny: false },
    sinks: eventSink ? [eventSink] : [],
    decisionSinks: [decisionSink].filter(Boolean) as import('@red-codes/core').DecisionSink[],
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

  const result = await processClaudeCodeHook(kernel, normalizedPayload, {}, resolvedPersona);
  kernel.shutdown();

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
    const response = formatHookResponse(result);
    if (response) {
      process.stdout.write(response);
    }
    return true;
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

  // Track rtk-optimized commands (informational — for session viewer visibility)
  const toolInput = (data.tool_input || data.command || '') as string;
  if (toolInput.startsWith('rtk ') || toolInput.includes('/rtk ')) {
    process.stderr.write(`  \x1b[36m\u26A1\x1b[0m rtk: token-optimized output\n`);
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

// Entry point: when run directly via `node claude-hook.js pre|post`, invoke claudeHook().
// Without this, the file only exports the function and nothing executes.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const hookArg = process.argv[2]; // 'pre' or 'post'
  const extra = process.argv.slice(3); // e.g., ['--store', 'sqlite']
  claudeHook(hookArg, extra);
}

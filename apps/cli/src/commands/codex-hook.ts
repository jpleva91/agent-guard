// AgentGuard Codex CLI hook — PreToolUse governance + PostToolUse error monitoring.
// PreToolUse: routes actions through the kernel for policy/invariant enforcement.
// PostToolUse: reports bash stderr errors (informational only).
// Always exits 0 — hooks must never crash the agent.
// Supports both JSONL (default) and SQLite storage backends via --store flag or AGENTGUARD_STORE env var.
// Cloud telemetry: sends governance events to the AgentGuard dashboard when AGENTGUARD_API_KEY is set.

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, parse as parsePath } from 'node:path';
import { tmpdir } from 'node:os';
import type { CodexCliHookPayload } from '@red-codes/adapters';
import type { LoadedPolicy } from '@red-codes/policy';
import type { CloudSinkBundle } from '@red-codes/telemetry';
import { isBootstrapSafeAction, isModuleNotFoundError } from '../bootstrap.js';

// --- Session state: persist formatPass/testsPass/writtenFiles across hook invocations
// Codex CLI hooks are stateless per invocation. We bridge this by writing
// a JSON file keyed by session_id so file write tracking, format pass, and test
// pass results from one call are visible to subsequent PreToolUse governance checks.

interface CodexSessionState extends Record<string, unknown> {
  formatPass?: boolean;
  testsPass?: boolean;
  /** File paths written/modified in this session — for commit-scope-guard invariant */
  writtenFiles?: string[];
}

function sessionStatePath(sessionId: string): string {
  return join(tmpdir(), 'agentguard', `codex-session-${sessionId}.json`);
}

function readSessionState(sessionId: string | undefined): CodexSessionState {
  const key = sessionId || String(process.ppid) || 'default';
  try {
    return JSON.parse(readFileSync(sessionStatePath(key), 'utf8')) as CodexSessionState;
  } catch {
    return {};
  }
}

function writeSessionState(sessionId: string | undefined, patch: Partial<CodexSessionState>): void {
  const key = sessionId || String(process.ppid) || 'default';
  try {
    mkdirSync(join(tmpdir(), 'agentguard'), { recursive: true });
    const current = readSessionState(key);
    writeFileSync(sessionStatePath(key), JSON.stringify({ ...current, ...patch }));
  } catch {
    // Non-fatal
  }
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

/**
 * Extract the target file path from a Codex hook payload for path-aware policy resolution.
 * Used to find the nearest agentguard.yaml when cwd differs from the project root.
 * Codex CLI uses PascalCase tool names: Bash, Edit, Write, Read, Glob, Grep.
 * Codex toolArgs is a JSON string, not an object.
 */
function extractTargetPath(payload: CodexCliHookPayload): string | undefined {
  let args: Record<string, unknown> = {};
  try {
    if (payload.toolArgs) {
      args = JSON.parse(payload.toolArgs) as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }

  // File tools (Edit, Write, Read) have an explicit file_path
  if (args.file_path && typeof args.file_path === 'string') {
    return args.file_path;
  }

  // Also check path and filePath variants
  if (args.path && typeof args.path === 'string') {
    return args.path;
  }
  if (args.filePath && typeof args.filePath === 'string') {
    return args.filePath;
  }

  // Bash: look for absolute paths in the command
  if (payload.toolName === 'Bash' && typeof args.command === 'string') {
    // Match Unix or Windows absolute paths (avoid matching flags like --force)
    const match = args.command.match(/(?:^|\s)(\/(?!dev\/null)[^\s"']+|[A-Z]:\\[^\s"']+)/);
    if (match) return match[1];
  }

  return undefined;
}

export async function codexHook(hookType?: string, extraArgs: string[] = []): Promise<void> {
  // Load AGENTGUARD_* env vars from the project's .env file before anything reads them.
  loadProjectEnv();

  let data: Record<string, unknown> | undefined;
  try {
    const input = await readStdin();
    if (!input) process.exit(0);

    try {
      data = JSON.parse(input) as Record<string, unknown>;
    } catch {
      process.exit(0);
      return;
    }

    // Determine hook type: explicit CLI arg > inference from toolResult presence
    const isPreToolUse = hookType === 'pre' || (!hookType && !data.toolResult);

    if (isPreToolUse) {
      const payload = parseCodexPayload(data);
      const denied = await handlePreToolUse(payload, extraArgs);
      // Exit code 0 always — Codex CLI reads the JSON response for deny decisions
      if (denied) {
        process.exit(0);
      }
    } else {
      handlePostToolUse(data);
    }
  } catch (err) {
    // BOOTSTRAP AWARENESS (AgentGuardHQ/agentguard#995):
    // When kernel modules aren't built, warn instead of silently disabling governance.
    if (isModuleNotFoundError(err)) {
      const isSafe = data ? isBootstrapSafeAction(data) : true;
      process.stderr.write(
        `[agentguard] Bootstrap mode — kernel not built. ${isSafe ? 'Allowing bootstrap action.' : 'Governance inactive — allowing action (fail-open).'} Run: pnpm install && pnpm build\n`
      );
    }
    // Codex hooks always fail-open — never block the agent on hook errors
  }
  process.exit(0);
}

/** Parse raw JSON data into CodexCliHookPayload. */
function parseCodexPayload(data: Record<string, unknown>): CodexCliHookPayload {
  const sessionId =
    (data.sessionId as string | undefined) || process.env.CODEX_SESSION_ID || undefined;

  return {
    timestamp: data.timestamp as number | undefined,
    cwd: data.cwd as string | undefined,
    toolName: (data.toolName as string) || 'unknown',
    toolArgs: data.toolArgs as string | undefined,
    sessionId,
  };
}

/** Returns true if the action was denied. */
async function handlePreToolUse(payload: CodexCliHookPayload, cliArgs: string[]): Promise<boolean> {
  const { processCodexCliHook, formatCodexHookResponse } = await import('@red-codes/adapters');
  const { createKernel } = await import('@red-codes/kernel');
  const { DEFAULT_INVARIANTS } = await import('@red-codes/invariants');
  const { loadPolicyDefs, findPolicyForPath } = await import('../policy-resolver.js');
  const { resolveStorageConfig, createStorageBundle } = await import('@red-codes/storage');

  // Extract target path for path-aware policy resolution.
  // This fixes the governance bypass when Codex runs from a parent directory.
  const targetPath = extractTargetPath(payload);
  let projectRoot: string | undefined;

  // If we have a target path, try to find the project root and policy together (one walk-up)
  if (targetPath) {
    const policyResult = findPolicyForPath(targetPath);
    if (policyResult) {
      projectRoot = policyResult.projectRoot;
    }
  }

  // Load policy (fail-open: empty policy if none found)
  let policyDefs: unknown[] = [];
  try {
    policyDefs = loadPolicyDefs(undefined, targetPath);
  } catch (policyErr) {
    process.stderr.write(
      `agentguard: warning — no policy loaded (${policyErr instanceof Error ? policyErr.message : 'unknown error'}). All actions will be allowed.\n`
    );
  }

  // Generate run ID
  const runId = `hook_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 8)}`;

  // Resolve storage backend from CLI args or AGENTGUARD_STORE env var
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

  // Resolve agent identity early — used for both session tracking and cloud telemetry.
  const agentId = resolveAgentIdentity();

  // Cloud telemetry — send governance events to the telemetry server so the
  // dashboard can visualize Codex agent activity alongside Claude agent activity.
  // Short-lived hook: we flush immediately after processing, not on an interval.
  let cloudSinks: CloudSinkBundle | null = null;
  try {
    const { createCloudSinks } = await import('@red-codes/telemetry');
    const { loadIdentity, resolveMode } = await import('@red-codes/telemetry-client');
    const identity = loadIdentity();
    const telemetryMode = resolveMode(identity);
    if (telemetryMode !== 'off') {
      const apiKey = process.env.AGENTGUARD_API_KEY ?? identity?.enrollment_token;
      // Use Codex CLI's session_id for cloud run grouping so multiple hook
      // invocations within one session share a single governance run.
      const cloudSessionId = payload.sessionId || runId;
      cloudSinks = await createCloudSinks({
        mode: telemetryMode,
        serverUrl:
          process.env.AGENTGUARD_TELEMETRY_URL ??
          identity?.server_url ??
          'https://telemetry.agentguard.dev',
        runId: cloudSessionId,
        agentId: agentId ?? 'codex-cli',
        installId: identity?.install_id,
        apiKey,
        flushIntervalMs: 0, // No interval — we flush manually before exit
      });
    }
  } catch {
    // Cloud telemetry setup failure is non-fatal
  }

  // Build kernel — dryRun: true = evaluate policies/invariants only (no adapter execution).
  // Codex CLI handles actual tool execution; the hook only governs (allow/deny).
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
  const sessionKey = payload.sessionId || runId;
  if (storage?.sessions) {
    storage.sessions.start(sessionKey, 'codex-hook', {
      storageBackend: storageConfig.backend,
      agentId: agentId ?? undefined,
    });
  }

  // Resolve agent persona from environment variables.
  const { personaFromEnv: readPersonaFromEnv, resolvePersona } = await import('@red-codes/core');
  const envPersona = readPersonaFromEnv();
  const resolvedPersona = envPersona ? resolvePersona(undefined, envPersona) : undefined;

  // Inject session state for governance context.
  // Includes writtenFiles (for commit-scope-guard), formatPass, and testsPass.
  const sessionState = readSessionState(payload.sessionId);
  const enrichedState: Record<string, unknown> = { ...sessionState };
  if (sessionState.writtenFiles && sessionState.writtenFiles.length > 0) {
    enrichedState.sessionWrittenFiles = sessionState.writtenFiles;
  }

  const result = await processCodexCliHook(kernel, payload, enrichedState, resolvedPersona);
  kernel.shutdown();

  // Track file writes in session state so commit-scope-guard knows what this session touched.
  // Codex tool names: 'Edit', 'Write' (PascalCase)
  if (result.allowed && (payload.toolName === 'Edit' || payload.toolName === 'Write')) {
    let filePath: string | undefined;
    try {
      const args = payload.toolArgs ? JSON.parse(payload.toolArgs) : {};
      filePath = args.file_path || args.path || args.filePath;
    } catch {
      // toolArgs parse failure — skip tracking
    }
    if (filePath) {
      const existing = sessionState.writtenFiles ?? [];
      if (!existing.includes(filePath)) {
        writeSessionState(payload.sessionId, { writtenFiles: [...existing, filePath] });
      }
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

  // If denied, resolve enforcement mode for each violation.
  // Default to 'enforce' for backward compatibility — only users who
  // explicitly set mode: monitor in agentguard.yaml get fail-open behavior.
  if (!result.allowed) {
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
      // Hard deny — output the deny response to stdout as JSON
      const response = formatCodexHookResponse(result);
      if (response) {
        process.stdout.write(response);
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

function handlePostToolUse(data: Record<string, unknown>): void {
  const toolName = (data.toolName as string) || '';
  if (toolName !== 'Bash') return;

  const toolResult = (data.toolResult || {}) as Record<string, unknown>;
  const resultType = (toolResult.resultType || '') as string;
  const textResult = (toolResult.textResultForLlm || '') as string;
  const exitCode = (toolResult.exitCode ?? toolResult.exit_code ?? -1) as number;

  if (resultType === 'failure' && textResult.trim()) {
    process.stderr.write('\n');
    process.stderr.write(
      `  \x1b[1m\x1b[31mError detected:\x1b[0m ${textResult.trim().split('\n')[0].slice(0, 80)}\n`
    );
    process.stderr.write('\n');
  }

  // Extract command string from toolArgs (JSON string in Codex payloads)
  let toolInput = '';
  try {
    const rawArgs = data.toolArgs as string | undefined;
    if (rawArgs) {
      const parsed = JSON.parse(rawArgs) as Record<string, unknown>;
      if (typeof parsed.command === 'string') {
        toolInput = parsed.command;
      }
    }
  } catch {
    // toolArgs parse failure — skip tracking
  }

  // Track format pass — when a Prettier/format command exits 0, record it for the session.
  // This satisfies the `requireFormat` policy condition on subsequent git.commit actions.
  const sessionId =
    (data.sessionId as string | undefined) || process.env.CODEX_SESSION_ID || undefined;
  const resolvedExitCode = exitCode !== -1 ? exitCode : resultType === 'failure' ? 1 : 0;

  if (resolvedExitCode === 0 && sessionId) {
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

/** Resolve agent identity from .agentguard-identity file or AGENTGUARD_AGENT_NAME env var. */
function resolveAgentIdentity(): string | null {
  // 1. Check env var (set by run-codex-agent.sh and run-agent.sh)
  const envName = process.env.AGENTGUARD_AGENT_NAME;
  if (envName) return envName;

  // 2. Check .agentguard-identity file at workspace root or cwd
  const roots = [process.env.AGENTGUARD_WORKSPACE, process.cwd()].filter(Boolean) as string[];
  for (const root of roots) {
    try {
      const content = readFileSync(join(root, '.agentguard-identity'), 'utf8').trim();
      if (content) return content;
    } catch {
      // File doesn't exist or unreadable
    }
  }

  return null;
}

// NOTE: No direct entry point here. When bundled by esbuild into bin.js,
// import.meta.url matches bin.js — causing a false-positive that steals stdin
// before the CLI router invokes codexHook(). All invocations go through
// the CLI router in bin.ts: `case "codex-hook": codexHook(args[1], ...)`

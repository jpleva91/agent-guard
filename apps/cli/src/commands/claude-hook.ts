// AgentGuard Claude Code hook — PreToolUse governance + PostToolUse error monitoring.
// PreToolUse: routes actions through the kernel for policy/invariant enforcement.
// PostToolUse: reports Bash stderr errors (informational only).
// Always exits 0 — hooks must never fail.
// Supports both JSONL (default) and SQLite storage backends via --store flag or AGENTGUARD_STORE env var.

import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { ClaudeCodeHookPayload } from '@red-codes/adapters';

export async function claudeHook(hookType?: string, extraArgs: string[] = []): Promise<void> {
  try {
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
      await handlePreToolUse(payload, extraArgs);
    } else {
      handlePostToolUse(data);
    }
  } catch {
    // Swallow all errors — hooks must never fail
  }
  process.exit(0);
}

async function handlePreToolUse(payload: ClaudeCodeHookPayload, cliArgs: string[]): Promise<void> {
  const { processClaudeCodeHook, formatHookResponse } =
    await import('@red-codes/adapters');
  const { createKernel } = await import('@red-codes/kernel');
  const { createTelemetryDecisionSink } = await import('@red-codes/telemetry');
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
  let telemetrySink: import('@red-codes/core').DecisionSink | undefined;

  try {
    storage = await createStorageBundle(storageConfig);
    eventSink = storage.createEventSink(runId);
    decisionSink = storage.createDecisionSink(runId);
    telemetrySink = createTelemetryDecisionSink();
  } catch {
    // Sink creation failure is non-fatal
  }

  // Build tracer with webhook trace backend when using webhook storage
  let tracer: import('@red-codes/telemetry').Tracer | undefined;
  if (storageConfig.backend === 'webhook') {
    const { createTracer } = await import('@red-codes/telemetry');
    const { createWebhookTraceBackend } = await import('@red-codes/storage');
    tracer = createTracer({
      backends: [
        createWebhookTraceBackend({
          url: storageConfig.webhookUrl ?? process.env.AGENTGUARD_WEBHOOK_URL ?? '',
          headers: storageConfig.webhookHeaders,
          batchSize: storageConfig.webhookBatchSize,
          flushIntervalMs: storageConfig.webhookFlushIntervalMs,
        }),
      ],
    });
  }

  // Build kernel — dryRun: true = evaluate policies/invariants only (no adapter execution).
  // Claude Code handles actual tool execution; the hook only governs (allow/deny).
  // Events and decision records are still emitted and persisted to the configured storage backend.
  const kernel = createKernel({
    runId,
    policyDefs,
    dryRun: true,
    sinks: eventSink ? [eventSink] : [],
    decisionSinks: [decisionSink, telemetrySink].filter(
      Boolean
    ) as import('@red-codes/core').DecisionSink[],
    tracer,
  });

  // Record session in the sessions table (SQLite only).
  // Uses session_id from Claude Code so multiple hook invocations share one session row.
  const sessionKey = normalizedPayload.session_id || runId;
  if (storage?.sessions) {
    storage.sessions.start(sessionKey, 'claude-hook', {
      storageBackend: storageConfig.backend,
    });
  }

  const result = await processClaudeCodeHook(kernel, normalizedPayload);
  kernel.shutdown();

  // Close storage (important for SQLite to flush WAL)
  if (storage) {
    try {
      storage.close();
    } catch {
      // Non-fatal
    }
  }

  // If denied, output to stdout — this tells Claude Code to block the action
  if (!result.allowed) {
    const response = formatHookResponse(result);
    if (response) {
      process.stdout.write(response);
    }
  }
}

function handlePostToolUse(data: Record<string, unknown>): void {
  if (data.tool_name !== 'Bash') return;

  const output = (data.tool_output || {}) as Record<string, unknown>;
  const exitCode = (output.exit_code ?? output.exitCode ?? 0) as number;
  const stderr = (output.stderr || '') as string;

  if (exitCode !== 0 && stderr.trim()) {
    process.stdout.write('\n');
    process.stdout.write(
      `  \x1b[1m\x1b[31mError detected:\x1b[0m ${stderr.trim().split('\n')[0].slice(0, 80)}\n`
    );
    process.stdout.write('\n');
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

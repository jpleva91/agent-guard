// AgentGuard Claude Code hook — PreToolUse governance + PostToolUse error monitoring.
// PreToolUse: routes actions through the kernel for policy/invariant enforcement.
// PostToolUse: reports Bash stderr errors (informational only).
// Always exits 0 — hooks must never fail.
// Supports both JSONL (default) and SQLite storage backends via AGENTGUARD_STORE env var.

import type { ClaudeCodeHookPayload } from '../../adapters/claude-code.js';

export async function claudeHook(hookType?: string): Promise<void> {
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
      await handlePreToolUse(payload);
    } else {
      handlePostToolUse(data);
    }
  } catch {
    // Swallow all errors — hooks must never fail
  }
  process.exit(0);
}

async function handlePreToolUse(payload: ClaudeCodeHookPayload): Promise<void> {
  const { processClaudeCodeHook, formatHookResponse } =
    await import('../../adapters/claude-code.js');
  const { createKernel } = await import('../../kernel/kernel.js');
  const { createTelemetryDecisionSink } = await import('../../telemetry/runtimeLogger.js');
  const { loadPolicyDefs } = await import('../policy-resolver.js');
  const { resolveStorageConfig, createStorageBundle } = await import('../../storage/factory.js');

  // Ensure hook field is set
  const normalizedPayload: ClaudeCodeHookPayload = {
    ...payload,
    hook: 'PreToolUse',
  };

  // Load policy (fail-open: empty policy if none found)
  let policyDefs: unknown[] = [];
  try {
    policyDefs = loadPolicyDefs();
  } catch {
    // Policy loading failure is non-fatal — continue with no policy (allow all)
  }

  // Generate run ID
  const runId = `hook_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Resolve storage backend from env/CLI args and create sinks via factory
  const storageConfig = resolveStorageConfig([]);
  let storage: Awaited<ReturnType<typeof createStorageBundle>> | null = null;
  let eventSink: import('../../kernel/kernel.js').EventSink | undefined;
  let decisionSink: import('../../kernel/decisions/types.js').DecisionSink | undefined;
  let telemetrySink: import('../../kernel/decisions/types.js').DecisionSink | undefined;

  try {
    storage = await createStorageBundle(storageConfig);
    eventSink = storage.createEventSink(runId);
    decisionSink = storage.createDecisionSink(runId);
    telemetrySink = createTelemetryDecisionSink();
  } catch {
    // Sink creation failure is non-fatal
  }

  // Build kernel — dryRun: true because Claude Code handles execution
  const kernel = createKernel({
    runId,
    policyDefs,
    dryRun: true,
    sinks: eventSink ? [eventSink] : [],
    decisionSinks: [decisionSink, telemetrySink].filter(
      Boolean
    ) as import('../../kernel/decisions/types.js').DecisionSink[],
  });

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

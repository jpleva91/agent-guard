// AgentGuard Copilot CLI hook — preToolUse governance + postToolUse error monitoring.
// preToolUse: routes actions through the kernel for policy/invariant enforcement.
// postToolUse: reports bash/powershell stderr errors (informational only).
// Always exits 0 — hooks must never crash the agent.
// Supports both JSONL (default) and SQLite storage backends via --store flag or AGENTGUARD_STORE env var.

import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { CopilotCliHookPayload } from '@red-codes/adapters';

export async function copilotHook(hookType?: string, extraArgs: string[] = []): Promise<void> {
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

    // Determine hook type: explicit CLI arg > inference from toolResult presence
    const isPreToolUse = hookType === 'pre' || (!hookType && !data.toolResult);

    if (isPreToolUse) {
      const payload = parseCopilotPayload(data);
      const denied = await handlePreToolUse(payload, extraArgs);
      // Exit code 0 always — Copilot CLI reads the JSON response for deny decisions
      if (denied) {
        process.exit(0);
      }
    } else {
      handlePostToolUse(data);
    }
  } catch {
    // Swallow all errors — hooks must never fail (fail-open)
  }
  process.exit(0);
}

/** Parse raw JSON data into CopilotCliHookPayload. */
function parseCopilotPayload(data: Record<string, unknown>): CopilotCliHookPayload {
  const sessionId =
    (data.sessionId as string | undefined) || process.env.COPILOT_SESSION_ID || undefined;

  return {
    timestamp: data.timestamp as number | undefined,
    cwd: data.cwd as string | undefined,
    toolName: (data.toolName as string) || 'unknown',
    toolArgs: data.toolArgs as string | undefined,
    sessionId,
  };
}

/** Returns true if the action was denied. */
async function handlePreToolUse(
  payload: CopilotCliHookPayload,
  cliArgs: string[]
): Promise<boolean> {
  const { processCopilotCliHook, formatCopilotHookResponse } = await import('@red-codes/adapters');
  const { createKernel } = await import('@red-codes/kernel');
  const { loadPolicyDefs } = await import('../policy-resolver.js');
  const { resolveStorageConfig, createStorageBundle } = await import('@red-codes/storage');

  // Load policy (fail-open: empty policy if none found)
  let policyDefs: unknown[] = [];
  try {
    policyDefs = loadPolicyDefs();
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

  // Build kernel — dryRun: true = evaluate policies/invariants only (no adapter execution).
  // Copilot CLI handles actual tool execution; the hook only governs (allow/deny).
  //
  // Default-deny: when policies are loaded, unknown actions are denied (fail-closed).
  // When no policies exist, fail-open to avoid blocking users who haven't configured governance.
  const kernel = createKernel({
    runId,
    policyDefs,
    dryRun: true,
    evaluateOptions: { defaultDeny: policyDefs.length > 0 },
    sinks: eventSink ? [eventSink] : [],
    decisionSinks: [decisionSink].filter(Boolean) as import('@red-codes/core').DecisionSink[],
  });

  // Record session in the sessions table (SQLite only).
  const sessionKey = payload.sessionId || runId;
  if (storage?.sessions) {
    storage.sessions.start(sessionKey, 'copilot-hook', {
      storageBackend: storageConfig.backend,
    });
  }

  // Resolve agent persona from environment variables.
  const { personaFromEnv: readPersonaFromEnv, resolvePersona } = await import('@red-codes/core');
  const envPersona = readPersonaFromEnv();
  const resolvedPersona = envPersona ? resolvePersona(undefined, envPersona) : undefined;

  const result = await processCopilotCliHook(kernel, payload, {}, resolvedPersona);
  kernel.shutdown();

  // Close storage (important for SQLite to flush WAL)
  if (storage) {
    try {
      storage.close();
    } catch {
      // Non-fatal
    }
  }

  // If denied, output the deny response to stdout
  if (!result.allowed) {
    const response = formatCopilotHookResponse(result);
    if (response) {
      process.stdout.write(response);
    }
    return true;
  }
  return false;
}

function handlePostToolUse(data: Record<string, unknown>): void {
  const toolName = (data.toolName as string) || '';
  if (toolName !== 'bash' && toolName !== 'powershell') return;

  const toolResult = (data.toolResult || {}) as Record<string, unknown>;
  const resultType = (toolResult.resultType || '') as string;
  const textResult = (toolResult.textResultForLlm || '') as string;

  if (resultType === 'failure' && textResult.trim()) {
    process.stderr.write('\n');
    process.stderr.write(
      `  \x1b[1m\x1b[31mError detected:\x1b[0m ${textResult.trim().split('\n')[0].slice(0, 80)}\n`
    );
    process.stderr.write('\n');
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

// Entry point: when run directly via `node copilot-hook.js pre|post`, invoke copilotHook().
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const hookArg = process.argv[2];
  const extra = process.argv.slice(3);
  copilotHook(hookArg, extra);
}

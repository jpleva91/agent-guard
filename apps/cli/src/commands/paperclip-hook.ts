// AgentGuard Paperclip hook — PreToolUse governance + PostToolUse error monitoring.
// PreToolUse: routes actions through the kernel for policy/invariant enforcement.
// PostToolUse: reports Bash stderr errors (informational only).
// Always exits 0 — hooks must never crash the agent.
// Supports both JSONL (default) and SQLite storage backends via --store flag or AGENTGUARD_STORE env var.
//
// Paperclip (https://github.com/paperclipai/paperclip) spawns agents with PAPERCLIP_* env vars.
// This hook reads those to enrich governance actions with orchestration context
// (company, project, agent role, budget state, workspace).

import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { PaperclipHookPayload, PaperclipContext } from '@red-codes/adapters';

export async function paperclipHook(hookType?: string, extraArgs: string[] = []): Promise<void> {
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
      const payload = parsePaperclipPayload(data);
      const denied = await handlePreToolUse(payload, extraArgs);
      // Exit code 2 tells the hook caller to block the action
      process.exit(denied ? 2 : 0);
    } else {
      handlePostToolUse(data);
    }
  } catch {
    // Swallow all errors — hooks must never fail (fail-open)
  }
  process.exit(0);
}

/** Parse raw JSON data into PaperclipHookPayload, enriching with PAPERCLIP_* env vars. */
function parsePaperclipPayload(data: Record<string, unknown>): PaperclipHookPayload {
  // Read Paperclip context from env vars (injected by Paperclip when spawning agents)
  const paperclipCtx: PaperclipContext = {};
  if (process.env.PAPERCLIP_WORKSPACE_ID) paperclipCtx.workspaceId = process.env.PAPERCLIP_WORKSPACE_ID;
  if (process.env.PAPERCLIP_COMPANY_ID) paperclipCtx.companyId = process.env.PAPERCLIP_COMPANY_ID;
  if (process.env.PAPERCLIP_AGENT_ID) paperclipCtx.agentId = process.env.PAPERCLIP_AGENT_ID;
  if (process.env.PAPERCLIP_PROJECT_ID) paperclipCtx.projectId = process.env.PAPERCLIP_PROJECT_ID;
  if (process.env.PAPERCLIP_RUN_ID) paperclipCtx.runId = process.env.PAPERCLIP_RUN_ID;
  if (process.env.PAPERCLIP_AGENT_ROLE) paperclipCtx.agentRole = process.env.PAPERCLIP_AGENT_ROLE;
  if (process.env.PAPERCLIP_BUDGET_REMAINING_CENTS) {
    const cents = parseInt(process.env.PAPERCLIP_BUDGET_REMAINING_CENTS, 10);
    if (Number.isFinite(cents)) paperclipCtx.budgetRemainingCents = cents;
  }

  // Merge inline paperclip context from payload with env vars (inline takes precedence)
  const inlineCtx = (data.paperclip || {}) as Record<string, unknown>;
  const mergedCtx: PaperclipContext = {
    ...paperclipCtx,
    ...(inlineCtx.workspaceId ? { workspaceId: String(inlineCtx.workspaceId) } : {}),
    ...(inlineCtx.companyId ? { companyId: String(inlineCtx.companyId) } : {}),
    ...(inlineCtx.agentId ? { agentId: String(inlineCtx.agentId) } : {}),
    ...(inlineCtx.projectId ? { projectId: String(inlineCtx.projectId) } : {}),
    ...(inlineCtx.runId ? { runId: String(inlineCtx.runId) } : {}),
    ...(inlineCtx.agentRole ? { agentRole: String(inlineCtx.agentRole) } : {}),
    ...(inlineCtx.budgetRemainingCents !== undefined
      ? { budgetRemainingCents: Number(inlineCtx.budgetRemainingCents) }
      : {}),
  };

  return {
    hook: (data.hook as 'PreToolUse' | 'PostToolUse') || 'PreToolUse',
    tool_name: (data.tool_name as string) || 'unknown',
    tool_input: data.tool_input as Record<string, unknown> | undefined,
    tool_output: data.tool_output as Record<string, unknown> | undefined,
    paperclip: Object.keys(mergedCtx).length > 0 ? mergedCtx : undefined,
  };
}

/** Returns true if the action was denied. */
async function handlePreToolUse(
  payload: PaperclipHookPayload,
  cliArgs: string[]
): Promise<boolean> {
  const { processPaperclipHook, formatPaperclipHookResponse } = await import(
    '@red-codes/adapters'
  );
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

  // Generate run ID — use Paperclip run ID when available for session correlation
  const paperclipRunId = payload.paperclip?.runId;
  const runId =
    paperclipRunId || `hook_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 8)}`;

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
  // The underlying agent runtime handles actual tool execution; the hook only governs (allow/deny).
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
    sinks: eventSink ? [eventSink] : [],
    decisionSinks: [decisionSink].filter(Boolean) as import('@red-codes/core').DecisionSink[],
  });

  // Record session in the sessions table (SQLite only).
  const sessionKey = paperclipRunId || runId;
  if (storage?.sessions) {
    storage.sessions.start(sessionKey, 'paperclip-hook', {
      storageBackend: storageConfig.backend,
    });
  }

  // Resolve agent persona from environment variables.
  const { personaFromEnv: readPersonaFromEnv, resolvePersona } = await import('@red-codes/core');
  const envPersona = readPersonaFromEnv();
  const resolvedPersona = envPersona ? resolvePersona(undefined, envPersona) : undefined;

  const result = await processPaperclipHook(kernel, payload, {}, resolvedPersona);
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
    const response = formatPaperclipHookResponse(result);
    if (response) {
      await new Promise<void>((resolve) => process.stdout.write(response, () => resolve()));
    }
    return true;
  }
  return false;
}

function handlePostToolUse(data: Record<string, unknown>): void {
  const toolName = (data.tool_name as string) || '';
  if (toolName !== 'Bash' && toolName !== 'bash' && toolName !== 'shell') return;

  const toolOutput = (data.tool_output || {}) as Record<string, unknown>;
  const stderr = (toolOutput.stderr || '') as string;

  if (stderr.trim()) {
    process.stderr.write('\n');
    process.stderr.write(
      `  \x1b[1m\x1b[31mError detected:\x1b[0m ${stderr.trim().split('\n')[0].slice(0, 80)}\n`
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

// Entry point: when run directly via `node paperclip-hook.js pre|post`, invoke paperclipHook().
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const hookArg = process.argv[2];
  const extra = process.argv.slice(3);
  paperclipHook(hookArg, extra);
}

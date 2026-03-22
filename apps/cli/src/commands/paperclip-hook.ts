// AgentGuard Paperclip hook — PreToolUse governance + PostToolUse error monitoring.
// PreToolUse: routes actions through the kernel for policy/invariant enforcement.
// PostToolUse: reports Bash stderr errors (informational only).
// Always exits 0 — hooks must never fail. Exit 2 = governance deny (intentional block).
// Supports both JSONL (default) and SQLite storage backends via --store flag or AGENTGUARD_STORE env var.
//
// Paperclip (https://github.com/paperclipai/paperclip) spawns agents with PAPERCLIP_* env vars.
// This hook reads those to enrich governance actions with orchestration context
// (company, project, agent role, budget state, workspace).

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse as parsePath } from 'node:path';
import type { PaperclipContext, PaperclipHookPayload } from '@red-codes/adapters';

/**
 * Load AGENTGUARD_* env vars from the nearest .env file.
 * Walks up from cwd to find the first .env, loads only AGENTGUARD_* keys.
 * Existing env vars take precedence — .env is a fallback, not an override.
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
          if (!key.startsWith('AGENTGUARD_')) continue;
          if (process.env[key] !== undefined) continue;
          let value = trimmed.slice(eqIdx + 1).trim();
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          process.env[key] = value;
        }
      } catch {
        // Non-fatal
      }
      return;
    }
    dir = dirname(dir);
  }
}

/** Resolve agent identity from .agentguard-identity file or AGENTGUARD_AGENT_NAME env var. */
function resolveAgentIdentity(): string | null {
  const identityPath = join(process.cwd(), '.agentguard-identity');
  try {
    const content = readFileSync(identityPath, 'utf8').trim();
    if (content) return content;
  } catch {
    // File doesn't exist or unreadable
  }
  const envName = process.env.AGENTGUARD_AGENT_NAME;
  if (envName) return envName;
  return null;
}

export async function paperclipHook(hookType?: string, extraArgs: string[] = []): Promise<void> {
  // Load AGENTGUARD_* env vars from the project's .env file before anything reads them.
  loadProjectEnv();

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
      // Agent identity hard gate — block all actions until identity is set.
      // Exception: allow Write/Bash calls targeting .agentguard-identity so the agent
      // can prompt the user for their name and write it.
      const agentIdentity = resolveAgentIdentity();
      if (!agentIdentity) {
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

        process.stdout.write(
          JSON.stringify({
            decision: 'block',
            reason:
              'Agent identity not set. Write your agent name to .agentguard-identity or set AGENTGUARD_AGENT_NAME env var.',
          })
        );
        process.exit(2);
        return;
      }

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
  if (process.env.PAPERCLIP_WORKSPACE_ID)
    paperclipCtx.workspaceId = process.env.PAPERCLIP_WORKSPACE_ID;
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
    ...(inlineCtx.budgetRemainingCents !== undefined &&
    Number.isFinite(Number(inlineCtx.budgetRemainingCents))
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
  const { processPaperclipHook, formatPaperclipHookResponse } = await import('@red-codes/adapters');
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
  const exitCode = (toolOutput.exit_code ?? toolOutput.exitCode ?? 0) as number;
  const stderr = (toolOutput.stderr || '') as string;

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

// Note: Self-execution guard removed. In the esbuild bundle, all modules share one
// import.meta.url, so the guard always fired — racing with bin.ts's dispatcher,
// consuming stdin, and calling process.exit() before the real invocation could run.
// The CLI dispatcher (bin.ts) handles invocation via `case 'paperclip-hook':`.

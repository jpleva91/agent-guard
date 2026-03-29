// Codex CLI adapter — normalizes OpenAI Codex CLI hook payloads into kernel actions.
// Handles PreToolUse and PostToolUse hook events from Codex CLI's hooks.json system.
// Payload format: { timestamp, cwd, toolName, toolArgs (JSON string), toolResult? }
// Response format (PreToolUse only): { permissionDecision: 'allow'|'deny', permissionDecisionReason }

import type { RawAgentAction } from '@red-codes/kernel';
import { normalizeToActionContext } from '@red-codes/kernel';
import type { Kernel, KernelResult } from '@red-codes/kernel';
import type {
  AgentPersona,
  ActionContext,
  GovernanceEventEnvelope,
  DomainEvent,
  EnvelopePerformanceMetrics,
  Suggestion,
} from '@red-codes/core';
import type { HookResponseOptions } from './claude-code.js';
import { simpleHash, personaFromEnv } from '@red-codes/core';
import { createEnvelope } from '@red-codes/events';

export interface CodexCliHookPayload {
  timestamp?: number;
  cwd?: string;
  toolName: string;
  /** Codex CLI sends tool arguments as a JSON string */
  toolArgs?: string;
  /** Present only in PostToolUse payloads */
  toolResult?: {
    resultType?: string;
    textResultForLlm?: string;
    exitCode?: number;
  };
  /** Session identifier for audit correlation (from CODEX_SESSION_ID env var) */
  sessionId?: string;
}

/**
 * Parse the toolArgs JSON string into an object.
 * Codex CLI encodes tool arguments as a JSON string, not an object.
 */
function parseToolArgs(toolArgs?: string): Record<string, unknown> {
  if (!toolArgs || typeof toolArgs !== 'string') return {};
  try {
    const parsed = JSON.parse(toolArgs) as Record<string, unknown>;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Resolve a meaningful agent identity from the session ID.
 * Format: 'codex-cli' (no session) or 'codex-cli:<hash>' (with session).
 */
export function resolveCodexAgentIdentity(sessionId?: string): string {
  if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
    return 'codex-cli';
  }
  return `codex-cli:${simpleHash(sessionId.trim())}`;
}

/**
 * Normalize file paths for policy matching.
 * Convert absolute paths to relative (from cwd) so policy rules match correctly.
 */
function normalizeFilePath(filePath: string | undefined): string | undefined {
  if (!filePath) return filePath;

  const normalized = filePath.replace(/\\/g, '/');

  const isAbsolute = normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized);
  if (!isAbsolute) return normalized;

  const cwd = process.cwd().replace(/\\/g, '/');
  if (normalized.startsWith(cwd + '/')) {
    return normalized.slice(cwd.length + 1);
  }

  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

/**
 * Map Codex CLI tool names to AgentGuard canonical tool names.
 * Codex CLI already uses PascalCase tool names.
 */
const CODEX_TOOL_MAP: Record<string, string> = {
  Bash: 'Bash',
  Write: 'Write',
  Edit: 'Edit',
  Read: 'Read',
  Glob: 'Glob',
  Grep: 'Grep',
  WebFetch: 'WebFetch',
  Agent: 'Agent',
};

export function normalizeCodexCliAction(
  payload: CodexCliHookPayload,
  persona?: AgentPersona
): RawAgentAction {
  const args = parseToolArgs(payload.toolArgs);
  const sessionId = payload.sessionId || process.env.CODEX_SESSION_ID;
  const agent = resolveCodexAgentIdentity(sessionId);
  const envPersona = personaFromEnv();
  const resolvedPersona = persona || (envPersona as AgentPersona | undefined);

  // Map the Codex tool name to the canonical tool name
  const canonicalTool = CODEX_TOOL_MAP[payload.toolName] || payload.toolName;

  let baseAction: RawAgentAction;

  switch (payload.toolName) {
    case 'Write':
      baseAction = {
        tool: 'Write',
        file: normalizeFilePath(args.file_path as string | undefined),
        content: args.content as string | undefined,
        agent,
        metadata: { hook: 'PreToolUse', sessionId, source: 'codex-cli' },
      };
      break;

    case 'Edit':
      baseAction = {
        tool: 'Edit',
        file: normalizeFilePath(args.file_path as string | undefined),
        content: args.new_string as string | undefined,
        agent,
        metadata: {
          hook: 'PreToolUse',
          old_string: args.old_string,
          sessionId,
          source: 'codex-cli',
        },
      };
      break;

    case 'Read':
      baseAction = {
        tool: 'Read',
        file: normalizeFilePath(args.file_path as string | undefined),
        agent,
        metadata: { hook: 'PreToolUse', sessionId, source: 'codex-cli' },
      };
      break;

    case 'Bash': {
      const command = args.command as string | undefined;
      baseAction = {
        tool: 'Bash',
        command,
        target: command?.slice(0, 100),
        agent,
        metadata: {
          hook: 'PreToolUse',
          timeout: args.timeout,
          description: args.description,
          sessionId,
          source: 'codex-cli',
        },
      };
      break;
    }

    case 'Glob':
      baseAction = {
        tool: 'Glob',
        target: args.pattern as string | undefined,
        agent,
        metadata: { hook: 'PreToolUse', path: args.path, sessionId, source: 'codex-cli' },
      };
      break;

    case 'Grep':
      baseAction = {
        tool: 'Grep',
        target: args.pattern as string | undefined,
        agent,
        metadata: { hook: 'PreToolUse', path: args.path, sessionId, source: 'codex-cli' },
      };
      break;

    case 'WebFetch':
      baseAction = {
        tool: 'WebFetch',
        target: args.url as string | undefined,
        agent,
        metadata: { hook: 'PreToolUse', prompt: args.prompt, sessionId, source: 'codex-cli' },
      };
      break;

    case 'Agent':
      baseAction = {
        tool: 'Agent',
        target: (args.prompt as string | undefined)?.slice(0, 100),
        agent,
        metadata: { hook: 'PreToolUse', prompt: args.prompt, sessionId, source: 'codex-cli' },
      };
      break;

    default:
      // Unknown tool — pass through with canonical mapping if available
      baseAction = {
        tool: canonicalTool,
        agent,
        metadata: { hook: 'PreToolUse', input: args, sessionId, source: 'codex-cli' },
      };
      break;
  }

  if (resolvedPersona) {
    return { ...baseAction, persona: resolvedPersona };
  }
  return baseAction;
}

/**
 * Convert a Codex CLI hook payload directly into a vendor-neutral ActionContext.
 * This is the KE-2 adapter mapping: Codex tool-calls → ActionContext.
 */
export function codexToActionContext(
  payload: CodexCliHookPayload,
  persona?: AgentPersona
): ActionContext {
  const rawAction = normalizeCodexCliAction(payload, persona);
  return normalizeToActionContext(rawAction, 'codex-cli');
}

export async function processCodexCliHook(
  kernel: Kernel,
  payload: CodexCliHookPayload,
  systemContext: Record<string, unknown> = {},
  persona?: AgentPersona
): Promise<KernelResult> {
  // KE-2: Normalize to ActionContext at the adapter boundary
  const context = codexToActionContext(payload, persona);
  return kernel.propose(context, systemContext);
}

/**
 * Format kernel result as Codex CLI hook response.
 * Codex CLI PreToolUse hooks expect JSON on stdout with permissionDecision field.
 * Exit code 0 = success (hook ran); the JSON response controls allow/deny.
 *
 * Extended with optional `suggestion` and `options` params for corrective enforcement modes.
 * Backward compatible: calling with just `result` still works.
 */
export function formatCodexHookResponse(
  result: KernelResult,
  suggestion?: Suggestion | null,
  options?: HookResponseOptions
): string {
  const mode = options?.mode;

  // --- Educate mode: allow the action, write suggestion to stderr ---
  // Codex CLI has no additionalContext equivalent, so we emit to stderr as a warning.
  if (mode === 'educate' && suggestion) {
    const parts = [`[AgentGuard educate] ${suggestion.message}`];
    if (suggestion.correctedCommand) {
      parts.push(`Suggested command: ${suggestion.correctedCommand}`);
    }
    process.stderr.write(parts.join('\n') + '\n');
    // Return empty string = allow
    return '';
  }

  // --- Guide mode: block with corrective suggestion ---
  if (mode === 'guide' && !result.allowed) {
    const attempt = options?.retryAttempt ?? 0;
    const maxRetries = options?.maxRetries ?? 3;

    // Retry exhausted — hard block
    if (attempt > maxRetries) {
      return JSON.stringify({
        permissionDecision: 'deny',
        permissionDecisionReason: `Action blocked after ${attempt} correction attempts — ask the human for help`,
      });
    }

    const reason = result.decision?.decision?.reason ?? 'Action denied';
    const parts = [reason];
    if (suggestion) {
      parts.push(`Suggestion: ${suggestion.message}`);
      if (suggestion.correctedCommand) {
        parts.push(`Corrected command: ${suggestion.correctedCommand}`);
      }
    }
    parts.push(`(attempt ${attempt}/${maxRetries})`);

    return JSON.stringify({
      permissionDecision: 'deny',
      permissionDecisionReason: parts.join(' | '),
    });
  }

  // --- Enforce mode / Monitor mode / no options: existing behavior ---
  if (!result.allowed) {
    const reason = result.decision?.decision?.reason ?? 'Action denied by AgentGuard policy';
    const violations = result.decision?.violations ?? [];
    const parts = [reason];
    if (violations.length > 0) {
      parts.push(`Violations: ${violations.map((v: { name: string }) => v.name).join(', ')}`);
    }
    return JSON.stringify({
      permissionDecision: 'deny',
      permissionDecisionReason: parts.join(' | '),
    });
  }
  // Codex CLI: return empty string for allowed actions (no output = allow)
  return '';
}

/**
 * Wrap a DomainEvent in a GovernanceEventEnvelope with Codex CLI as the source.
 *
 * This is the KE-3 envelope producer for the Codex CLI adapter. All adapters
 * produce identical envelope structures — only the `source` field differs.
 */
export function codexCliToEnvelope(
  event: DomainEvent,
  options?: {
    policyVersion?: string | null;
    decisionCodes?: readonly string[];
    performanceMetrics?: EnvelopePerformanceMetrics;
  }
): GovernanceEventEnvelope {
  return createEnvelope(event, {
    source: 'codex-cli',
    policyVersion: options?.policyVersion,
    decisionCodes: options?.decisionCodes,
    performanceMetrics: options?.performanceMetrics,
  });
}

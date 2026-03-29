// Gemini CLI adapter — normalizes Google Gemini CLI hook payloads into kernel actions.
// Handles BeforeTool and AfterTool hook events from Gemini CLI's settings.json system.
// Payload format: { timestamp, cwd, toolName, tool_input (object), toolResult? }
// Response format (BeforeTool only): { decision: 'allow'|'deny', reason: '...' }

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

export interface GeminiCliHookPayload {
  timestamp?: number;
  cwd?: string;
  toolName: string;
  /** Gemini CLI sends tool arguments as an object, not a JSON string */
  tool_input?: Record<string, unknown>;
  /** Present only in AfterTool payloads */
  toolResult?: {
    resultType?: string;
    textResultForLlm?: string;
  };
  /** Session identifier for audit correlation (from GEMINI_SESSION_ID env var) */
  sessionId?: string;
}

/**
 * Resolve a meaningful agent identity from the session ID.
 * Format: 'gemini-cli' (no session) or 'gemini-cli:<hash>' (with session).
 */
export function resolveGeminiAgentIdentity(sessionId?: string): string {
  if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
    return 'gemini-cli';
  }
  return `gemini-cli:${simpleHash(sessionId.trim())}`;
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
 * Map Gemini CLI tool names to AgentGuard canonical tool names.
 * Gemini CLI uses its own naming conventions for tools.
 */
const GEMINI_TOOL_MAP: Record<string, string> = {
  Shell: 'Bash',
  WriteFile: 'Write',
  EditFile: 'Edit',
  ReadFile: 'Read',
  SearchCode: 'Grep',
  WebSearch: 'WebFetch',
  ListFiles: 'Glob',
};

export function normalizeGeminiCliAction(
  payload: GeminiCliHookPayload,
  persona?: AgentPersona
): RawAgentAction {
  const args = payload.tool_input ?? {};
  const sessionId = payload.sessionId || process.env.GEMINI_SESSION_ID;
  const agent = resolveGeminiAgentIdentity(sessionId);
  const envPersona = personaFromEnv();
  const resolvedPersona = persona || (envPersona as AgentPersona | undefined);

  // Map the Gemini tool name to the canonical tool name
  const canonicalTool = GEMINI_TOOL_MAP[payload.toolName] || payload.toolName;

  let baseAction: RawAgentAction;

  switch (payload.toolName) {
    case 'WriteFile':
      baseAction = {
        tool: 'Write',
        file: normalizeFilePath(args.file_path as string | undefined),
        content: args.content as string | undefined,
        agent,
        metadata: { hook: 'BeforeTool', sessionId, source: 'gemini-cli' },
      };
      break;

    case 'EditFile':
      baseAction = {
        tool: 'Edit',
        file: normalizeFilePath(args.file_path as string | undefined),
        content: args.new_string as string | undefined,
        agent,
        metadata: {
          hook: 'BeforeTool',
          old_string: args.old_string,
          sessionId,
          source: 'gemini-cli',
        },
      };
      break;

    case 'ReadFile':
      baseAction = {
        tool: 'Read',
        file: normalizeFilePath(args.file_path as string | undefined),
        agent,
        metadata: { hook: 'BeforeTool', sessionId, source: 'gemini-cli' },
      };
      break;

    case 'Shell': {
      const command = args.command as string | undefined;
      baseAction = {
        tool: 'Bash',
        command,
        target: command?.slice(0, 100),
        agent,
        metadata: {
          hook: 'BeforeTool',
          timeout: args.timeout,
          description: args.description,
          sessionId,
          source: 'gemini-cli',
        },
      };
      break;
    }

    case 'ListFiles':
      baseAction = {
        tool: 'Glob',
        target: args.pattern as string | undefined,
        agent,
        metadata: { hook: 'BeforeTool', path: args.path, sessionId, source: 'gemini-cli' },
      };
      break;

    case 'SearchCode':
      baseAction = {
        tool: 'Grep',
        target: args.pattern as string | undefined,
        agent,
        metadata: { hook: 'BeforeTool', path: args.path, sessionId, source: 'gemini-cli' },
      };
      break;

    case 'WebSearch':
      baseAction = {
        tool: 'WebFetch',
        target: args.url as string | undefined,
        agent,
        metadata: { hook: 'BeforeTool', query: args.query, sessionId, source: 'gemini-cli' },
      };
      break;

    default:
      // Unknown tool — pass through with canonical mapping if available
      baseAction = {
        tool: canonicalTool,
        agent,
        metadata: { hook: 'BeforeTool', input: args, sessionId, source: 'gemini-cli' },
      };
      break;
  }

  if (resolvedPersona) {
    return { ...baseAction, persona: resolvedPersona };
  }
  return baseAction;
}

/**
 * Convert a Gemini CLI hook payload directly into a vendor-neutral ActionContext.
 * This is the KE-2 adapter mapping: Gemini tool-calls → ActionContext.
 */
export function geminiToActionContext(
  payload: GeminiCliHookPayload,
  persona?: AgentPersona
): ActionContext {
  const rawAction = normalizeGeminiCliAction(payload, persona);
  return normalizeToActionContext(rawAction, 'gemini-cli');
}

export async function processGeminiCliHook(
  kernel: Kernel,
  payload: GeminiCliHookPayload,
  systemContext: Record<string, unknown> = {},
  persona?: AgentPersona
): Promise<KernelResult> {
  // KE-2: Normalize to ActionContext at the adapter boundary
  const context = geminiToActionContext(payload, persona);
  return kernel.propose(context, systemContext);
}

/**
 * Format kernel result as Gemini CLI hook response.
 * Gemini CLI BeforeTool hooks expect JSON on stdout with decision field.
 * Exit code 0 = success (hook ran); the JSON response controls allow/deny.
 *
 * Extended with optional `suggestion` and `options` params for corrective enforcement modes.
 * Backward compatible: calling with just `result` still works.
 */
export function formatGeminiHookResponse(
  result: KernelResult,
  suggestion?: Suggestion | null,
  options?: HookResponseOptions
): string {
  const mode = options?.mode;

  // --- Educate mode: allow the action, write suggestion to stderr ---
  // Gemini CLI has no additionalContext equivalent, so we emit to stderr as a warning.
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
        decision: 'deny',
        reason: `Action blocked after ${attempt} correction attempts — ask the human for help`,
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
      decision: 'deny',
      reason: parts.join(' | '),
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
      decision: 'deny',
      reason: parts.join(' | '),
    });
  }
  // Gemini CLI: return empty string for allowed actions (no output = allow)
  return '';
}

/**
 * Wrap a DomainEvent in a GovernanceEventEnvelope with Gemini CLI as the source.
 *
 * This is the KE-3 envelope producer for the Gemini CLI adapter. All adapters
 * produce identical envelope structures — only the `source` field differs.
 */
export function geminiCliToEnvelope(
  event: DomainEvent,
  options?: {
    policyVersion?: string | null;
    decisionCodes?: readonly string[];
    performanceMetrics?: EnvelopePerformanceMetrics;
  }
): GovernanceEventEnvelope {
  return createEnvelope(event, {
    source: 'gemini-cli',
    policyVersion: options?.policyVersion,
    decisionCodes: options?.decisionCodes,
    performanceMetrics: options?.performanceMetrics,
  });
}

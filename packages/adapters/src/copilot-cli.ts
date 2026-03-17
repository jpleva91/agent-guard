// Copilot CLI adapter — normalizes GitHub Copilot CLI hook payloads into kernel actions.
// Handles preToolUse and postToolUse hook events from Copilot CLI's hooks.json system.
// Payload format: { timestamp, cwd, toolName, toolArgs (JSON string), toolResult? }
// Response format (preToolUse only): { permissionDecision: 'allow'|'deny', permissionDecisionReason }

import type { RawAgentAction } from '@red-codes/kernel';
import type { Kernel, KernelResult } from '@red-codes/kernel';
import type { AgentPersona } from '@red-codes/core';
import { simpleHash, personaFromEnv } from '@red-codes/core';

export interface CopilotCliHookPayload {
  timestamp?: number;
  cwd?: string;
  toolName: string;
  /** Copilot CLI sends tool arguments as a JSON string */
  toolArgs?: string;
  /** Present only in postToolUse payloads */
  toolResult?: {
    resultType?: 'success' | 'failure' | 'denied';
    textResultForLlm?: string;
  };
  /** Session identifier for audit correlation (from COPILOT_SESSION_ID env var) */
  sessionId?: string;
}

/**
 * Parse the toolArgs JSON string into an object.
 * Copilot CLI encodes tool arguments as a JSON string, not an object.
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
 * Format: 'copilot-cli' (no session) or 'copilot-cli:<hash>' (with session).
 */
export function resolveCopilotAgentIdentity(sessionId?: string): string {
  if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
    return 'copilot-cli';
  }
  return `copilot-cli:${simpleHash(sessionId.trim())}`;
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
 * Map Copilot CLI tool names to AgentGuard canonical tool names.
 * Copilot CLI uses lowercase tool names; AgentGuard uses PascalCase internally.
 */
const COPILOT_TOOL_MAP: Record<string, string> = {
  bash: 'Bash',
  powershell: 'Bash', // Treat PowerShell as shell execution
  view: 'Read',
  edit: 'Edit',
  create: 'Write',
  glob: 'Glob',
  grep: 'Grep',
  web_fetch: 'WebFetch',
  task: 'Agent',
};

export function normalizeCopilotCliAction(
  payload: CopilotCliHookPayload,
  persona?: AgentPersona
): RawAgentAction {
  const args = parseToolArgs(payload.toolArgs);
  const sessionId = payload.sessionId || process.env.COPILOT_SESSION_ID;
  const agent = resolveCopilotAgentIdentity(sessionId);
  const envPersona = personaFromEnv();
  const resolvedPersona = persona || (envPersona as AgentPersona | undefined);

  // Map the Copilot tool name to the canonical tool name
  const canonicalTool = COPILOT_TOOL_MAP[payload.toolName] || payload.toolName;

  let baseAction: RawAgentAction;

  switch (payload.toolName) {
    case 'create':
      baseAction = {
        tool: 'Write',
        file: normalizeFilePath(args.file_path as string | undefined),
        content: args.content as string | undefined,
        agent,
        metadata: { hook: 'preToolUse', sessionId, source: 'copilot-cli' },
      };
      break;

    case 'edit':
      baseAction = {
        tool: 'Edit',
        file: normalizeFilePath(args.file_path as string | undefined),
        content: args.new_string as string | undefined,
        agent,
        metadata: {
          hook: 'preToolUse',
          old_string: args.old_string,
          sessionId,
          source: 'copilot-cli',
        },
      };
      break;

    case 'view':
      baseAction = {
        tool: 'Read',
        file: normalizeFilePath(args.file_path as string | undefined),
        agent,
        metadata: { hook: 'preToolUse', sessionId, source: 'copilot-cli' },
      };
      break;

    case 'bash':
    case 'powershell': {
      const command = args.command as string | undefined;
      baseAction = {
        tool: 'Bash',
        command,
        target: command?.slice(0, 100),
        agent,
        metadata: {
          hook: 'preToolUse',
          timeout: args.timeout,
          description: args.description,
          sessionId,
          source: 'copilot-cli',
          shell: payload.toolName,
        },
      };
      break;
    }

    case 'glob':
      baseAction = {
        tool: 'Glob',
        target: args.pattern as string | undefined,
        agent,
        metadata: { hook: 'preToolUse', path: args.path, sessionId, source: 'copilot-cli' },
      };
      break;

    case 'grep':
      baseAction = {
        tool: 'Grep',
        target: args.pattern as string | undefined,
        agent,
        metadata: { hook: 'preToolUse', path: args.path, sessionId, source: 'copilot-cli' },
      };
      break;

    case 'web_fetch':
      baseAction = {
        tool: 'WebFetch',
        target: args.url as string | undefined,
        agent,
        metadata: { hook: 'preToolUse', prompt: args.prompt, sessionId, source: 'copilot-cli' },
      };
      break;

    case 'task':
      baseAction = {
        tool: 'Agent',
        target: (args.prompt as string | undefined)?.slice(0, 100),
        agent,
        metadata: { hook: 'preToolUse', prompt: args.prompt, sessionId, source: 'copilot-cli' },
      };
      break;

    default:
      // Unknown tool — pass through with canonical mapping if available
      baseAction = {
        tool: canonicalTool,
        agent,
        metadata: { hook: 'preToolUse', input: args, sessionId, source: 'copilot-cli' },
      };
      break;
  }

  if (resolvedPersona) {
    return { ...baseAction, persona: resolvedPersona };
  }
  return baseAction;
}

export async function processCopilotCliHook(
  kernel: Kernel,
  payload: CopilotCliHookPayload,
  systemContext: Record<string, unknown> = {},
  persona?: AgentPersona
): Promise<KernelResult> {
  const rawAction = normalizeCopilotCliAction(payload, persona);
  return kernel.propose(rawAction, systemContext);
}

/**
 * Format kernel result as Copilot CLI hook response.
 * Copilot CLI preToolUse hooks expect JSON on stdout with permissionDecision field.
 * Exit code 0 = success (hook ran); the JSON response controls allow/deny.
 */
export function formatCopilotHookResponse(result: KernelResult): string {
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
  // Copilot CLI: return empty string for allowed actions (no output = allow)
  return '';
}

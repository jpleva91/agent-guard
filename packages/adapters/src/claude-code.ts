// Claude Code adapter — normalizes Claude Code hook payloads into kernel actions.
// Handles PreToolUse and PostToolUse hook events.
// Propagates agent session identity for audit correlation.

import type { RawAgentAction } from '@red-codes/kernel';
import type { Kernel, KernelResult } from '@red-codes/kernel';
import type { AgentPersona } from '@red-codes/core';
import { simpleHash, personaFromEnv } from '@red-codes/core';

export interface ClaudeCodeToolUse {
  tool_name: string;
  tool_input?: Record<string, unknown>;
  tool_output?: Record<string, unknown>;
}

export interface ClaudeCodeHookPayload {
  hook: 'PreToolUse' | 'PostToolUse';
  tool_name: string;
  tool_input?: Record<string, unknown>;
  tool_output?: Record<string, unknown>;
  /** Claude Code session identifier for agent identity propagation */
  session_id?: string;
}

/**
 * Resolve a meaningful agent identity from the session ID.
 * Format: 'claude-code' (no session) or 'claude-code:<hash>' (with session).
 */
export function resolveAgentIdentity(sessionId?: string): string {
  if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
    return 'claude-code';
  }
  return `claude-code:${simpleHash(sessionId.trim())}`;
}

/**
 * Normalize file paths for policy matching.
 * Claude Code sends absolute paths (e.g. C:\Users\...\project\.env).
 * Policy rules use relative paths (e.g. .env, .github/workflows/).
 * Convert absolute paths to relative (from cwd) so rules match correctly.
 */
function normalizeFilePath(filePath: string | undefined): string | undefined {
  if (!filePath) return filePath;

  // Normalize Windows backslashes to forward slashes
  const normalized = filePath.replace(/\\/g, '/');

  const isAbsolute = normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized);
  if (!isAbsolute) return normalized;

  // Convert to relative path from cwd
  const cwd = process.cwd().replace(/\\/g, '/');
  if (normalized.startsWith(cwd + '/')) {
    return normalized.slice(cwd.length + 1);
  }

  // Fallback: use basename so .env still matches regardless of full path
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

export function normalizeClaudeCodeAction(
  payload: ClaudeCodeHookPayload,
  persona?: AgentPersona
): RawAgentAction {
  const input = payload.tool_input || {};
  const agent = resolveAgentIdentity(payload.session_id);
  const envPersona = personaFromEnv();
  const resolvedPersona = persona || (envPersona as AgentPersona | undefined);

  let baseAction: RawAgentAction;

  switch (payload.tool_name) {
    case 'Write':
      baseAction = {
        tool: 'Write',
        file: normalizeFilePath(input.file_path as string | undefined),
        content: input.content as string | undefined,
        agent,
        metadata: { hook: payload.hook, sessionId: payload.session_id },
      };
      break;

    case 'Edit':
      baseAction = {
        tool: 'Edit',
        file: normalizeFilePath(input.file_path as string | undefined),
        content: input.new_string as string | undefined,
        agent,
        metadata: {
          hook: payload.hook,
          old_string: input.old_string,
          sessionId: payload.session_id,
        },
      };
      break;

    case 'Read':
      baseAction = {
        tool: 'Read',
        file: normalizeFilePath(input.file_path as string | undefined),
        agent,
        metadata: { hook: payload.hook, sessionId: payload.session_id },
      };
      break;

    case 'Bash': {
      const command = input.command as string | undefined;
      baseAction = {
        tool: 'Bash',
        command,
        target: command?.slice(0, 100),
        agent,
        metadata: {
          hook: payload.hook,
          timeout: input.timeout,
          description: input.description,
          sessionId: payload.session_id,
        },
      };
      break;
    }

    case 'Glob':
      baseAction = {
        tool: 'Glob',
        target: input.pattern as string | undefined,
        agent,
        metadata: { hook: payload.hook, path: input.path, sessionId: payload.session_id },
      };
      break;

    case 'Grep':
      baseAction = {
        tool: 'Grep',
        target: input.pattern as string | undefined,
        agent,
        metadata: { hook: payload.hook, path: input.path, sessionId: payload.session_id },
      };
      break;

    case 'NotebookEdit':
      baseAction = {
        tool: 'NotebookEdit',
        file: input.notebook_path as string | undefined,
        agent,
        metadata: { hook: payload.hook, cell_id: input.cell_id, sessionId: payload.session_id },
      };
      break;

    case 'TodoWrite':
      baseAction = {
        tool: 'TodoWrite',
        agent,
        metadata: { hook: payload.hook, todos: input.todos, sessionId: payload.session_id },
      };
      break;

    case 'WebFetch':
      baseAction = {
        tool: 'WebFetch',
        target: input.url as string | undefined,
        agent,
        metadata: { hook: payload.hook, prompt: input.prompt, sessionId: payload.session_id },
      };
      break;

    case 'WebSearch':
      baseAction = {
        tool: 'WebSearch',
        target: input.query as string | undefined,
        agent,
        metadata: { hook: payload.hook, query: input.query, sessionId: payload.session_id },
      };
      break;

    case 'Agent':
      baseAction = {
        tool: 'Agent',
        target: (input.prompt as string | undefined)?.slice(0, 100),
        agent,
        metadata: { hook: payload.hook, prompt: input.prompt, sessionId: payload.session_id },
      };
      break;

    case 'Skill':
      baseAction = {
        tool: 'Skill',
        target: input.skill as string | undefined,
        agent,
        metadata: {
          hook: payload.hook,
          skill: input.skill,
          args: input.args,
          sessionId: payload.session_id,
        },
      };
      break;

    default:
      baseAction = {
        tool: payload.tool_name,
        agent,
        metadata: { hook: payload.hook, input, sessionId: payload.session_id },
      };
      break;
  }

  if (resolvedPersona) {
    return { ...baseAction, persona: resolvedPersona };
  }
  return baseAction;
}

export async function processClaudeCodeHook(
  kernel: Kernel,
  payload: ClaudeCodeHookPayload,
  systemContext: Record<string, unknown> = {},
  persona?: AgentPersona
): Promise<KernelResult> {
  const rawAction = normalizeClaudeCodeAction(payload, persona);
  return kernel.propose(rawAction, systemContext);
}

export function formatHookResponse(result: KernelResult): string {
  if (!result.allowed) {
    const reason = result.decision?.decision?.reason ?? 'Action denied';
    const violations = result.decision?.violations ?? [];
    const parts = [reason];
    if (violations.length > 0) {
      parts.push(`Violations: ${violations.map((v: { name: string }) => v.name).join(', ')}`);
    }
    // Claude Code PreToolUse hook format: permissionDecision "deny" with exit code 2
    // ensures the tool call is hard-blocked (non-retryable)
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: parts.join(' | '),
      },
    });
  }
  return '';
}

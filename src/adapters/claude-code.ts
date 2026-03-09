// Claude Code adapter — normalizes Claude Code hook payloads into kernel actions.
// Handles PreToolUse and PostToolUse hook events.
// Propagates agent session identity for audit correlation.

import type { RawAgentAction } from '../kernel/aab.js';
import type { Kernel, KernelResult } from '../kernel/kernel.js';
import { simpleHash } from '../core/hash.js';

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

export function normalizeClaudeCodeAction(payload: ClaudeCodeHookPayload): RawAgentAction {
  const input = payload.tool_input || {};
  const agent = resolveAgentIdentity(payload.session_id);

  switch (payload.tool_name) {
    case 'Write':
      return {
        tool: 'Write',
        file: input.file_path as string | undefined,
        content: input.content as string | undefined,
        agent,
        metadata: { hook: payload.hook, sessionId: payload.session_id },
      };

    case 'Edit':
      return {
        tool: 'Edit',
        file: input.file_path as string | undefined,
        content: input.new_string as string | undefined,
        agent,
        metadata: {
          hook: payload.hook,
          old_string: input.old_string,
          sessionId: payload.session_id,
        },
      };

    case 'Read':
      return {
        tool: 'Read',
        file: input.file_path as string | undefined,
        agent,
        metadata: { hook: payload.hook, sessionId: payload.session_id },
      };

    case 'Bash': {
      const command = input.command as string | undefined;
      return {
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
    }

    case 'Glob':
      return {
        tool: 'Glob',
        target: input.pattern as string | undefined,
        agent,
        metadata: { hook: payload.hook, path: input.path, sessionId: payload.session_id },
      };

    case 'Grep':
      return {
        tool: 'Grep',
        target: input.pattern as string | undefined,
        agent,
        metadata: { hook: payload.hook, path: input.path, sessionId: payload.session_id },
      };

    default:
      return {
        tool: payload.tool_name,
        agent,
        metadata: { hook: payload.hook, input, sessionId: payload.session_id },
      };
  }
}

export async function processClaudeCodeHook(
  kernel: Kernel,
  payload: ClaudeCodeHookPayload,
  systemContext: Record<string, unknown> = {}
): Promise<KernelResult> {
  const rawAction = normalizeClaudeCodeAction(payload);
  return kernel.propose(rawAction, systemContext);
}

export function formatHookResponse(result: KernelResult): string {
  if (!result.allowed) {
    const reason = result.decision.decision.reason;
    const violations = result.decision.violations;
    const parts = [`DENIED: ${reason}`];
    if (violations.length > 0) {
      parts.push(`Violations: ${violations.map((v) => v.name).join(', ')}`);
    }
    return JSON.stringify({ error: parts.join(' | ') });
  }
  return '';
}

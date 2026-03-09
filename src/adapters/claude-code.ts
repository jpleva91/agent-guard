// Claude Code adapter — normalizes Claude Code hook payloads into kernel actions.
// Handles PreToolUse and PostToolUse hook events.

import type { RawAgentAction } from '../kernel/aab.js';
import type { Kernel, KernelResult } from '../kernel/kernel.js';

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
}

export function normalizeClaudeCodeAction(payload: ClaudeCodeHookPayload): RawAgentAction {
  const input = payload.tool_input || {};

  switch (payload.tool_name) {
    case 'Write':
      return {
        tool: 'Write',
        file: input.file_path as string | undefined,
        content: input.content as string | undefined,
        agent: 'claude-code',
        metadata: { hook: payload.hook },
      };

    case 'Edit':
      return {
        tool: 'Edit',
        file: input.file_path as string | undefined,
        content: input.new_string as string | undefined,
        agent: 'claude-code',
        metadata: {
          hook: payload.hook,
          old_string: input.old_string,
        },
      };

    case 'Read':
      return {
        tool: 'Read',
        file: input.file_path as string | undefined,
        agent: 'claude-code',
        metadata: { hook: payload.hook },
      };

    case 'Bash': {
      const command = input.command as string | undefined;
      return {
        tool: 'Bash',
        command,
        target: command?.slice(0, 100),
        agent: 'claude-code',
        metadata: {
          hook: payload.hook,
          timeout: input.timeout,
          description: input.description,
        },
      };
    }

    case 'Glob':
      return {
        tool: 'Glob',
        target: input.pattern as string | undefined,
        agent: 'claude-code',
        metadata: { hook: payload.hook, path: input.path },
      };

    case 'Grep':
      return {
        tool: 'Grep',
        target: input.pattern as string | undefined,
        agent: 'claude-code',
        metadata: { hook: payload.hook, path: input.path },
      };

    default:
      return {
        tool: payload.tool_name,
        agent: 'claude-code',
        metadata: { hook: payload.hook, input },
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

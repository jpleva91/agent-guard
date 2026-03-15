// OpenClaw normalization layer — maps OpenClaw tool calls to AgentGuard RawAgentAction.
// This is the translation boundary. No OpenClaw internals leak past this module.

import type { RawAgentAction } from '@red-codes/kernel';
import { simpleHash } from '@red-codes/core';
import type { OpenClawToolCall, OpenClawContext, GuardRequest } from './types.js';

/** Map of OpenClaw tool names to AgentGuard tool names (used by AAB for action classification). */
const OPENCLAW_TOOL_MAP: Record<string, string> = {
  file_read: 'Read',
  file_write: 'Write',
  shell_exec: 'Bash',
  http_fetch: 'WebFetch',
};

/**
 * Resolve agent identity from OpenClaw context.
 * Format: 'openclaw' (no actor) or 'openclaw:<hash>' (with actor/session).
 */
export function resolveOpenClawIdentity(context?: OpenClawContext): string {
  const id = context?.actor || context?.sessionId;
  if (!id || typeof id !== 'string' || id.trim() === '') {
    return 'openclaw';
  }
  return `openclaw:${simpleHash(id.trim())}`;
}

/** Normalize an OpenClaw tool call into a RawAgentAction for the kernel. */
export function normalizeOpenClawAction(
  toolCall: OpenClawToolCall,
  context?: OpenClawContext
): RawAgentAction {
  const agent = resolveOpenClawIdentity(context);
  const mappedTool = OPENCLAW_TOOL_MAP[toolCall.tool] ?? toolCall.tool;

  switch (toolCall.tool) {
    case 'file_read':
      return {
        tool: mappedTool,
        file: toolCall.input.path as string | undefined,
        agent,
        metadata: {
          source: 'openclaw',
          originalTool: toolCall.tool,
          sessionId: context?.sessionId,
          workspaceId: context?.workspaceId,
          pluginId: context?.pluginId,
        },
      };

    case 'file_write':
      return {
        tool: mappedTool,
        file: toolCall.input.path as string | undefined,
        content: toolCall.input.content as string | undefined,
        agent,
        metadata: {
          source: 'openclaw',
          originalTool: toolCall.tool,
          sessionId: context?.sessionId,
          workspaceId: context?.workspaceId,
          pluginId: context?.pluginId,
        },
      };

    case 'shell_exec':
      return {
        tool: mappedTool,
        command: toolCall.input.command as string | undefined,
        target: (toolCall.input.command as string | undefined)?.slice(0, 100),
        agent,
        metadata: {
          source: 'openclaw',
          originalTool: toolCall.tool,
          sessionId: context?.sessionId,
          workspaceId: context?.workspaceId,
          pluginId: context?.pluginId,
        },
      };

    case 'http_fetch':
      return {
        tool: mappedTool,
        target: toolCall.input.url as string | undefined,
        agent,
        metadata: {
          source: 'openclaw',
          originalTool: toolCall.tool,
          sessionId: context?.sessionId,
          workspaceId: context?.workspaceId,
          pluginId: context?.pluginId,
        },
      };

    default:
      return {
        tool: mappedTool,
        target: (toolCall.input.target as string | undefined) ?? undefined,
        agent,
        metadata: {
          source: 'openclaw',
          originalTool: toolCall.tool,
          input: toolCall.input,
          sessionId: context?.sessionId,
          workspaceId: context?.workspaceId,
          pluginId: context?.pluginId,
        },
      };
  }
}

/** Build a GuardRequest from an OpenClaw tool call and context. */
export function buildGuardRequest(
  toolCall: OpenClawToolCall,
  context?: OpenClawContext
): GuardRequest {
  return {
    toolName: toolCall.tool,
    args: toolCall.input,
    sessionId: context?.sessionId,
    workspaceId: context?.workspaceId,
    actor: context?.actor,
    source: 'openclaw',
  };
}

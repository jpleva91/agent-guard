// Paperclip adapter — normalizes Paperclip-managed agent hook payloads into kernel actions.
// Paperclip (https://github.com/paperclipai/paperclip) is an open-source AI agent orchestration
// platform. When Paperclip spawns agents (Claude Code, Codex, Cursor, etc.), it injects
// PAPERCLIP_* environment variables. This adapter reads those to enrich governance actions
// with orchestration context (company, project, agent role, budget state).
//
// Hook payload format matches the common PreToolUse/PostToolUse pattern used by Claude Code
// and Copilot CLI adapters, with additional Paperclip orchestration metadata.

import { statSync } from 'node:fs';
import { dirname, join, parse as parsePath } from 'node:path';
import type { RawAgentAction } from '@red-codes/kernel';
import type { Kernel, KernelResult } from '@red-codes/kernel';
import type { AgentPersona } from '@red-codes/core';
import { simpleHash, personaFromEnv } from '@red-codes/core';

/**
 * Paperclip orchestration context, populated from PAPERCLIP_* environment variables.
 * Paperclip injects these when spawning agent processes.
 */
export interface PaperclipContext {
  workspaceId?: string;
  companyId?: string;
  agentId?: string;
  projectId?: string;
  runId?: string;
  agentRole?: string;
  budgetRemainingCents?: number;
}

export interface PaperclipHookPayload {
  hook: 'PreToolUse' | 'PostToolUse';
  tool_name: string;
  tool_input?: Record<string, unknown>;
  tool_output?: Record<string, unknown>;
  /** Paperclip context can be passed inline or read from env vars */
  paperclip?: PaperclipContext;
}

/**
 * Read PAPERCLIP_* environment variables into a PaperclipContext.
 * Returns null if no Paperclip env vars are present.
 */
export function readPaperclipEnv(): PaperclipContext | null {
  const workspaceId = process.env.PAPERCLIP_WORKSPACE_ID;
  const companyId = process.env.PAPERCLIP_COMPANY_ID;
  const agentId = process.env.PAPERCLIP_AGENT_ID;
  const projectId = process.env.PAPERCLIP_PROJECT_ID;
  const runId = process.env.PAPERCLIP_RUN_ID;
  const agentRole = process.env.PAPERCLIP_AGENT_ROLE;
  const budgetStr = process.env.PAPERCLIP_BUDGET_REMAINING_CENTS;

  // If no Paperclip env vars are set, this isn't a Paperclip-managed agent
  if (!workspaceId && !companyId && !agentId && !runId) return null;

  const budgetRemainingCents =
    budgetStr !== undefined ? parseInt(budgetStr, 10) : undefined;

  return {
    workspaceId,
    companyId,
    agentId,
    projectId,
    runId,
    agentRole,
    budgetRemainingCents: Number.isFinite(budgetRemainingCents)
      ? budgetRemainingCents
      : undefined,
  };
}

/**
 * Resolve agent identity from Paperclip context.
 * Format: 'paperclip:<agentId-hash>' or 'paperclip:<runId-hash>' or 'paperclip'.
 */
export function resolvePaperclipAgentIdentity(ctx?: PaperclipContext): string {
  const id = ctx?.agentId || ctx?.runId;
  if (!id || typeof id !== 'string' || id.trim() === '') {
    return 'paperclip';
  }
  return `paperclip:${simpleHash(id.trim())}`;
}

/**
 * Normalize file paths for policy matching.
 * Convert absolute paths to relative (from projectRoot or cwd) so policy rules match.
 */
function normalizeFilePath(filePath: string | undefined, projectRoot?: string): string | undefined {
  if (!filePath) return filePath;

  const normalized = filePath.replace(/\\/g, '/');

  const isAbsolute = normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized);
  if (!isAbsolute) return normalized;

  const root = (projectRoot || process.cwd()).replace(/\\/g, '/');
  if (normalized.startsWith(root + '/')) {
    return normalized.slice(root.length + 1);
  }

  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

/**
 * Detect if the current working directory is inside a git worktree.
 * Paperclip uses git worktrees for workspace isolation.
 */
function detectWorktree(): boolean {
  let dir = process.cwd();
  const { root } = parsePath(dir);
  while (dir !== root) {
    try {
      const gitPath = join(dir, '.git');
      const stat = statSync(gitPath);
      return stat.isFile(); // file = worktree, directory = main repo
    } catch {
      // No .git here, walk up
    }
    dir = dirname(dir);
  }
  return false;
}

/**
 * Map Paperclip tool names to AgentGuard canonical tool names.
 * Paperclip agents may use various tool naming conventions depending
 * on the underlying adapter (Claude Code, Codex, Cursor, etc.).
 * This map handles common alternatives.
 */
const PAPERCLIP_TOOL_MAP: Record<string, string> = {
  bash: 'Bash',
  powershell: 'Bash',
  shell: 'Bash',
  view: 'Read',
  read: 'Read',
  edit: 'Edit',
  create: 'Write',
  write: 'Write',
  glob: 'Glob',
  grep: 'Grep',
  web_fetch: 'WebFetch',
  web_search: 'WebSearch',
  task: 'Agent',
  agent: 'Agent',
};

export function normalizePaperclipAction(
  payload: PaperclipHookPayload,
  persona?: AgentPersona,
  projectRoot?: string
): RawAgentAction {
  const input = payload.tool_input || {};
  const paperclipCtx = payload.paperclip || readPaperclipEnv();
  const agent = resolvePaperclipAgentIdentity(paperclipCtx ?? undefined);
  const envPersona = personaFromEnv();
  const resolvedPersona = persona || (envPersona as AgentPersona | undefined);

  // Resolve the canonical tool name (Paperclip agents may use various naming conventions)
  const toolName = payload.tool_name;
  const canonicalTool = PAPERCLIP_TOOL_MAP[toolName.toLowerCase()] || toolName;

  // Build Paperclip-specific metadata that enriches governance context
  const paperclipMeta: Record<string, unknown> = {
    hook: payload.hook,
    source: 'paperclip',
  };
  if (paperclipCtx) {
    if (paperclipCtx.companyId) paperclipMeta.companyId = paperclipCtx.companyId;
    if (paperclipCtx.projectId) paperclipMeta.projectId = paperclipCtx.projectId;
    if (paperclipCtx.workspaceId) paperclipMeta.workspaceId = paperclipCtx.workspaceId;
    if (paperclipCtx.runId) paperclipMeta.runId = paperclipCtx.runId;
    if (paperclipCtx.agentRole) paperclipMeta.agentRole = paperclipCtx.agentRole;
    if (paperclipCtx.budgetRemainingCents !== undefined) {
      paperclipMeta.budgetRemainingCents = paperclipCtx.budgetRemainingCents;
    }
  }

  let baseAction: RawAgentAction;

  switch (canonicalTool) {
    case 'Write':
      baseAction = {
        tool: 'Write',
        file: normalizeFilePath(
          (input.file_path ?? input.path) as string | undefined,
          projectRoot
        ),
        content: input.content as string | undefined,
        agent,
        metadata: paperclipMeta,
      };
      break;

    case 'Edit':
      baseAction = {
        tool: 'Edit',
        file: normalizeFilePath(
          (input.file_path ?? input.path) as string | undefined,
          projectRoot
        ),
        content: input.new_string as string | undefined,
        agent,
        metadata: { ...paperclipMeta, old_string: input.old_string },
      };
      break;

    case 'Read':
      baseAction = {
        tool: 'Read',
        file: normalizeFilePath(
          (input.file_path ?? input.path) as string | undefined,
          projectRoot
        ),
        agent,
        metadata: paperclipMeta,
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
          ...paperclipMeta,
          timeout: input.timeout,
          description: input.description,
        },
      };
      break;
    }

    case 'Glob':
      baseAction = {
        tool: 'Glob',
        target: input.pattern as string | undefined,
        agent,
        metadata: { ...paperclipMeta, path: input.path },
      };
      break;

    case 'Grep':
      baseAction = {
        tool: 'Grep',
        target: input.pattern as string | undefined,
        agent,
        metadata: { ...paperclipMeta, path: input.path },
      };
      break;

    case 'WebFetch':
      baseAction = {
        tool: 'WebFetch',
        target: input.url as string | undefined,
        agent,
        metadata: { ...paperclipMeta, prompt: input.prompt },
      };
      break;

    case 'WebSearch':
      baseAction = {
        tool: 'WebSearch',
        target: input.query as string | undefined,
        agent,
        metadata: { ...paperclipMeta, query: input.query },
      };
      break;

    case 'Agent':
      baseAction = {
        tool: 'Agent',
        target: (input.prompt as string | undefined)?.slice(0, 100),
        agent,
        metadata: { ...paperclipMeta, prompt: input.prompt },
      };
      break;

    case 'NotebookEdit':
      baseAction = {
        tool: 'NotebookEdit',
        file: input.notebook_path as string | undefined,
        agent,
        metadata: { ...paperclipMeta, cell_id: input.cell_id },
      };
      break;

    default:
      baseAction = {
        tool: canonicalTool,
        agent,
        metadata: { ...paperclipMeta, input },
      };
      break;
  }

  // Enrich with worktree detection (Paperclip uses git worktrees for workspace isolation)
  const inWorktree = detectWorktree();
  if (inWorktree) {
    baseAction = {
      ...baseAction,
      metadata: { ...baseAction.metadata, inWorktree: true },
    };
  }

  if (resolvedPersona) {
    return { ...baseAction, persona: resolvedPersona };
  }
  return baseAction;
}

export async function processPaperclipHook(
  kernel: Kernel,
  payload: PaperclipHookPayload,
  systemContext: Record<string, unknown> = {},
  persona?: AgentPersona,
  projectRoot?: string
): Promise<KernelResult> {
  const rawAction = normalizePaperclipAction(payload, persona, projectRoot);
  return kernel.propose(rawAction, systemContext);
}

/**
 * Format kernel result as a hook response for Paperclip-managed agents.
 * Uses the same JSON format as Claude Code hooks (permissionDecision deny with reason).
 * Paperclip agents that use Claude Code underneath will receive this through the hook chain.
 */
export function formatPaperclipHookResponse(result: KernelResult): string {
  if (!result.allowed) {
    const reason = result.decision?.decision?.reason ?? 'Action denied by AgentGuard policy';
    const violations = result.decision?.violations ?? [];
    const parts = [reason];
    if (violations.length > 0) {
      parts.push(`Violations: ${violations.map((v: { name: string }) => v.name).join(', ')}`);
    }
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

// Claude Code adapter — normalizes Claude Code hook payloads into kernel actions.
// Handles PreToolUse and PostToolUse hook events.
// Propagates agent session identity for audit correlation.

import { readFileSync, statSync } from 'node:fs';
import { dirname, join, parse as parsePath } from 'node:path';
import type { RawAgentAction } from '@red-codes/kernel';
import { normalizeToActionContext } from '@red-codes/kernel';
import type { Kernel, KernelResult } from '@red-codes/kernel';
import type {
  AgentPersona,
  ActionContext,
  GovernanceEventEnvelope,
  DomainEvent,
  EnvelopePerformanceMetrics,
} from '@red-codes/core';
import { simpleHash, personaFromEnv } from '@red-codes/core';
import { createEnvelope } from '@red-codes/events';

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
 * Resolve a meaningful agent identity.
 * Priority: .agentguard-identity file > AGENTGUARD_AGENT_NAME env var > session hash > 'claude-code'.
 * Matches the hook's resolveAgentIdentity() order so both layers resolve identically.
 */
export function resolveAgentIdentity(sessionId?: string): string {
  // 1. Identity file (canonical source — matches hook resolution order)
  const fileIdentity = readIdentityFile();
  if (fileIdentity) return fileIdentity;

  // 2. Env var (set by run-agent.sh for swarm, persona.env for interactive)
  const envName = process.env.AGENTGUARD_AGENT_NAME;
  if (envName) return envName;

  // 3. Fallback: hash session ID (anonymous/unconfigured agents)
  if (sessionId && typeof sessionId === 'string' && sessionId.trim() !== '') {
    return `claude-code:${simpleHash(sessionId.trim())}`;
  }
  return 'claude-code';
}

/** Read .agentguard-identity with walk-up fallback (mirrors hook's resolveIdentityDir). */
function readIdentityFile(): string | null {
  // Try AGENTGUARD_WORKSPACE first — if set, only look there (don't walk up)
  if (process.env.AGENTGUARD_WORKSPACE) {
    try {
      const content = readFileSync(
        join(process.env.AGENTGUARD_WORKSPACE, '.agentguard-identity'),
        'utf8'
      ).trim();
      if (content) return content;
    } catch {
      /* not found */
    }
    return null; // Explicit workspace set but no identity file — don't walk up
  }

  // Walk up from cwd (no explicit workspace)
  let dir = process.cwd();
  const { root } = parsePath(dir);
  let firstGitDir: string | undefined;
  while (dir !== root) {
    try {
      const content = readFileSync(join(dir, '.agentguard-identity'), 'utf8').trim();
      if (content) return content;
    } catch {
      /* not found */
    }
    if (!firstGitDir) {
      try {
        statSync(join(dir, '.git'));
        firstGitDir = dir;
      } catch {
        /* no .git */
      }
    }
    dir = dirname(dir);
  }

  if (firstGitDir) {
    try {
      const content = readFileSync(join(firstGitDir, '.agentguard-identity'), 'utf8').trim();
      if (content) return content;
    } catch {
      /* not found */
    }
  }

  return null;
}

/**
 * Normalize file paths for policy matching.
 * Claude Code sends absolute paths (e.g. C:\Users\...\project\.env).
 * Policy rules use relative paths (e.g. .env, .github/workflows/).
 * Convert absolute paths to relative (from projectRoot or cwd) so rules match correctly.
 *
 * When projectRoot is provided (from path-aware policy resolution), it's used instead of
 * process.cwd(). This fixes the governance bypass when cwd differs from the project root.
 */
function normalizeFilePath(filePath: string | undefined, projectRoot?: string): string | undefined {
  if (!filePath) return filePath;

  // Normalize Windows backslashes to forward slashes
  const normalized = filePath.replace(/\\/g, '/');

  const isAbsolute = normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized);
  if (!isAbsolute) return normalized;

  // Convert to relative path from project root (preferred) or cwd (fallback)
  const root = (projectRoot || process.cwd()).replace(/\\/g, '/');
  if (normalized.startsWith(root + '/')) {
    return normalized.slice(root.length + 1);
  }

  // Fallback: use basename so .env still matches regardless of full path
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

/**
 * Detect if the current working directory is inside a git worktree.
 * In a worktree, `.git` is a file (containing `gitdir: ...`) rather than a directory.
 * Walks up from cwd to find the nearest `.git` entry, since hooks may run from subdirectories.
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

export function normalizeClaudeCodeAction(
  payload: ClaudeCodeHookPayload,
  persona?: AgentPersona,
  projectRoot?: string
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
        file: normalizeFilePath(input.file_path as string | undefined, projectRoot),
        content: input.content as string | undefined,
        agent,
        metadata: { hook: payload.hook, sessionId: payload.session_id },
      };
      break;

    case 'Edit':
      baseAction = {
        tool: 'Edit',
        file: normalizeFilePath(input.file_path as string | undefined, projectRoot),
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
        file: normalizeFilePath(input.file_path as string | undefined, projectRoot),
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

  // Enrich metadata with worktree detection for policy evaluation
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

/**
 * Convert a Claude Code hook payload directly into a vendor-neutral ActionContext.
 * This is the KE-2 adapter mapping: Claude tool-calls → ActionContext.
 */
export function toActionContext(
  payload: ClaudeCodeHookPayload,
  persona?: AgentPersona,
  projectRoot?: string
): ActionContext {
  const rawAction = normalizeClaudeCodeAction(payload, persona, projectRoot);
  return normalizeToActionContext(rawAction, 'claude-code');
}

export async function processClaudeCodeHook(
  kernel: Kernel,
  payload: ClaudeCodeHookPayload,
  systemContext: Record<string, unknown> = {},
  persona?: AgentPersona,
  projectRoot?: string
): Promise<KernelResult> {
  // KE-2: Normalize to ActionContext at the adapter boundary
  const context = toActionContext(payload, persona, projectRoot);
  return kernel.propose(context, systemContext);
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

/**
 * Wrap a DomainEvent in a GovernanceEventEnvelope with Claude Code as the source.
 *
 * This is the KE-3 envelope producer for the Claude Code adapter. All adapters
 * produce identical envelope structures — only the `source` field differs.
 */
export function claudeCodeToEnvelope(
  event: DomainEvent,
  options?: {
    policyVersion?: string | null;
    decisionCodes?: readonly string[];
    performanceMetrics?: EnvelopePerformanceMetrics;
  }
): GovernanceEventEnvelope {
  return createEnvelope(event, {
    source: 'claude-code',
    policyVersion: options?.policyVersion,
    decisionCodes: options?.decisionCodes,
    performanceMetrics: options?.performanceMetrics,
  });
}

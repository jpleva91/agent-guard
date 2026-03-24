// Action Authorization Boundary (AAB)
// The central gatekeeper in the Runtime Assurance Architecture.
// Pure domain logic. No DOM, no Node.js-specific APIs.

import type {
  DomainEvent,
  AgentPersona,
  CompiledDestructivePattern,
  ActionContext,
  ActionClassExtended,
} from '@red-codes/core';

/**
 * Type guard — distinguishes ActionContext from RawAgentAction.
 * ActionContext always has `actionClass` and `normalizedAt`; RawAgentAction never does.
 */
export function isActionContext(input: unknown): input is ActionContext {
  return (
    typeof input === 'object' &&
    input !== null &&
    'actionClass' in input &&
    'normalizedAt' in input &&
    'source' in input
  );
}
import {
  TOOL_ACTION_MAP_DATA,
  DESTRUCTIVE_PATTERNS_DATA,
  GIT_ACTION_PATTERNS_DATA,
  getActionClass,
} from '@red-codes/core';
import { CommandScanner } from '@red-codes/matchers';
import { evaluate } from '@red-codes/policy';
import type {
  NormalizedIntent,
  EvalResult,
  LoadedPolicy,
  EvaluateOptions,
} from '@red-codes/policy';
import {
  createEvent,
  POLICY_DENIED,
  UNAUTHORIZED_ACTION,
  BLAST_RADIUS_EXCEEDED,
} from '@red-codes/events';
import { computeBlastRadius } from './blast-radius.js';
import type { BlastRadiusResult } from './blast-radius.js';

export interface RawAgentAction {
  tool?: string;
  command?: string;
  file?: string;
  target?: string;
  content?: string;
  branch?: string;
  agent?: string;
  persona?: AgentPersona;
  filesAffected?: number;
  metadata?: Record<string, unknown>;
}

export interface AuthorizationResult {
  intent: NormalizedIntent;
  result: EvalResult;
  events: DomainEvent[];
  blastRadius?: BlastRadiusResult;
}

const TOOL_ACTION_MAP: Record<string, string> = TOOL_ACTION_MAP_DATA;

const scanner = CommandScanner.create(DESTRUCTIVE_PATTERNS_DATA, GIT_ACTION_PATTERNS_DATA);

// Backward-compatible compiled patterns for consumers that import DESTRUCTIVE_PATTERNS directly.
const DESTRUCTIVE_PATTERNS: DestructivePattern[] = DESTRUCTIVE_PATTERNS_DATA.map((p) => ({
  pattern: new RegExp(p.pattern, p.flags),
  description: p.description,
  riskLevel: p.riskLevel,
  category: p.category,
}));

function detectGitAction(command: string): string | null {
  if (!command || typeof command !== 'string') return null;
  const result = scanner.scanGitAction(command.trim());
  return result ? result.actionType : null;
}

export type DestructiveRiskLevel = 'high' | 'critical';

export type DestructivePattern = CompiledDestructivePattern;

function isDestructiveCommand(command: string): boolean {
  if (!command || typeof command !== 'string') return false;
  return scanner.isDestructive(command);
}

// Maps patternId → original data index for stable ordering in getDestructiveDetails.
const PATTERN_INDEX_MAP = new Map<string, number>();
for (let i = 0; i < DESTRUCTIVE_PATTERNS_DATA.length; i++) {
  PATTERN_INDEX_MAP.set(`destructive:${DESTRUCTIVE_PATTERNS_DATA[i]!.category}:${i}`, i);
}

function getDestructiveDetails(command: string): DestructivePattern | null {
  if (!command || typeof command !== 'string') return null;
  const results = scanner.scanDestructive(command);
  if (results.length === 0) return null;

  // Pick the match with the lowest original pattern index (same order as old sequential scan).
  let best = results[0]!;
  let bestIdx = PATTERN_INDEX_MAP.get(best.patternId) ?? Infinity;
  for (let i = 1; i < results.length; i++) {
    const idx = PATTERN_INDEX_MAP.get(results[i]!.patternId) ?? Infinity;
    if (idx < bestIdx) {
      best = results[i]!;
      bestIdx = idx;
    }
  }

  return {
    pattern: DESTRUCTIVE_PATTERNS[bestIdx]?.pattern ?? (/matched/ as RegExp),
    description: best.description ?? '',
    riskLevel: best.severity === 10 ? 'critical' : 'high',
    category: best.category ?? '',
  };
}

/**
 * Extracts the target branch name from a refspec or plain branch token.
 * Handles: "main", "HEAD:main", "HEAD:refs/heads/main", "+main", ":main"
 */
function branchFromRefspec(ref: string): string {
  // Strip leading '+' (force-push prefix for individual refs)
  const cleaned = ref.startsWith('+') ? ref.slice(1) : ref;
  // Refspec syntax: src:dst — extract the destination
  if (cleaned.includes(':')) {
    const dst = cleaned.split(':').pop()!;
    return dst.replace(/^refs\/heads\//, '');
  }
  return cleaned;
}

// Flags that consume the next token as their value argument
const PUSH_VALUE_FLAGS = new Set(['-o', '--push-option', '--receive-pack', '--exec', '--repo']);

function extractBranch(command: string | undefined): string | null {
  if (!command) return null;
  // Split on shell chain operators so we can extract branches from commands
  // wrapped in chains like `cd /repo && git push origin main`
  // Note: trim segments instead of using \s* in the regex to avoid polynomial backtracking (CodeQL js/polynomial-redos)
  const segments = command.split(/&&|\|\||;/).map((s) => s.trim());
  for (const segment of segments) {
    const pushMatch = segment.match(/\bgit\s+push\b/);
    if (!pushMatch) continue;

    // Tokenize everything after 'git push', skipping flags to find positional args
    const afterPush = segment.slice(pushMatch.index! + pushMatch[0].length).trim();
    const tokens = afterPush.split(/\s+/).filter(Boolean);
    const positionalArgs: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.startsWith('-')) {
        // --flag=value style doesn't consume the next token
        if (!t.includes('=') && PUSH_VALUE_FLAGS.has(t) && i + 1 < tokens.length) {
          i++; // skip the value token
        }
        continue;
      }
      positionalArgs.push(t);
    }

    // positionalArgs: [remote, branch/refspec, ...]
    if (positionalArgs.length < 2) continue;
    return branchFromRefspec(positionalArgs[1]!);
  }
  return null;
}

/**
 * Strip quoted string content from a command, leaving only the executable and flags.
 * Replaces content inside single quotes, double quotes, heredocs, and backticks
 * with empty strings. This prevents false positive pattern matches on argument text.
 */
function stripQuotedContent(command: string): string {
  // Remove heredoc content: <<'EOF'...EOF or <<"EOF"...EOF or <<EOF...EOF
  let stripped = command.replace(/<<['"]?(\w+)['"]?[\s\S]*?\n\1/g, '');
  // Remove single-quoted strings
  stripped = stripped.replace(/'[^']*'/g, "''");
  // Remove double-quoted strings
  stripped = stripped.replace(/"[^"]*"/g, '""');
  // Remove backtick strings
  stripped = stripped.replace(/`[^`]*`/g, '``');
  return stripped;
}

export function normalizeIntent(rawAction: RawAgentAction | null): NormalizedIntent {
  if (!rawAction || typeof rawAction !== 'object') {
    return { action: 'unknown', target: '', agent: 'unknown', destructive: false };
  }

  const tool = rawAction.tool || '';
  let action = TOOL_ACTION_MAP[tool] || (tool.startsWith('mcp__') ? 'mcp.call' : 'unknown');
  let target = rawAction.file || rawAction.target || '';

  // For MCP tools, extract the service name from the tool name so policy
  // rules with `target: "service-name"` can match.
  // e.g. "mcp__scheduled-tasks__create_scheduled_task" → "scheduled-tasks"
  if (action === 'mcp.call' && !target && tool.startsWith('mcp__')) {
    const parts = tool.split('__');
    if (parts.length >= 3) {
      target = parts[1];
    }
  }

  if (action === 'shell.exec' && rawAction.command) {
    const scannable = stripQuotedContent(rawAction.command);
    const gitAction = detectGitAction(scannable);
    if (gitAction) {
      action = gitAction;
      // Use original command for branch extraction (needs the actual branch name)
      target = extractBranch(rawAction.command) || target;
    } else if (!target) {
      // Use command as target for non-git shell actions so scope-based
      // policy rules can match against the command text.
      target = rawAction.command;
    }
  }

  return {
    action,
    target,
    agent: rawAction.agent || 'unknown',
    branch: rawAction.branch || extractBranch(rawAction.command) || undefined,
    command: rawAction.command || undefined,
    filesAffected: rawAction.filesAffected || undefined,
    metadata: rawAction.metadata || undefined,
    persona: rawAction.persona || undefined,
    // Destructive detection scans the FULL command (including quotes) because
    // destructive SQL inside quotes (e.g. psql -c 'DROP TABLE') is still dangerous.
    // Only git action detection strips quotes to prevent heredoc false positives.
    destructive: action === 'shell.exec' && isDestructiveCommand(rawAction.command || ''),
  };
}

/**
 * Core authorization logic shared by authorize() and authorizeContext().
 * Accepts a pre-normalized intent (NormalizedIntent or ActionContext).
 */
function authorizeIntent(
  intent: NormalizedIntent | ActionContext,
  policies: LoadedPolicy[],
  evaluateOptions?: EvaluateOptions
): AuthorizationResult {
  const events: DomainEvent[] = [];

  if (intent.destructive) {
    const result: EvalResult = {
      allowed: false,
      decision: 'deny',
      matchedRule: null,
      matchedPolicy: null,
      reason: `Destructive command detected: ${intent.command}`,
      severity: 5,
    };

    events.push(
      createEvent(UNAUTHORIZED_ACTION, {
        action: intent.action,
        reason: result.reason,
        agentId: intent.agent,
        scope: intent.target,
      })
    );

    return { intent, result, events };
  }

  const result = evaluate(intent, policies, evaluateOptions);

  if (!result.allowed) {
    if (result.matchedPolicy) {
      events.push(
        createEvent(POLICY_DENIED, {
          policy: result.matchedPolicy.id,
          action: intent.action,
          reason: result.reason,
          agentId: intent.agent,
          file: intent.target,
        })
      );
    } else {
      events.push(
        createEvent(UNAUTHORIZED_ACTION, {
          action: intent.action,
          reason: result.reason,
          agentId: intent.agent,
          scope: intent.target,
        })
      );
    }
  }

  // Blast radius computation engine (Phase 2)
  let blastRadius: BlastRadiusResult | undefined;

  let tightestLimit = Infinity;
  for (const policy of policies) {
    for (const rule of policy.rules) {
      if (rule.conditions?.limit !== undefined) {
        tightestLimit = Math.min(tightestLimit, rule.conditions.limit);
      }
    }
  }

  if (tightestLimit < Infinity) {
    blastRadius = computeBlastRadius(intent, tightestLimit);

    if (blastRadius.exceeded) {
      events.push(
        createEvent(BLAST_RADIUS_EXCEEDED, {
          filesAffected: blastRadius.rawCount,
          weightedScore: blastRadius.weightedScore,
          riskLevel: blastRadius.riskLevel,
          factors: blastRadius.factors.map((f) => f.reason),
          limit: tightestLimit,
          action: intent.action,
        })
      );
    }
  }

  return { intent, result, events, blastRadius };
}

export function authorize(
  rawAction: RawAgentAction | null,
  policies: LoadedPolicy[],
  evaluateOptions?: EvaluateOptions
): AuthorizationResult {
  const intent = normalizeIntent(rawAction);
  return authorizeIntent(intent, policies, evaluateOptions);
}

/**
 * Authorize using a pre-normalized ActionContext (KE-2).
 * Skips the RawAgentAction → NormalizedIntent conversion since the context
 * is already vendor-neutral. This is the preferred evaluation entry point.
 */
export function authorizeContext(
  context: ActionContext,
  policies: LoadedPolicy[],
  evaluateOptions?: EvaluateOptions
): AuthorizationResult {
  return authorizeIntent(context, policies, evaluateOptions);
}

/**
 * Resolve the ActionClassExtended for a normalized action type.
 * MCP actions get 'mcp', unknown actions get 'unknown', everything else
 * is resolved from the canonical ACTION_TYPES registry.
 */
function resolveActionClass(action: string): ActionClassExtended {
  if (action === 'mcp.call') return 'mcp';
  const cls = getActionClass(action);
  return cls ?? 'unknown';
}

/**
 * Normalize a raw agent action into a vendor-neutral ActionContext.
 *
 * This is the KE-2 canonical normalization entry point. Every runtime adapter
 * should call this (directly or via a convenience wrapper) to produce the
 * ActionContext that flows through the governance pipeline.
 *
 * Performance target: 50–100µs (p50).
 */
export function normalizeToActionContext(
  rawAction: RawAgentAction | null,
  source: string = 'unknown'
): ActionContext {
  const intent = normalizeIntent(rawAction);
  const actionClass = resolveActionClass(intent.action);
  const now = Date.now();

  // Preserve raw tool name and content in args.metadata for audit trail
  const argsMeta: Record<string, unknown> = { ...intent.metadata };
  if (rawAction?.tool) {
    argsMeta.rawTool = rawAction.tool;
  }

  return {
    // ActionContext-specific enrichment
    actionClass,
    actor: {
      agentId: intent.agent,
      sessionId: (rawAction?.metadata?.sessionId as string) ?? undefined,
      inWorktree: (rawAction?.metadata?.inWorktree as boolean) ?? undefined,
      persona: intent.persona,
    },
    args: {
      filePath: rawAction?.file || rawAction?.target || undefined,
      command: intent.command,
      branch: intent.branch,
      content: rawAction?.content || undefined,
      filesAffected: intent.filesAffected,
      metadata: argsMeta,
    },
    source,
    normalizedAt: now,

    // NormalizedIntent-compatible fields (structural compatibility)
    action: intent.action,
    target: intent.target,
    agent: intent.agent,
    branch: intent.branch,
    command: intent.command,
    filesAffected: intent.filesAffected,
    metadata: intent.metadata,
    persona: intent.persona,
    destructive: intent.destructive,
  };
}

export {
  detectGitAction,
  isDestructiveCommand,
  getDestructiveDetails,
  stripQuotedContent,
  DESTRUCTIVE_PATTERNS,
};

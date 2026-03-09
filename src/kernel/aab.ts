// Action Authorization Boundary (AAB)
// The central gatekeeper in the Runtime Assurance Architecture.
// Pure domain logic. No DOM, no Node.js-specific APIs.

import type { DomainEvent } from '../core/types.js';
import { evaluate } from '../policy/evaluator.js';
import type { NormalizedIntent, EvalResult, LoadedPolicy } from '../policy/evaluator.js';
import {
  createEvent,
  POLICY_DENIED,
  UNAUTHORIZED_ACTION,
  BLAST_RADIUS_EXCEEDED,
} from '../events/schema.js';

export interface RawAgentAction {
  tool?: string;
  command?: string;
  file?: string;
  target?: string;
  content?: string;
  branch?: string;
  agent?: string;
  filesAffected?: number;
  metadata?: Record<string, unknown>;
}

export interface AuthorizationResult {
  intent: NormalizedIntent;
  result: EvalResult;
  events: DomainEvent[];
}

const TOOL_ACTION_MAP: Record<string, string> = {
  Write: 'file.write',
  Edit: 'file.write',
  Read: 'file.read',
  Bash: 'shell.exec',
  Glob: 'file.read',
  Grep: 'file.read',
};

function detectGitAction(command: string): string | null {
  if (!command || typeof command !== 'string') return null;

  const trimmed = command.trim();

  if (/\bgit\s+push\s+--force\b/.test(trimmed) || /\bgit\s+push\s+-f\b/.test(trimmed)) {
    return 'git.force-push';
  }
  if (/\bgit\s+push\b/.test(trimmed)) return 'git.push';
  if (/\bgit\s+branch\s+-[dD]\b/.test(trimmed)) return 'git.branch.delete';
  if (/\bgit\s+merge\b/.test(trimmed)) return 'git.merge';
  if (/\bgit\s+commit\b/.test(trimmed)) return 'git.commit';

  return null;
}

function isDestructiveCommand(command: string): boolean {
  if (!command || typeof command !== 'string') return false;

  const patterns = [
    /\brm\s+-rf\b/,
    /\brm\s+-r\b/,
    /\brm\s+--recursive\b/,
    /\bchmod\s+777\b/,
    /\bdd\s+if=/,
    /\bmkfs\b/,
    />\s*\/dev\/sd[a-z]/,
    /\bsudo\s+rm\b/,
    /\bdropdb\b/,
    /\bDROP\s+DATABASE\b/i,
    /\bDROP\s+TABLE\b/i,
  ];

  return patterns.some((p) => p.test(command));
}

function extractBranch(command: string | undefined): string | null {
  if (!command) return null;
  const match = command.match(/\bgit\s+push\s+\S+\s+(\S+)/);
  return match ? match[1] : null;
}

export function normalizeIntent(rawAction: RawAgentAction | null): NormalizedIntent {
  if (!rawAction || typeof rawAction !== 'object') {
    return { action: 'unknown', target: '', agent: 'unknown', destructive: false };
  }

  const tool = rawAction.tool || '';
  let action = TOOL_ACTION_MAP[tool] || 'unknown';
  let target = rawAction.file || rawAction.target || '';

  if (action === 'shell.exec' && rawAction.command) {
    const gitAction = detectGitAction(rawAction.command);
    if (gitAction) {
      action = gitAction;
      target = extractBranch(rawAction.command) || target;
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
    destructive: action === 'shell.exec' && isDestructiveCommand(rawAction.command || ''),
  };
}

export function authorize(
  rawAction: RawAgentAction | null,
  policies: LoadedPolicy[]
): AuthorizationResult {
  const intent = normalizeIntent(rawAction);
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

  const result = evaluate(intent, policies);

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

  // TODO(roadmap): Phase 2 — Implement full blast radius computation engine
  // (dependency graph analysis, transitive impact scoring, configurable thresholds)
  if (intent.filesAffected !== undefined) {
    let tightestLimit = Infinity;
    for (const policy of policies) {
      for (const rule of policy.rules) {
        if (rule.conditions?.limit !== undefined) {
          tightestLimit = Math.min(tightestLimit, rule.conditions.limit);
        }
      }
    }

    if (intent.filesAffected > tightestLimit) {
      events.push(
        createEvent(BLAST_RADIUS_EXCEEDED, {
          filesAffected: intent.filesAffected,
          limit: tightestLimit,
          action: intent.action,
        })
      );
    }
  }

  return { intent, result, events };
}

export { detectGitAction, isDestructiveCommand };

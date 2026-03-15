// Action Authorization Boundary (AAB)
// The central gatekeeper in the Runtime Assurance Architecture.
// Pure domain logic. No DOM, no Node.js-specific APIs.

import type { DomainEvent, AgentPersona } from '@red-codes/core';
import {
  TOOL_ACTION_MAP_DATA,
  getDestructivePatterns,
  getGitActionPatterns,
} from '@red-codes/core';
import type { CompiledDestructivePattern } from '@red-codes/core';
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

const compiledGitPatterns = getGitActionPatterns();

function detectGitAction(command: string): string | null {
  if (!command || typeof command !== 'string') return null;

  const trimmed = command.trim();

  for (const entry of compiledGitPatterns) {
    if (entry.patterns.some((p) => p.test(trimmed))) {
      return entry.actionType;
    }
  }

  return null;
}

export type DestructiveRiskLevel = 'high' | 'critical';

export type DestructivePattern = CompiledDestructivePattern;

const DESTRUCTIVE_PATTERNS: DestructivePattern[] = getDestructivePatterns();

function isDestructiveCommand(command: string): boolean {
  if (!command || typeof command !== 'string') return false;

  return DESTRUCTIVE_PATTERNS.some((p) => p.pattern.test(command));
}

function getDestructiveDetails(command: string): DestructivePattern | null {
  if (!command || typeof command !== 'string') return null;

  return DESTRUCTIVE_PATTERNS.find((p) => p.pattern.test(command)) ?? null;
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
    persona: rawAction.persona || undefined,
    destructive: action === 'shell.exec' && isDestructiveCommand(rawAction.command || ''),
  };
}

export function authorize(
  rawAction: RawAgentAction | null,
  policies: LoadedPolicy[],
  evaluateOptions?: EvaluateOptions
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
  // Computes a weighted score from action type, path sensitivity, and file count,
  // then checks against the tightest policy limit.
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

export { detectGitAction, isDestructiveCommand, getDestructiveDetails, DESTRUCTIVE_PATTERNS };

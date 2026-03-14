// Policy fix verification — tests whether a proposed policy change
// resolves historical violations without introducing regressions.
//
// Given a new policy file and historical governance sessions, this module:
// 1. Loads all violation events (PolicyDenied, ActionDenied) from session data
// 2. Re-evaluates each violation-producing action against the new policy
// 3. Reports which violations are resolved, which remain, and any regressions
//
// A "regression" is when an action that was previously allowed would now be
// denied by the new policy — an unintended side effect of the policy change.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DomainEvent } from '@red-codes/core';
import type { NormalizedIntent, LoadedPolicy, EvalResult } from '@red-codes/policy';
import { evaluate } from '@red-codes/policy';
import { loadYamlPolicy } from '@red-codes/policy';
import { loadPolicies } from '@red-codes/policy';
import { listSessionIds, loadSessionEvents } from '@red-codes/analytics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Detail about a single violation and its re-evaluation result */
export interface ViolationVerifyDetail {
  readonly sessionId: string;
  readonly eventId: string;
  readonly kind: string;
  readonly actionType: string;
  readonly target: string;
  readonly originalReason: string;
  readonly newDecision: 'allow' | 'deny';
  readonly newReason: string;
}

/** Detail about a regression — previously-allowed action now denied */
export interface RegressionDetail {
  readonly sessionId: string;
  readonly eventId: string;
  readonly actionType: string;
  readonly target: string;
  readonly reason: string;
}

/** Result of verifying a policy fix against historical sessions */
export interface PolicyVerifyResult {
  readonly policyFile: string;
  readonly sessionsAnalyzed: number;
  readonly totalViolations: number;
  readonly resolvedCount: number;
  readonly remainingCount: number;
  readonly regressionCount: number;
  readonly resolved: readonly ViolationVerifyDetail[];
  readonly remaining: readonly ViolationVerifyDetail[];
  readonly regressions: readonly RegressionDetail[];
}

// ---------------------------------------------------------------------------
// Event kinds
// ---------------------------------------------------------------------------

/** Violation kinds that are caused by policy evaluation (re-evaluatable) */
const POLICY_VIOLATION_KINDS = new Set(['PolicyDenied', 'ActionDenied']);

/** Allowed action kinds — used for regression detection */
const ALLOWED_ACTION_KINDS = new Set(['ActionAllowed', 'ActionExecuted']);

// ---------------------------------------------------------------------------
// Intent reconstruction
// ---------------------------------------------------------------------------

/**
 * Reconstruct a NormalizedIntent from a stored governance event.
 * Events contain action metadata that was used in the original evaluation.
 * Returns null if the event doesn't contain enough data to reconstruct.
 */
function reconstructIntent(event: DomainEvent): NormalizedIntent | null {
  const rec = event as unknown as Record<string, unknown>;

  const action =
    (rec.actionType as string) ?? (rec.action as string) ?? (rec.syscall as string) ?? null;
  const target = (rec.target as string) ?? (rec.file as string) ?? '';

  if (!action) return null;

  return {
    action,
    target,
    agent: (rec.agent as string) ?? 'unknown',
    branch: (rec.branch as string) ?? undefined,
    command: (rec.command as string) ?? undefined,
    filesAffected: (rec.filesAffected as number) ?? undefined,
    destructive: (rec.destructive as boolean) ?? false,
  };
}

// ---------------------------------------------------------------------------
// Policy loading
// ---------------------------------------------------------------------------

/**
 * Load a policy file (YAML or JSON) and return the LoadedPolicy array.
 * Throws if the file cannot be parsed or is invalid.
 */
export function loadPolicyFromFile(filePath: string): LoadedPolicy[] {
  const absPath = resolve(filePath);
  const content = readFileSync(absPath, 'utf8');

  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    return [loadYamlPolicy(content, filePath)];
  }

  const parsed = JSON.parse(content) as unknown;
  const defs = Array.isArray(parsed) ? parsed : [parsed];
  const { policies, errors } = loadPolicies(defs);
  if (errors.length > 0) {
    throw new Error(`Policy validation errors: ${errors.join('; ')}`);
  }
  return policies;
}

// ---------------------------------------------------------------------------
// Verification engine
// ---------------------------------------------------------------------------

/**
 * Verify whether a proposed policy resolves historical violations.
 *
 * @param policyPath — path to the new/proposed policy file (YAML or JSON)
 * @param baseDir — base directory for governance session data (default: .agentguard)
 * @returns structured verification result
 */
export function verifyPolicyFix(policyPath: string, baseDir = '.agentguard'): PolicyVerifyResult {
  const policies = loadPolicyFromFile(policyPath);
  const sessionIds = listSessionIds(baseDir);

  const resolved: ViolationVerifyDetail[] = [];
  const remaining: ViolationVerifyDetail[] = [];
  const regressions: RegressionDetail[] = [];
  let totalViolations = 0;

  for (const sessionId of sessionIds) {
    const events = loadSessionEvents(sessionId, baseDir);

    for (const event of events) {
      // Check policy-caused violations for resolution
      if (POLICY_VIOLATION_KINDS.has(event.kind)) {
        totalViolations++;
        const intent = reconstructIntent(event);
        if (!intent) continue;

        const result: EvalResult = evaluate(intent, policies);
        const rec = event as unknown as Record<string, unknown>;
        const originalReason = (rec.reason as string) ?? event.kind;

        const detail: ViolationVerifyDetail = {
          sessionId,
          eventId: event.id,
          kind: event.kind,
          actionType: intent.action,
          target: intent.target,
          originalReason,
          newDecision: result.decision,
          newReason: result.reason,
        };

        if (result.allowed) {
          resolved.push(detail);
        } else {
          remaining.push(detail);
        }
      }

      // Check previously-allowed actions for regressions
      if (ALLOWED_ACTION_KINDS.has(event.kind)) {
        const intent = reconstructIntent(event);
        if (!intent) continue;

        const result: EvalResult = evaluate(intent, policies);

        if (!result.allowed) {
          regressions.push({
            sessionId,
            eventId: event.id,
            actionType: intent.action,
            target: intent.target,
            reason: result.reason,
          });
        }
      }
    }
  }

  return {
    policyFile: policyPath,
    sessionsAnalyzed: sessionIds.length,
    totalViolations,
    resolvedCount: resolved.length,
    remainingCount: remaining.length,
    regressionCount: regressions.length,
    resolved,
    remaining,
    regressions,
  };
}

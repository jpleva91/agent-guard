// Risk scoring engine — computes an aggregate risk score for a governance session
// based on violations, escalation level, blast radius, and operation types.
// Pure computation over DomainEvent arrays. No I/O.

import type { DomainEvent } from '@red-codes/core';
import type { RiskFactor, RiskLevel, RunRiskScore } from './types.js';

// --- Weights for each risk dimension (must sum to 1.0) ---
const VIOLATION_WEIGHT = 0.35;
const ESCALATION_WEIGHT = 0.25;
const BLAST_RADIUS_WEIGHT = 0.25;
const OPERATION_WEIGHT = 0.15;

// --- Violation severity points per event kind ---
const VIOLATION_POINTS: Record<string, number> = {
  InvariantViolation: 10,
  MergeGuardFailure: 9,
  BlastRadiusExceeded: 8,
  UnauthorizedAction: 8,
  PolicyDenied: 7,
  ActionDenied: 5,
};

// --- Operation risk points per action type ---
const OPERATION_RISK: Record<string, number> = {
  'deploy.trigger': 10,
  'infra.destroy': 10,
  'infra.apply': 8,
  'git.force-push': 10,
  'git.push': 5,
  'git.branch.delete': 5,
  'git.reset': 4,
  'npm.publish': 8,
  'file.delete': 3,
  'shell.exec': 2,
  'file.write': 1,
  'file.move': 1,
  'git.commit': 1,
  'git.checkout': 0.5,
  'git.branch.create': 0.5,
  'git.diff': 0,
  'git.merge': 2,
  'file.read': 0,
  'test.run': 0,
  'test.run.unit': 0,
  'test.run.integration': 0,
  'npm.install': 1,
  'npm.script.run': 1,
  'http.request': 1,
};

// --- Escalation thresholds (mirroring monitor.ts defaults) ---
const DEFAULT_DENIAL_THRESHOLD = 5;
const DEFAULT_VIOLATION_THRESHOLD = 3;

/** Derive risk level from a 0-100 score */
function deriveRiskLevel(score: number): RiskLevel {
  if (score >= 76) return 'critical';
  if (score >= 51) return 'high';
  if (score >= 26) return 'medium';
  return 'low';
}

/** Clamp a value to the 0-100 range */
function clamp100(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** Extract the action type from an event's metadata */
function extractActionType(event: Record<string, unknown>): string | undefined {
  return (event.actionType as string) ?? (event.action as string) ?? undefined;
}

/** Compute the violation severity component (0-100) */
function computeViolationScore(events: DomainEvent[]): { score: number; details: string } {
  let totalPoints = 0;
  const counts: Record<string, number> = {};

  for (const event of events) {
    const points = VIOLATION_POINTS[event.kind];
    if (points !== undefined) {
      totalPoints += points;
      counts[event.kind] = (counts[event.kind] ?? 0) + 1;
    }
  }

  // Normalize: 50 severity points = score 100 (saturating)
  const score = clamp100((totalPoints / 50) * 100);
  const parts = Object.entries(counts).map(([kind, count]) => `${kind}: ${count}`);
  const details = parts.length > 0 ? parts.join(', ') : 'none';

  return { score, details };
}

/** Reconstruct peak escalation level from event counts (mirrors monitor.ts thresholds) */
function computeEscalationScore(events: DomainEvent[]): {
  score: number;
  peak: number;
  details: string;
} {
  let denials = 0;
  let violations = 0;

  for (const event of events) {
    if (event.kind === 'ActionDenied' || event.kind === 'PolicyDenied') denials++;
    if (event.kind === 'InvariantViolation') violations++;
  }

  let peak = 0; // NORMAL
  if (denials >= DEFAULT_DENIAL_THRESHOLD * 2 || violations >= DEFAULT_VIOLATION_THRESHOLD * 2) {
    peak = 3; // LOCKDOWN
  } else if (denials >= DEFAULT_DENIAL_THRESHOLD || violations >= DEFAULT_VIOLATION_THRESHOLD) {
    peak = 2; // HIGH
  } else if (denials >= Math.ceil(DEFAULT_DENIAL_THRESHOLD / 2)) {
    peak = 1; // ELEVATED
  }

  const levelNames = ['NORMAL', 'ELEVATED', 'HIGH', 'LOCKDOWN'];
  const score = clamp100((peak / 3) * 100);
  const details = `peak: ${levelNames[peak]} (${denials} denials, ${violations} invariant violations)`;

  return { score, peak, details };
}

/** Compute cumulative blast radius component (0-100) */
function computeBlastRadiusScore(events: DomainEvent[]): { score: number; details: string } {
  let totalFilesAffected = 0;
  let blastExceededCount = 0;

  for (const event of events) {
    const rec = event as unknown as Record<string, unknown>;

    if (event.kind === 'BlastRadiusExceeded') {
      blastExceededCount++;
      totalFilesAffected += (rec.filesAffected as number) ?? 0;
    }

    if (event.kind === 'ActionExecuted' || event.kind === 'ActionAllowed') {
      const metadata = rec.metadata as Record<string, unknown> | undefined;
      if (metadata?.filesAffected) {
        totalFilesAffected += metadata.filesAffected as number;
      }
    }
  }

  // Normalize: 100 total files affected = score 100
  // Blast radius exceeded events add a 20-point penalty each
  const fileScore = (totalFilesAffected / 100) * 80;
  const penaltyScore = blastExceededCount * 20;
  const score = clamp100(fileScore + penaltyScore);
  const details = `${totalFilesAffected} files affected, ${blastExceededCount} blast radius exceeded`;

  return { score, details };
}

/** Compute operation risk profile component (0-100) */
function computeOperationScore(events: DomainEvent[]): {
  score: number;
  totalActions: number;
  details: string;
} {
  let totalPoints = 0;
  let totalActions = 0;
  const actionCounts: Record<string, number> = {};

  for (const event of events) {
    if (event.kind !== 'ActionExecuted' && event.kind !== 'ActionRequested') continue;
    totalActions++;

    const actionType = extractActionType(event as unknown as Record<string, unknown>);
    if (!actionType) continue;

    actionCounts[actionType] = (actionCounts[actionType] ?? 0) + 1;
    const risk = OPERATION_RISK[actionType] ?? 1;
    totalPoints += risk;
  }

  // Normalize: 50 operation points = score 100
  const score = clamp100((totalPoints / 50) * 100);
  const topOps = Object.entries(actionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => `${type}: ${count}`);
  const details = topOps.length > 0 ? topOps.join(', ') : 'no actions';

  return { score, totalActions, details };
}

/**
 * Compute an aggregate risk score for a governance session.
 *
 * The score is a weighted composite of four dimensions:
 *   - Violation severity (35%) — count and type of governance violations
 *   - Peak escalation (25%) — highest escalation level reached
 *   - Blast radius (25%) — cumulative files affected and threshold breaches
 *   - Operation risk (15%) — risk profile of executed operations
 *
 * Each dimension is normalized to 0-100, then combined via weighted average.
 * Final score is 0-100 with risk levels: low (0-25), medium (26-50), high (51-75), critical (76-100).
 */
export function computeRunRiskScore(sessionId: string, events: DomainEvent[]): RunRiskScore {
  const violation = computeViolationScore(events);
  const escalation = computeEscalationScore(events);
  const blastRadius = computeBlastRadiusScore(events);
  const operation = computeOperationScore(events);

  const factors: RiskFactor[] = [
    {
      dimension: 'violations',
      rawValue: violation.score,
      normalizedScore: violation.score,
      weight: VIOLATION_WEIGHT,
      details: violation.details,
    },
    {
      dimension: 'escalation',
      rawValue: escalation.peak,
      normalizedScore: escalation.score,
      weight: ESCALATION_WEIGHT,
      details: escalation.details,
    },
    {
      dimension: 'blastRadius',
      rawValue: blastRadius.score,
      normalizedScore: blastRadius.score,
      weight: BLAST_RADIUS_WEIGHT,
      details: blastRadius.details,
    },
    {
      dimension: 'operations',
      rawValue: operation.score,
      normalizedScore: operation.score,
      weight: OPERATION_WEIGHT,
      details: operation.details,
    },
  ];

  const score =
    Math.round(factors.reduce((sum, f) => sum + f.normalizedScore * f.weight, 0) * 100) / 100;

  // Count totals from events
  let totalDenials = 0;
  let totalViolations = 0;
  for (const event of events) {
    if (event.kind === 'ActionDenied' || event.kind === 'PolicyDenied') totalDenials++;
    if (VIOLATION_POINTS[event.kind] !== undefined) totalViolations++;
  }

  return {
    sessionId,
    score,
    riskLevel: deriveRiskLevel(score),
    factors,
    totalActions: operation.totalActions,
    totalDenials,
    totalViolations,
    peakEscalation: escalation.peak,
  };
}

/**
 * Compute risk scores for all sessions in the provided events map.
 * Returns scores sorted by risk (highest first).
 */
export function computeAllRunRiskScores(sessionEvents: Map<string, DomainEvent[]>): RunRiskScore[] {
  const scores: RunRiskScore[] = [];
  for (const [sessionId, events] of sessionEvents) {
    scores.push(computeRunRiskScore(sessionId, events));
  }
  return scores.sort((a, b) => b.score - a.score);
}

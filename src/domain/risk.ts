// Severity / Risk model — maps raw signals to operational risk levels.
// Determines whether something is a local nuisance, a repeated issue,
// a regression, risky automation, or a critical invariant breach.
// No DOM, no Node.js APIs — pure domain logic.

import type { DevEvent, DevEventSeverity } from './dev-event.js';
import type { BugEntity } from './entities.js';

// ---------------------------------------------------------------------------
// Risk Level — operational classification beyond raw severity
// ---------------------------------------------------------------------------

export type RiskLevel =
  | 'noise' // cosmetic, one-off, low signal
  | 'nuisance' // real but low impact, can auto-resolve
  | 'issue' // needs attention, repeating or medium severity
  | 'regression' // something that was working is now broken
  | 'risky_automation' // agent-originated action with elevated risk
  | 'critical_breach'; // invariant violation or security issue

// ---------------------------------------------------------------------------
// Risk Assessment — full risk analysis result
// ---------------------------------------------------------------------------

export interface RiskAssessment {
  /** Computed risk level */
  readonly level: RiskLevel;
  /** Numeric score (0–100) for ranking */
  readonly score: number;
  /** Human-readable explanation */
  readonly reason: string;
  /** Suggested action */
  readonly action: RiskAction;
  /** Whether this should be a boss encounter in the game layer */
  readonly isBoss: boolean;
  /** Suggested game encounter HP bonus (0–200) */
  readonly hpBonus: number;
}

export type RiskAction =
  | 'auto_resolve' // let idle mode handle it
  | 'monitor' // track but don't escalate
  | 'investigate' // needs human attention
  | 'escalate' // create incident, notify
  | 'block' // prevent further agent action
  | 'quarantine'; // isolate and audit

// ---------------------------------------------------------------------------
// Risk Assessment Engine
// ---------------------------------------------------------------------------

export interface RiskContext {
  /** How many times this fingerprint has been seen */
  readonly occurrenceCount?: number;
  /** Whether this error existed before and was resolved */
  readonly wasResolved?: boolean;
  /** Whether the event was caused by an agent */
  readonly isAgentOriginated?: boolean;
  /** Time since last occurrence (ms) */
  readonly timeSinceLastMs?: number;
  /** Number of files affected */
  readonly filesAffected?: number;
  /** Whether tests were skipped */
  readonly testsSkipped?: boolean;
  /** Whether the target file is sensitive (auth, billing, config) */
  readonly isSensitiveFile?: boolean;
}

/**
 * Assess the risk level of a DevEvent given context.
 */
export function assessRisk(event: DevEvent, context: RiskContext = {}): RiskAssessment {
  const severity = event.severity ?? 'low';
  const kind = event.kind;

  // Governance violations are always high risk
  if (kind.startsWith('governance.')) {
    return governanceRisk(event, severity, context);
  }

  // Agent actions get elevated scrutiny
  if (kind.startsWith('agent.') || context.isAgentOriginated) {
    return agentRisk(event, severity, context);
  }

  // Regressions (was resolved, now back)
  if (context.wasResolved) {
    return regressionRisk(event, severity, context);
  }

  // Repeated issues escalate
  if ((context.occurrenceCount ?? 0) >= 5) {
    return repeatedIssueRisk(event, severity, context);
  }

  // Standard severity-based assessment
  return standardRisk(event, severity, context);
}

/**
 * Assess risk for a BugEntity based on accumulated state.
 */
export function assessBugRisk(bug: BugEntity): RiskAssessment {
  const context: RiskContext = {
    occurrenceCount: bug.occurrenceCount,
    wasResolved: bug.status === 'resolved',
  };

  // Synthesize a minimal event for assessment
  const pseudoEvent: DevEvent = {
    id: bug.id,
    kind: 'error.detected',
    source: 'runtime',
    actor: 'system',
    severity: bug.severity,
    ts: bug.lastSeen,
    fingerprint: bug.fingerprint,
    file: bug.file,
    payload: { errorType: bug.errorType },
  };

  return assessRisk(pseudoEvent, context);
}

// ---------------------------------------------------------------------------
// Scoring helpers — pure functions
// ---------------------------------------------------------------------------

const SEVERITY_BASE_SCORE: Record<DevEventSeverity, number> = {
  low: 10,
  medium: 30,
  high: 60,
  critical: 90,
};

function governanceRisk(
  _event: DevEvent,
  severity: DevEventSeverity,
  context: RiskContext
): RiskAssessment {
  const base = SEVERITY_BASE_SCORE[severity];
  const score = Math.min(100, base + 20 + (context.isSensitiveFile ? 10 : 0));

  return {
    level: severity === 'critical' ? 'critical_breach' : 'risky_automation',
    score,
    reason: `Governance violation (${severity})`,
    action: severity === 'critical' ? 'block' : 'escalate',
    isBoss: true,
    hpBonus: Math.min(200, Math.floor(score * 2)),
  };
}

function agentRisk(
  _event: DevEvent,
  severity: DevEventSeverity,
  context: RiskContext
): RiskAssessment {
  let score = SEVERITY_BASE_SCORE[severity];

  // Sensitive file access by agent
  if (context.isSensitiveFile) score += 25;
  // Tests skipped by agent
  if (context.testsSkipped) score += 20;
  // Large blast radius
  if ((context.filesAffected ?? 0) > 10) score += 15;

  score = Math.min(100, score);

  const level: RiskLevel = score >= 70 ? 'risky_automation' : score >= 40 ? 'issue' : 'nuisance';

  return {
    level,
    score,
    reason: agentRiskReason(context),
    action: score >= 70 ? 'escalate' : score >= 40 ? 'investigate' : 'monitor',
    isBoss: score >= 60,
    hpBonus: Math.min(200, Math.floor(score * 1.5)),
  };
}

function regressionRisk(
  _event: DevEvent,
  severity: DevEventSeverity,
  _context: RiskContext
): RiskAssessment {
  const score = Math.min(100, SEVERITY_BASE_SCORE[severity] + 30);

  return {
    level: 'regression',
    score,
    reason: 'Previously resolved issue has returned',
    action: 'investigate',
    isBoss: severity === 'high' || severity === 'critical',
    hpBonus: Math.min(200, Math.floor(score * 1.5)),
  };
}

function repeatedIssueRisk(
  _event: DevEvent,
  severity: DevEventSeverity,
  context: RiskContext
): RiskAssessment {
  const count = context.occurrenceCount ?? 5;
  const repeatBonus = Math.min(30, Math.floor(count / 2));
  const score = Math.min(100, SEVERITY_BASE_SCORE[severity] + repeatBonus);

  return {
    level: 'issue',
    score,
    reason: `Repeated ${count} times`,
    action: score >= 60 ? 'escalate' : 'investigate',
    isBoss: count >= 10 || severity === 'high' || severity === 'critical',
    hpBonus: Math.min(200, Math.floor(score * 1.2)),
  };
}

function standardRisk(
  _event: DevEvent,
  severity: DevEventSeverity,
  context: RiskContext
): RiskAssessment {
  const score = SEVERITY_BASE_SCORE[severity];
  const count = context.occurrenceCount ?? 1;

  if (severity === 'low' && count <= 2) {
    return {
      level: 'noise',
      score,
      reason: 'Low severity, infrequent',
      action: 'auto_resolve',
      isBoss: false,
      hpBonus: 0,
    };
  }

  if (severity === 'medium' && count <= 3) {
    return {
      level: 'nuisance',
      score,
      reason: 'Medium severity, moderate frequency',
      action: 'monitor',
      isBoss: false,
      hpBonus: Math.floor(score * 0.5),
    };
  }

  const level: RiskLevel =
    severity === 'critical' ? 'critical_breach' : severity === 'high' ? 'issue' : 'nuisance';

  return {
    level,
    score,
    reason: `${severity} severity`,
    action: severity === 'critical' ? 'escalate' : severity === 'high' ? 'investigate' : 'monitor',
    isBoss: severity === 'high' || severity === 'critical',
    hpBonus: Math.min(200, Math.floor(score * 1.2)),
  };
}

function agentRiskReason(context: RiskContext): string {
  const parts: string[] = ['Agent-originated action'];
  if (context.isSensitiveFile) parts.push('targets sensitive file');
  if (context.testsSkipped) parts.push('tests were skipped');
  if ((context.filesAffected ?? 0) > 10) parts.push(`${context.filesAffected} files affected`);
  return parts.join('; ');
}

// ---------------------------------------------------------------------------
// Sensitive file detection
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS = [
  /auth/i,
  /secret/i,
  /credential/i,
  /\.env/,
  /password/i,
  /billing/i,
  /payment/i,
  /migration/i,
  /security/i,
  /\.pem$/,
  /\.key$/,
  /config\.(json|ya?ml|toml)$/,
];

/**
 * Check if a file path matches sensitive patterns.
 */
export function isSensitiveFile(filePath: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(filePath));
}

// ---------------------------------------------------------------------------
// Risk level to game severity mapping
// ---------------------------------------------------------------------------

export function riskToGameSeverity(level: RiskLevel): number {
  switch (level) {
    case 'noise':
      return 1;
    case 'nuisance':
      return 2;
    case 'issue':
      return 3;
    case 'regression':
      return 4;
    case 'risky_automation':
      return 4;
    case 'critical_breach':
      return 5;
  }
}

// Execution Event Projections — derived views from the execution event stream.
// Causal chain construction, risk scoring, failure clustering, encounter mapping.
// No DOM, no Node.js APIs — pure domain logic.

import type {
  ExecutionEvent,
  ExecutionEventLog,
  FailureCluster,
  EncounterMapping,
  RiskScore,
  RiskFactor,
  Severity,
} from '../types.js';
import { simpleHash } from '../hash.js';
import {
  FAILURE_KINDS,
  VIOLATION_KINDS,
  AGENT_ACTION_KINDS,
  TESTS_SKIPPED,
  RUNTIME_EXCEPTION,
  TEST_SUITE_FAILED,
  DEPLOYMENT_FAILED,
  BUILD_FAILED,
} from './event-schema.js';

// --- Causal Chain ---

/**
 * Build the full causal chain leading to an event.
 * Walks `causedBy` references back to the root cause.
 * Returns events in chronological order (root first).
 */
export function buildCausalChain(log: ExecutionEventLog, eventId: string): ExecutionEvent[] {
  return log.trace(eventId);
}

// --- Risk Scoring ---

const RISK_WEIGHTS = {
  failure: 10,
  violation: 25,
  skippedTests: 15,
  sensitiveFileEdit: 20,
  highActionRate: 5,
} as const;

const SENSITIVE_PATTERNS = [
  /auth/i,
  /security/i,
  /password/i,
  /secret/i,
  /key/i,
  /token/i,
  /credential/i,
  /\.env/i,
  /migration/i,
  /deploy/i,
];

function isSensitiveFile(file: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(file));
}

/**
 * Score an agent run by its risk profile.
 * Higher score = more risk. Based on failures, violations,
 * skipped tests, sensitive file edits, and action velocity.
 */
export function scoreAgentRun(log: ExecutionEventLog, agentRunId: string): RiskScore {
  const events = log.query({ agentRunId });
  const factors: RiskFactor[] = [];

  let totalScore = 0;
  let failureCount = 0;
  let violationCount = 0;

  // Count failures
  const failures = events.filter((e) => FAILURE_KINDS.has(e.kind));
  failureCount = failures.length;
  if (failureCount > 0) {
    const weight = failureCount * RISK_WEIGHTS.failure;
    totalScore += weight;
    factors.push({
      name: 'failures',
      weight,
      detail: `${failureCount} failure(s) during agent run`,
    });
  }

  // Count violations
  const violations = events.filter((e) => VIOLATION_KINDS.has(e.kind));
  violationCount = violations.length;
  if (violationCount > 0) {
    const weight = violationCount * RISK_WEIGHTS.violation;
    totalScore += weight;
    factors.push({
      name: 'violations',
      weight,
      detail: `${violationCount} policy/invariant violation(s)`,
    });
  }

  // Skipped tests
  const skipped = events.filter((e) => e.kind === TESTS_SKIPPED);
  if (skipped.length > 0) {
    totalScore += RISK_WEIGHTS.skippedTests;
    factors.push({
      name: 'skipped_tests',
      weight: RISK_WEIGHTS.skippedTests,
      detail: `Tests were skipped ${skipped.length} time(s)`,
    });
  }

  // Sensitive file edits
  const agentActions = events.filter((e) => AGENT_ACTION_KINDS.has(e.kind));
  const sensitiveEdits = agentActions.filter(
    (e) => e.context.file && isSensitiveFile(e.context.file)
  );
  if (sensitiveEdits.length > 0) {
    const weight = sensitiveEdits.length * RISK_WEIGHTS.sensitiveFileEdit;
    totalScore += weight;
    factors.push({
      name: 'sensitive_file_edits',
      weight,
      detail: `${sensitiveEdits.length} edit(s) to sensitive files`,
    });
  }

  // High action rate (>50 actions in a single run is suspicious)
  if (agentActions.length > 50) {
    totalScore += RISK_WEIGHTS.highActionRate;
    factors.push({
      name: 'high_action_rate',
      weight: RISK_WEIGHTS.highActionRate,
      detail: `${agentActions.length} agent actions in a single run`,
    });
  }

  // Determine risk level
  let level: RiskScore['level'];
  if (totalScore >= 75) level = 'critical';
  else if (totalScore >= 40) level = 'high';
  else if (totalScore >= 15) level = 'medium';
  else level = 'low';

  return {
    agentRunId,
    score: totalScore,
    level,
    factors,
    eventCount: events.length,
    failureCount,
    violationCount,
  };
}

// --- Failure Clustering ---

export interface ClusterOptions {
  readonly windowMs?: number;
}

/**
 * Cluster related failures by file and time proximity.
 * Groups failures that share a common file or occur within a time window.
 */
export function clusterFailures(
  log: ExecutionEventLog,
  options: ClusterOptions = {}
): FailureCluster[] {
  const windowMs = options.windowMs ?? 60_000; // 1 minute default
  const failures = log.query({}).filter((e) => FAILURE_KINDS.has(e.kind));

  if (failures.length === 0) return [];

  // Group by file, then by time proximity
  const byFile = new Map<string, ExecutionEvent[]>();
  const noFile: ExecutionEvent[] = [];

  for (const event of failures) {
    const file = event.context.file ?? (event.payload.file as string | undefined);
    if (file) {
      const existing = byFile.get(file) ?? [];
      existing.push(event);
      byFile.set(file, existing);
    } else {
      noFile.push(event);
    }
  }

  const clusters: FailureCluster[] = [];

  // File-based clusters
  for (const [file, fileEvents] of byFile) {
    const sorted = [...fileEvents].sort((a, b) => a.timestamp - b.timestamp);
    let clusterEvents: ExecutionEvent[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].timestamp - sorted[i - 1].timestamp <= windowMs) {
        clusterEvents.push(sorted[i]);
      } else {
        if (clusterEvents.length > 0) {
          clusters.push({
            id: simpleHash(`cluster:${file}:${clusterEvents[0].id}`),
            rootEvent: clusterEvents[0],
            events: clusterEvents,
            commonFile: file,
            commonKind: getMostCommonKind(clusterEvents),
            severity: Math.min(5, clusterEvents.length) as number,
          });
        }
        clusterEvents = [sorted[i]];
      }
    }
    if (clusterEvents.length > 0) {
      clusters.push({
        id: simpleHash(`cluster:${file}:${clusterEvents[0].id}`),
        rootEvent: clusterEvents[0],
        events: clusterEvents,
        commonFile: file,
        commonKind: getMostCommonKind(clusterEvents),
        severity: Math.min(5, clusterEvents.length) as number,
      });
    }
  }

  // Time-based clusters for events without files
  if (noFile.length > 0) {
    const sorted = [...noFile].sort((a, b) => a.timestamp - b.timestamp);
    let clusterEvents: ExecutionEvent[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].timestamp - sorted[i - 1].timestamp <= windowMs) {
        clusterEvents.push(sorted[i]);
      } else {
        if (clusterEvents.length > 0) {
          clusters.push({
            id: simpleHash(`cluster:time:${clusterEvents[0].id}`),
            rootEvent: clusterEvents[0],
            events: clusterEvents,
            commonKind: getMostCommonKind(clusterEvents),
            severity: Math.min(5, clusterEvents.length) as number,
          });
        }
        clusterEvents = [sorted[i]];
      }
    }
    if (clusterEvents.length > 0) {
      clusters.push({
        id: simpleHash(`cluster:time:${clusterEvents[0].id}`),
        rootEvent: clusterEvents[0],
        events: clusterEvents,
        commonKind: getMostCommonKind(clusterEvents),
        severity: Math.min(5, clusterEvents.length) as number,
      });
    }
  }

  return clusters.sort((a, b) => b.severity - a.severity);
}

function getMostCommonKind(events: ExecutionEvent[]): string {
  const counts = new Map<string, number>();
  for (const e of events) {
    counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  }
  let maxKind = events[0].kind;
  let maxCount = 0;
  for (const [kind, count] of counts) {
    if (count > maxCount) {
      maxKind = kind;
      maxCount = count;
    }
  }
  return maxKind;
}

// --- Encounter Mapping ---

const KIND_TO_ENCOUNTER: Record<
  string,
  { encounterType: EncounterMapping['encounterType']; severity: Severity; name: string }
> = {
  [RUNTIME_EXCEPTION]: {
    encounterType: 'monster',
    severity: 3,
    name: 'Runtime Wraith',
  },
  [TEST_SUITE_FAILED]: {
    encounterType: 'monster',
    severity: 2,
    name: 'Test Phantom',
  },
  [BUILD_FAILED]: {
    encounterType: 'monster',
    severity: 2,
    name: 'Build Specter',
  },
  [DEPLOYMENT_FAILED]: {
    encounterType: 'boss',
    severity: 4,
    name: 'Deploy Colossus',
  },
};

/**
 * Map an execution event to a game encounter.
 * Only failure events produce encounters.
 * Returns null for non-failure events.
 */
export function mapToEncounter(event: ExecutionEvent): EncounterMapping | null {
  const mapping = KIND_TO_ENCOUNTER[event.kind];
  if (!mapping) return null;

  const description = event.payload.message
    ? String(event.payload.message)
    : `${event.kind} in ${event.context.file ?? 'unknown'}`;

  return {
    eventId: event.id,
    encounterType: mapping.encounterType,
    severity: mapping.severity,
    name: mapping.name,
    description,
  };
}

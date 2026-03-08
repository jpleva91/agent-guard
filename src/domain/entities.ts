// Platform entity model — BugEntity and IncidentEntity.
// BugEntity tracks individual bug instances derived from events.
// IncidentEntity clusters related bugs into actionable incidents.
// No DOM, no Node.js APIs — pure data definitions and factories.

import type { DevEvent, DevEventSeverity } from './dev-event.js';
import { simpleHash } from './hash.js';

// ---------------------------------------------------------------------------
// Bug Status — lifecycle states
// ---------------------------------------------------------------------------

export type BugStatus = 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'suppressed';

// ---------------------------------------------------------------------------
// BugEntity — a tracked software defect
// ---------------------------------------------------------------------------

export interface BugEntity {
  /** Stable bug ID derived from fingerprint */
  readonly id: string;
  /** Content fingerprint (from error deduplication) */
  readonly fingerprint: string;
  /** Error type classification */
  readonly errorType: string;
  /** Human-readable error message */
  readonly message: string;
  /** Operational severity */
  readonly severity: DevEventSeverity;
  /** Current lifecycle status */
  status: BugStatus;
  /** First seen timestamp (ISO 8601) */
  readonly firstSeen: string;
  /** Last seen timestamp (ISO 8601) */
  lastSeen: string;
  /** Total occurrence count */
  occurrenceCount: number;
  /** File path most associated with this bug */
  readonly file?: string;
  /** Line number */
  readonly line?: number;
  /** Repository */
  readonly repo?: string;
  /** Branch where first detected */
  readonly branch?: string;
  /** Commit SHA where first detected */
  readonly firstCommit?: string;
  /** Commit SHA that resolved it */
  resolvedCommit?: string;
  /** Resolved timestamp */
  resolvedAt?: string;
  /** IDs of all DevEvents related to this bug */
  readonly eventIds: string[];
  /** Incident this bug belongs to (if clustered) */
  incidentId?: string;
  /** BugMon species ID for game layer (optional) */
  speciesId?: number;
}

// ---------------------------------------------------------------------------
// BugEntity Factory
// ---------------------------------------------------------------------------

export interface BugEntityInput {
  readonly fingerprint: string;
  readonly errorType: string;
  readonly message: string;
  readonly severity: DevEventSeverity;
  readonly file?: string;
  readonly line?: number;
  readonly repo?: string;
  readonly branch?: string;
  readonly commit?: string;
  readonly eventId?: string;
}

export function createBugEntity(input: BugEntityInput): BugEntity {
  const now = new Date().toISOString();
  return {
    id: `bug_${simpleHash(input.fingerprint)}`,
    fingerprint: input.fingerprint,
    errorType: input.errorType,
    message: input.message,
    severity: input.severity,
    status: 'open',
    firstSeen: now,
    lastSeen: now,
    occurrenceCount: 1,
    file: input.file,
    line: input.line,
    repo: input.repo,
    branch: input.branch,
    firstCommit: input.commit,
    eventIds: input.eventId ? [input.eventId] : [],
  };
}

/**
 * Record a new occurrence of an existing bug.
 * Returns a new BugEntity with updated counts and timestamps.
 */
export function recordOccurrence(bug: BugEntity, event: DevEvent): BugEntity {
  return {
    ...bug,
    lastSeen: event.ts,
    occurrenceCount: bug.occurrenceCount + 1,
    eventIds: [...bug.eventIds, event.id],
  };
}

/**
 * Mark a bug as resolved.
 */
export function resolveBug(bug: BugEntity, commit?: string): BugEntity {
  return {
    ...bug,
    status: 'resolved',
    resolvedAt: new Date().toISOString(),
    resolvedCommit: commit,
  };
}

// ---------------------------------------------------------------------------
// IncidentEntity — a cluster of related bugs
// ---------------------------------------------------------------------------

export type IncidentStatus = 'open' | 'investigating' | 'mitigated' | 'resolved';

export type IncidentPriority = 'p0' | 'p1' | 'p2' | 'p3';

export interface IncidentEntity {
  /** Unique incident ID */
  readonly id: string;
  /** Human-readable title (auto-generated or manual) */
  title: string;
  /** Current status */
  status: IncidentStatus;
  /** Priority based on severity and impact */
  priority: IncidentPriority;
  /** Highest severity among constituent bugs */
  readonly maxSeverity: DevEventSeverity;
  /** IDs of bugs in this cluster */
  readonly bugIds: string[];
  /** Correlation dimensions that linked these bugs */
  readonly correlationKeys: string[];
  /** First bug timestamp */
  readonly openedAt: string;
  /** Resolution timestamp */
  resolvedAt?: string;
  /** Repository */
  readonly repo?: string;
  /** Branch */
  readonly branch?: string;
  /** Root cause (if identified) */
  rootCause?: string;
  /** Total events across all bugs */
  totalEvents: number;
}

// ---------------------------------------------------------------------------
// IncidentEntity Factory
// ---------------------------------------------------------------------------

let incidentCounter = 0;

export function resetIncidentCounter(): void {
  incidentCounter = 0;
}

export function createIncident(
  bugs: readonly BugEntity[],
  correlationKeys: string[]
): IncidentEntity {
  if (bugs.length === 0) throw new Error('Cannot create incident with no bugs');

  const maxSeverity = deriveMaxSeverity(bugs.map((b) => b.severity));
  const priority = severityToPriority(maxSeverity);
  const title = generateIncidentTitle(bugs);

  return {
    id: `inc_${++incidentCounter}_${simpleHash(bugs.map((b) => b.id).join(','))}`,
    title,
    status: 'open',
    priority,
    maxSeverity,
    bugIds: bugs.map((b) => b.id),
    correlationKeys,
    openedAt: bugs[0].firstSeen,
    repo: bugs[0].repo,
    branch: bugs[0].branch,
    totalEvents: bugs.reduce((sum, b) => sum + b.eventIds.length, 0),
  };
}

/**
 * Add a bug to an existing incident. Returns a new IncidentEntity.
 */
export function addBugToIncident(incident: IncidentEntity, bug: BugEntity): IncidentEntity {
  if (incident.bugIds.includes(bug.id)) return incident;

  const allSeverities = [incident.maxSeverity, bug.severity];
  const maxSeverity = deriveMaxSeverity(allSeverities);

  return {
    ...incident,
    bugIds: [...incident.bugIds, bug.id],
    maxSeverity,
    priority: severityToPriority(maxSeverity),
    totalEvents: incident.totalEvents + bug.eventIds.length,
  };
}

/**
 * Resolve an incident.
 */
export function resolveIncident(incident: IncidentEntity, rootCause?: string): IncidentEntity {
  return {
    ...incident,
    status: 'resolved',
    resolvedAt: new Date().toISOString(),
    rootCause,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<DevEventSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function deriveMaxSeverity(severities: readonly DevEventSeverity[]): DevEventSeverity {
  let max: DevEventSeverity = 'low';
  for (const s of severities) {
    if (SEVERITY_ORDER[s] > SEVERITY_ORDER[max]) max = s;
  }
  return max;
}

function severityToPriority(severity: DevEventSeverity): IncidentPriority {
  switch (severity) {
    case 'critical':
      return 'p0';
    case 'high':
      return 'p1';
    case 'medium':
      return 'p2';
    default:
      return 'p3';
  }
}

function generateIncidentTitle(bugs: readonly BugEntity[]): string {
  if (bugs.length === 1) {
    return `${bugs[0].errorType}: ${bugs[0].message.slice(0, 80)}`;
  }
  const types = [...new Set(bugs.map((b) => b.errorType))];
  if (types.length === 1) {
    return `${types[0]} cluster (${bugs.length} bugs)`;
  }
  return `Mixed incident: ${types.slice(0, 3).join(', ')} (${bugs.length} bugs)`;
}

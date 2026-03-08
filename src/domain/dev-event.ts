// Canonical DevEvent — the platform substrate.
// Every developer signal, CI event, agent action, and governance decision
// flows through this envelope. The game is a read model on top of this.
// No DOM, no Node.js APIs — pure data definitions and factories.

import { simpleHash } from './hash.js';

// ---------------------------------------------------------------------------
// Event Source — where the signal originated
// ---------------------------------------------------------------------------

export type DevEventSource =
  | 'cli'
  | 'git'
  | 'ci'
  | 'ide'
  | 'agent'
  | 'browser'
  | 'test'
  | 'build'
  | 'lint'
  | 'runtime';

// ---------------------------------------------------------------------------
// Actor — who caused the event
// ---------------------------------------------------------------------------

export type DevEventActor = 'human' | 'agent' | 'system';

// ---------------------------------------------------------------------------
// Severity — operational risk level, not game difficulty
// ---------------------------------------------------------------------------

export type DevEventSeverity = 'low' | 'medium' | 'high' | 'critical';

// ---------------------------------------------------------------------------
// Event Kind Categories
// ---------------------------------------------------------------------------

export type DevEventKind =
  // Error detection
  | 'error.detected'
  | 'error.repeated'
  | 'error.resolved'
  // Test lifecycle
  | 'test.passed'
  | 'test.failed'
  | 'test.flaky'
  | 'test.skipped'
  // Build lifecycle
  | 'build.succeeded'
  | 'build.failed'
  // Lint
  | 'lint.passed'
  | 'lint.failed'
  // Git events
  | 'git.commit'
  | 'git.push'
  | 'git.pr.opened'
  | 'git.pr.merged'
  | 'git.pr.closed'
  | 'git.branch.created'
  | 'git.branch.deleted'
  // Deploy
  | 'deploy.started'
  | 'deploy.succeeded'
  | 'deploy.failed'
  // Agent actions
  | 'agent.file.modified'
  | 'agent.test.skipped'
  | 'agent.action.requested'
  | 'agent.action.denied'
  | 'agent.action.escalated'
  // Governance
  | 'governance.policy.violated'
  | 'governance.invariant.breached'
  | 'governance.blast.exceeded'
  // Incidents
  | 'incident.opened'
  | 'incident.escalated'
  | 'incident.resolved'
  // Session
  | 'session.started'
  | 'session.ended';

// ---------------------------------------------------------------------------
// Canonical DevEvent — the one substrate for everything
// ---------------------------------------------------------------------------

export interface DevEvent {
  /** Unique event ID (monotonic, sortable) */
  readonly id: string;
  /** ISO 8601 timestamp */
  readonly ts: string;
  /** Where the signal originated */
  readonly source: DevEventSource;
  /** Who caused it */
  readonly actor: DevEventActor;
  /** Event classification */
  readonly kind: DevEventKind;
  /** Repository identifier (org/repo or path) */
  readonly repo?: string;
  /** Git branch */
  readonly branch?: string;
  /** Git commit SHA */
  readonly commit?: string;
  /** Content fingerprint for deduplication */
  readonly fingerprint: string;
  /** Operational severity */
  readonly severity?: DevEventSeverity;
  /** Correlation dimensions for clustering */
  readonly correlationId?: string;
  /** Agent run ID if agent-originated */
  readonly agentRunId?: string;
  /** CI job ID if CI-originated */
  readonly ciJobId?: string;
  /** File path if file-specific */
  readonly file?: string;
  /** Arbitrary structured payload */
  readonly payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// DevEvent Filter
// ---------------------------------------------------------------------------

export interface DevEventFilter {
  readonly kind?: DevEventKind;
  readonly source?: DevEventSource;
  readonly actor?: DevEventActor;
  readonly severity?: DevEventSeverity;
  readonly repo?: string;
  readonly branch?: string;
  readonly fingerprint?: string;
  readonly correlationId?: string;
  readonly since?: string;
  readonly until?: string;
  readonly file?: string;
  readonly limit?: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let devEventCounter = 0;

export function resetDevEventCounter(): void {
  devEventCounter = 0;
}

function generateDevEventId(ts: string): string {
  return `dev_${ts.replace(/[^0-9]/g, '').slice(0, 14)}_${++devEventCounter}`;
}

export interface DevEventInput {
  readonly source: DevEventSource;
  readonly actor: DevEventActor;
  readonly kind: DevEventKind;
  readonly repo?: string;
  readonly branch?: string;
  readonly commit?: string;
  readonly severity?: DevEventSeverity;
  readonly correlationId?: string;
  readonly agentRunId?: string;
  readonly ciJobId?: string;
  readonly file?: string;
  readonly payload?: Record<string, unknown>;
}

/**
 * Create a canonical DevEvent.
 * Assigns unique ID, timestamp, and content fingerprint.
 */
export function createDevEvent(input: DevEventInput): DevEvent {
  const ts = new Date().toISOString();
  const payload = input.payload ?? {};

  const fingerprintSource = `${input.kind}:${input.source}:${JSON.stringify(payload)}`;
  const fp = simpleHash(fingerprintSource);

  const base: Record<string, unknown> = {
    id: generateDevEventId(ts),
    ts,
    source: input.source,
    actor: input.actor,
    kind: input.kind,
    fingerprint: fp,
    payload,
  };

  // Only assign optional fields if present (keep the object clean)
  if (input.repo !== undefined) base.repo = input.repo;
  if (input.branch !== undefined) base.branch = input.branch;
  if (input.commit !== undefined) base.commit = input.commit;
  if (input.severity !== undefined) base.severity = input.severity;
  if (input.correlationId !== undefined) base.correlationId = input.correlationId;
  if (input.agentRunId !== undefined) base.agentRunId = input.agentRunId;
  if (input.ciJobId !== undefined) base.ciJobId = input.ciJobId;
  if (input.file !== undefined) base.file = input.file;

  return base as unknown as DevEvent;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_SOURCES = new Set<string>([
  'cli',
  'git',
  'ci',
  'ide',
  'agent',
  'browser',
  'test',
  'build',
  'lint',
  'runtime',
]);

const VALID_ACTORS = new Set<string>(['human', 'agent', 'system']);

const VALID_SEVERITIES = new Set<string>(['low', 'medium', 'high', 'critical']);

const VALID_KINDS = new Set<string>([
  'error.detected',
  'error.repeated',
  'error.resolved',
  'test.passed',
  'test.failed',
  'test.flaky',
  'test.skipped',
  'build.succeeded',
  'build.failed',
  'lint.passed',
  'lint.failed',
  'git.commit',
  'git.push',
  'git.pr.opened',
  'git.pr.merged',
  'git.pr.closed',
  'git.branch.created',
  'git.branch.deleted',
  'deploy.started',
  'deploy.succeeded',
  'deploy.failed',
  'agent.file.modified',
  'agent.test.skipped',
  'agent.action.requested',
  'agent.action.denied',
  'agent.action.escalated',
  'governance.policy.violated',
  'governance.invariant.breached',
  'governance.blast.exceeded',
  'incident.opened',
  'incident.escalated',
  'incident.resolved',
  'session.started',
  'session.ended',
]);

export interface DevEventValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
}

export function validateDevEvent(event: unknown): DevEventValidationResult {
  const errors: string[] = [];

  if (!event || typeof event !== 'object') {
    return { valid: false, errors: ['DevEvent must be a non-null object'] };
  }

  const e = event as Record<string, unknown>;

  if (typeof e.id !== 'string' || !e.id) errors.push('Missing or invalid id');
  if (typeof e.ts !== 'string' || !e.ts) errors.push('Missing or invalid ts');
  if (!VALID_SOURCES.has(e.source as string)) errors.push(`Invalid source: ${e.source}`);
  if (!VALID_ACTORS.has(e.actor as string)) errors.push(`Invalid actor: ${e.actor}`);
  if (!VALID_KINDS.has(e.kind as string)) errors.push(`Invalid kind: ${e.kind}`);
  if (typeof e.fingerprint !== 'string' || !e.fingerprint)
    errors.push('Missing or invalid fingerprint');
  if (e.severity !== undefined && !VALID_SEVERITIES.has(e.severity as string))
    errors.push(`Invalid severity: ${e.severity}`);
  if (e.payload !== undefined && (typeof e.payload !== 'object' || e.payload === null))
    errors.push('Payload must be an object');

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Bridge: DevEvent → DomainEvent (backward compatibility)
// ---------------------------------------------------------------------------

/**
 * Map DevEvent kind to the closest existing DomainEvent EventKind.
 * Returns undefined if no mapping exists.
 */
export function devEventKindToDomainKind(kind: DevEventKind): string | undefined {
  const MAP: Record<string, string> = {
    'error.detected': 'ErrorObserved',
    'test.failed': 'TestCompleted',
    'test.passed': 'TestCompleted',
    'build.failed': 'BuildCompleted',
    'build.succeeded': 'BuildCompleted',
    'lint.failed': 'LintCompleted',
    'lint.passed': 'LintCompleted',
    'git.commit': 'CommitCreated',
    'deploy.succeeded': 'DeployCompleted',
    'deploy.failed': 'DeployCompleted',
    'governance.policy.violated': 'PolicyDenied',
    'governance.invariant.breached': 'InvariantViolation',
    'governance.blast.exceeded': 'BlastRadiusExceeded',
    'agent.action.denied': 'ActionDenied',
    'agent.action.escalated': 'ActionEscalated',
    'session.started': 'RunStarted',
    'session.ended': 'RunEnded',
  };
  return MAP[kind];
}

// Cross-session event aggregator — reads multiple JSONL session files
// and extracts violation events into a unified collection.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DomainEvent } from '@red-codes/core';
import type { ViolationRecord, FailureCategory } from './types.js';

const DEFAULT_BASE_DIR = '.agentguard';
const EVENTS_DIR = 'events';

/** Event kinds that represent governance violations */
const VIOLATION_KINDS = new Set([
  'InvariantViolation',
  'PolicyDenied',
  'ActionDenied',
  'BlastRadiusExceeded',
  'MergeGuardFailure',
  'UnauthorizedAction',
]);

/** List all session IDs from the events directory */
export function listSessionIds(baseDir = DEFAULT_BASE_DIR): string[] {
  const eventsDir = join(baseDir, EVENTS_DIR);
  if (!existsSync(eventsDir)) return [];

  return readdirSync(eventsDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => f.replace('.jsonl', ''))
    .sort();
}

/** Load all domain events from a single JSONL file */
export function loadSessionEvents(sessionId: string, baseDir = DEFAULT_BASE_DIR): DomainEvent[] {
  const filePath = join(baseDir, EVENTS_DIR, `${sessionId}.jsonl`);
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf8');
  const events: DomainEvent[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as DomainEvent);
    } catch {
      // Skip malformed lines
    }
  }

  return events;
}

/** Extract violation records from a domain event */
function toViolationRecord(event: DomainEvent, sessionId: string): ViolationRecord | null {
  if (!VIOLATION_KINDS.has(event.kind)) return null;

  const rec = event as unknown as Record<string, unknown>;
  const metadata = (rec.metadata as Record<string, unknown>) ?? {};

  return {
    sessionId,
    eventId: event.id,
    kind: event.kind,
    timestamp: event.timestamp,
    actionType: (rec.actionType as string) ?? (rec.action as string) ?? undefined,
    target: (rec.target as string) ?? (rec.file as string) ?? undefined,
    reason: (rec.reason as string) ?? undefined,
    invariantId: (rec.invariant as string) ?? (rec.invariantId as string) ?? undefined,
    metadata,
  };
}

/** Aggregate violation records from all sessions in the events directory */
export function aggregateViolations(baseDir = DEFAULT_BASE_DIR): {
  violations: ViolationRecord[];
  sessionCount: number;
  allEvents: DomainEvent[];
} {
  const sessionIds = listSessionIds(baseDir);
  const violations: ViolationRecord[] = [];
  const allEvents: DomainEvent[] = [];

  for (const sessionId of sessionIds) {
    const events = loadSessionEvents(sessionId, baseDir);
    allEvents.push(...events);

    for (const event of events) {
      const record = toViolationRecord(event, sessionId);
      if (record) violations.push(record);
    }
  }

  return { violations, sessionCount: sessionIds.length, allEvents };
}

/** Event kinds representing all failure types (superset of violations) */
const FAILURE_KINDS = new Set([
  // Governance violations
  'InvariantViolation',
  'PolicyDenied',
  'ActionDenied',
  'BlastRadiusExceeded',
  'MergeGuardFailure',
  'UnauthorizedAction',
  // Execution failures
  'ActionFailed',
  // Escalation events
  'ActionEscalated',
  // Pipeline failures
  'StageFailed',
  'PipelineFailed',
  // File scope violations
  'FileScopeViolation',
]);

/** Categorize a failure event kind */
export function categorizeFailure(kind: string): FailureCategory {
  switch (kind) {
    case 'ActionFailed':
      return 'execution';
    case 'ActionEscalated':
      return 'escalation';
    case 'StageFailed':
    case 'PipelineFailed':
      return 'pipeline';
    case 'ActionDenied':
    case 'PolicyDenied':
    case 'UnauthorizedAction':
      return 'denial';
    default:
      return 'violation';
  }
}

/** Extract a failure record from a domain event (broader than violations) */
function toFailureRecord(event: DomainEvent, sessionId: string): ViolationRecord | null {
  if (!FAILURE_KINDS.has(event.kind)) return null;

  const rec = event as unknown as Record<string, unknown>;
  const metadata = (rec.metadata as Record<string, unknown>) ?? {};

  return {
    sessionId,
    eventId: event.id,
    kind: event.kind,
    timestamp: event.timestamp,
    actionType: (rec.actionType as string) ?? (rec.action as string) ?? undefined,
    target:
      (rec.target as string) ?? (rec.file as string) ?? (rec.failedStage as string) ?? undefined,
    reason:
      (rec.reason as string) ??
      (rec.error as string) ??
      (rec.errors as string[] | undefined)?.[0] ??
      undefined,
    invariantId: (rec.invariant as string) ?? (rec.invariantId as string) ?? undefined,
    metadata,
  };
}

/** Aggregate all failure records (violations + execution failures + escalations + pipeline failures) */
export function aggregateFailures(baseDir = DEFAULT_BASE_DIR): {
  failures: ViolationRecord[];
  sessionCount: number;
  allEvents: DomainEvent[];
} {
  const sessionIds = listSessionIds(baseDir);
  const failures: ViolationRecord[] = [];
  const allEvents: DomainEvent[] = [];

  for (const sessionId of sessionIds) {
    const events = loadSessionEvents(sessionId, baseDir);
    allEvents.push(...events);

    for (const event of events) {
      const record = toFailureRecord(event, sessionId);
      if (record) failures.push(record);
    }
  }

  return { failures, sessionCount: sessionIds.length, allEvents };
}

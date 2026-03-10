// Replay Engine — reconstructs governance sessions from persisted JSONL event streams.
//
// Loads domain events from .agentguard/events/<runId>.jsonl, groups them into
// action encounters (REQUESTED → ALLOWED/DENIED → EXECUTED/FAILED), and provides
// a programmatic API for session analysis, comparators, and CLI display.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DomainEvent, EventKind } from '../core/types.js';
import {
  ACTION_REQUESTED,
  ACTION_ALLOWED,
  ACTION_DENIED,
  ACTION_ESCALATED,
  ACTION_EXECUTED,
  ACTION_FAILED,
  DECISION_RECORDED,
  SIMULATION_COMPLETED,
  POLICY_DENIED,
  INVARIANT_VIOLATION,
  BLAST_RADIUS_EXCEEDED,
  MERGE_GUARD_FAILURE,
  RUN_STARTED,
  RUN_ENDED,
} from '../events/schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single action encounter — the full lifecycle of one proposed action. */
export interface ReplayAction {
  /** The index of this action in the session (0-based). */
  readonly index: number;
  /** The ActionRequested event that started this encounter. */
  readonly requestedEvent: DomainEvent;
  /** The ActionAllowed or ActionDenied decision event (null if stream truncated). */
  readonly decisionEvent: DomainEvent | null;
  /** The ActionExecuted or ActionFailed result (null if denied or dry-run). */
  readonly executionEvent: DomainEvent | null;
  /** The SimulationCompleted event if pre-execution simulation ran. */
  readonly simulationEvent: DomainEvent | null;
  /** The DecisionRecorded audit event. */
  readonly decisionRecordEvent: DomainEvent | null;
  /** ActionEscalated event if the action was escalated. */
  readonly escalationEvent: DomainEvent | null;
  /** Governance violation events (PolicyDenied, InvariantViolation, etc.). */
  readonly governanceEvents: readonly DomainEvent[];
  /** Whether this action was ultimately allowed. */
  readonly allowed: boolean;
  /** Whether this action was executed (allowed + not dry-run). */
  readonly executed: boolean;
  /** Whether execution succeeded (false if ActionFailed). */
  readonly succeeded: boolean;
  /** Action type from the requested event (e.g. 'file.write', 'git.push'). */
  readonly actionType: string;
  /** Target from the requested event. */
  readonly target: string;
}

/** Session-level summary statistics. */
export interface ReplaySessionSummary {
  readonly totalActions: number;
  readonly allowed: number;
  readonly denied: number;
  readonly executed: number;
  readonly failed: number;
  readonly violations: number;
  readonly escalations: number;
  readonly simulationsRun: number;
  readonly durationMs: number;
  readonly actionTypes: Readonly<Record<string, number>>;
  readonly denialReasons: readonly string[];
}

/** A fully reconstructed governance session. */
export interface ReplaySession {
  /** The run ID extracted from events or the JSONL filename. */
  readonly runId: string;
  /** All raw events in timestamp order. */
  readonly events: readonly DomainEvent[];
  /** Reconstructed action encounters, in order. */
  readonly actions: readonly ReplayAction[];
  /** Session-level summary statistics. */
  readonly summary: ReplaySessionSummary;
  /** The RunStarted event (if present). */
  readonly startEvent: DomainEvent | null;
  /** The RunEnded event (if present). */
  readonly endEvent: DomainEvent | null;
}

/** Options for loading a replay session. */
export interface ReplayLoadOptions {
  /** Base directory containing the events/ folder. Defaults to '.agentguard'. */
  readonly baseDir?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BASE_DIR = '.agentguard';
const EVENTS_DIR = 'events';

/** Event kinds that represent governance violations/denials. */
const GOVERNANCE_EVENT_KINDS: ReadonlySet<string> = new Set([
  POLICY_DENIED,
  INVARIANT_VIOLATION,
  BLAST_RADIUS_EXCEEDED,
  MERGE_GUARD_FAILURE,
]);

/** Event kinds that represent action lifecycle decisions. */
const DECISION_EVENT_KINDS: ReadonlySet<string> = new Set([ACTION_ALLOWED, ACTION_DENIED]);

/** Event kinds that represent action execution outcomes. */
const EXECUTION_EVENT_KINDS: ReadonlySet<string> = new Set([ACTION_EXECUTED, ACTION_FAILED]);

// ---------------------------------------------------------------------------
// JSONL Loading
// ---------------------------------------------------------------------------

/**
 * Load domain events from a JSONL file.
 * Each line is a JSON-serialized DomainEvent.
 * Malformed lines are silently skipped.
 */
export function loadEventsFromJsonl(filePath: string): DomainEvent[] {
  if (!existsSync(filePath)) {
    return [];
  }

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

/**
 * Resolve the JSONL file path for a given run ID.
 */
export function resolveEventFilePath(runId: string, baseDir?: string): string {
  return join(baseDir || DEFAULT_BASE_DIR, EVENTS_DIR, `${runId}.jsonl`);
}

/**
 * List all available run IDs that have stored events.
 */
export function listRunIds(baseDir?: string): string[] {
  const eventsDir = join(baseDir || DEFAULT_BASE_DIR, EVENTS_DIR);
  if (!existsSync(eventsDir)) return [];

  return readdirSync(eventsDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => f.replace('.jsonl', ''))
    .sort()
    .reverse();
}

// ---------------------------------------------------------------------------
// Event Grouping
// ---------------------------------------------------------------------------

/**
 * Group a flat list of events into action encounters.
 * Events are correlated by their position in the stream — each ActionRequested
 * event starts a new encounter, and subsequent events are attached to it until
 * the next ActionRequested.
 */
function groupEventsIntoActions(events: readonly DomainEvent[]): ReplayAction[] {
  const actions: ReplayAction[] = [];
  let currentActionEvents: DomainEvent[] = [];
  let actionIndex = 0;

  function flushAction(): void {
    if (currentActionEvents.length === 0) return;

    const requested = currentActionEvents.find((e) => e.kind === ACTION_REQUESTED) || null;
    if (!requested) {
      // No ActionRequested — these are orphan events, skip
      currentActionEvents = [];
      return;
    }

    const decisionEvent = currentActionEvents.find((e) => DECISION_EVENT_KINDS.has(e.kind)) || null;
    const executionEvent =
      currentActionEvents.find((e) => EXECUTION_EVENT_KINDS.has(e.kind)) || null;
    const simulationEvent =
      currentActionEvents.find((e) => e.kind === SIMULATION_COMPLETED) || null;
    const decisionRecordEvent =
      currentActionEvents.find((e) => e.kind === DECISION_RECORDED) || null;
    const escalationEvent = currentActionEvents.find((e) => e.kind === ACTION_ESCALATED) || null;
    const governanceEvents = currentActionEvents.filter((e) => GOVERNANCE_EVENT_KINDS.has(e.kind));

    const allowed = decisionEvent?.kind === ACTION_ALLOWED;
    const executed = executionEvent !== null;
    const succeeded = executionEvent?.kind === ACTION_EXECUTED;

    actions.push({
      index: actionIndex++,
      requestedEvent: requested,
      decisionEvent,
      executionEvent,
      simulationEvent,
      decisionRecordEvent,
      escalationEvent,
      governanceEvents,
      allowed,
      executed,
      succeeded,
      actionType: (requested.actionType as string) || 'unknown',
      target: (requested.target as string) || '',
    });

    currentActionEvents = [];
  }

  for (const event of events) {
    if (event.kind === ACTION_REQUESTED && currentActionEvents.length > 0) {
      flushAction();
    }
    currentActionEvents.push(event);
  }

  // Flush the last action
  flushAction();

  return actions;
}

// ---------------------------------------------------------------------------
// Summary Generation
// ---------------------------------------------------------------------------

function buildSummary(
  events: readonly DomainEvent[],
  actions: readonly ReplayAction[]
): ReplaySessionSummary {
  const actionTypes: Record<string, number> = {};
  const denialReasons: string[] = [];
  let violations = 0;
  let escalations = 0;
  let simulationsRun = 0;

  for (const action of actions) {
    const type = action.actionType;
    actionTypes[type] = (actionTypes[type] || 0) + 1;

    if (!action.allowed && action.decisionEvent) {
      const reason = (action.decisionEvent.reason as string) || 'unknown';
      denialReasons.push(reason);
    }

    violations += action.governanceEvents.length;
    if (action.escalationEvent) escalations++;
    if (action.simulationEvent) simulationsRun++;
  }

  const timestamps = events.map((e) => e.timestamp);
  const durationMs = timestamps.length >= 2 ? Math.max(...timestamps) - Math.min(...timestamps) : 0;

  return {
    totalActions: actions.length,
    allowed: actions.filter((a) => a.allowed).length,
    denied: actions.filter((a) => !a.allowed).length,
    executed: actions.filter((a) => a.executed).length,
    failed: actions.filter((a) => a.executed && !a.succeeded).length,
    violations,
    escalations,
    simulationsRun,
    durationMs,
    actionTypes,
    denialReasons,
  };
}

// ---------------------------------------------------------------------------
// Replay Engine API
// ---------------------------------------------------------------------------

/**
 * Load a replay session from a JSONL event file by run ID.
 * Returns null if the file does not exist.
 */
export function loadReplaySession(
  runId: string,
  options: ReplayLoadOptions = {}
): ReplaySession | null {
  const filePath = resolveEventFilePath(runId, options.baseDir);
  const events = loadEventsFromJsonl(filePath);

  if (events.length === 0) return null;

  return buildReplaySession(runId, events);
}

/**
 * Build a replay session from an in-memory event array.
 * Useful for testing and when events are already loaded.
 */
export function buildReplaySession(runId: string, events: DomainEvent[]): ReplaySession {
  // Sort events by timestamp for deterministic ordering
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  const startEvent = sorted.find((e) => e.kind === RUN_STARTED) || null;
  const endEvent = sorted.find((e) => e.kind === RUN_ENDED) || null;

  const actions = groupEventsIntoActions(sorted);
  const summary = buildSummary(sorted, actions);

  return {
    runId,
    events: sorted,
    actions,
    summary,
    startEvent,
    endEvent,
  };
}

/**
 * Iterator for stepping through action encounters one at a time.
 * Yields ReplayAction objects in chronological order.
 */
export function* iterateActions(session: ReplaySession): Generator<ReplayAction> {
  for (const action of session.actions) {
    yield action;
  }
}

/**
 * Filter a replay session's actions by a predicate.
 * Returns a new session with only matching actions (events are not filtered).
 */
export function filterActions(
  session: ReplaySession,
  predicate: (action: ReplayAction) => boolean
): ReplaySession {
  const filteredActions = session.actions.filter(predicate);
  const summary = buildSummary(session.events, filteredActions);

  return {
    ...session,
    actions: filteredActions,
    summary,
  };
}

/**
 * Get the most recent run ID from stored events.
 * Returns null if no runs exist.
 */
export function getLatestRunId(baseDir?: string): string | null {
  const runIds = listRunIds(baseDir);
  return runIds.length > 0 ? runIds[0] : null;
}

/**
 * Extract the event kinds present in a session as a frequency map.
 */
export function getEventKindCounts(session: ReplaySession): Record<EventKind, number> {
  const counts: Record<string, number> = {};
  for (const event of session.events) {
    counts[event.kind] = (counts[event.kind] || 0) + 1;
  }
  return counts as Record<EventKind, number>;
}

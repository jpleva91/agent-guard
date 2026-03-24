/**
 * Plane type definitions for KE-4 Plane Separation.
 *
 * Three failure-isolated planes:
 *   Evaluator (sync, pure) → Emitter (non-blocking ring buffer) → Shipper (background, crash-resilient)
 *
 * Contract: telemetry failures NEVER alter enforcement decisions.
 * The Evaluator plane has zero I/O — writes go to the Emitter's ring buffer.
 * The Shipper drains the Emitter and persists to SQLite/external consumers.
 *
 * @see Issue #687
 */

import type { DomainEvent, EventSink, DecisionSink } from '@red-codes/core';
import type { GovernanceDecisionRecord } from '../decisions/types.js';

/** Emitter plane — non-blocking in-memory event queuing with zero backpressure on the Evaluator. */
export interface Emitter {
  /** EventSink adapter — the Evaluator writes events here (zero I/O). */
  readonly eventSink: EventSink;
  /** DecisionSink adapter — the Evaluator writes decisions here (zero I/O). */
  readonly decisionSink: DecisionSink;
  /** Drain all buffered events. Called by the Shipper. */
  drainEvents(): DomainEvent[];
  /** Drain all buffered decisions. Called by the Shipper. */
  drainDecisions(): GovernanceDecisionRecord[];
  /** Number of events currently buffered. */
  eventCount(): number;
  /** Number of decisions currently buffered. */
  decisionCount(): number;
  /** Total events dropped (ring buffer overflow) since creation. */
  eventsDropped(): number;
  /** Total decisions dropped since creation. */
  decisionsDropped(): number;
}

export interface EmitterConfig {
  /** Ring buffer capacity for events. Default: 4096. */
  eventCapacity?: number;
  /** Ring buffer capacity for decisions. Default: 1024. */
  decisionCapacity?: number;
}

/** Shipper plane — background persistence to sinks, crash-resilient. */
export interface Shipper {
  /** Start background drain timer. */
  start(): void;
  /** Stop background drain timer. Does NOT flush remaining events. */
  stop(): void;
  /** Synchronously drain all buffered events/decisions and write to sinks. */
  flush(): void;
  /** True if the background timer is running. */
  isRunning(): boolean;
  /** Total events shipped since creation. */
  totalEventsShipped(): number;
  /** Total decisions shipped since creation. */
  totalDecisionsShipped(): number;
  /** Total shipping errors (sink write failures) since creation. */
  totalErrors(): number;
}

export interface ShipperConfig {
  /** The Emitter to drain events/decisions from. */
  emitter: Emitter;
  /** Event sinks to persist to (SQLite, JSONL, etc.). */
  eventSinks: EventSink[];
  /** Decision sinks to persist to. */
  decisionSinks: DecisionSink[];
  /** Background drain interval in ms. Default: 50. */
  intervalMs?: number;
  /** Error callback — invoked on sink write failures. Never rethrown. */
  onError?: (error: Error, context: string) => void;
}

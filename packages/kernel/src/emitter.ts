// NonBlockingEmitter — bounded in-memory event buffer for the KE-4 Emitter plane.
//
// Sits between the Evaluator and the Shipper. The Evaluator enqueues events
// without blocking — enqueue() never throws and never waits for I/O.
// The Shipper drains the buffer whenever it is ready to persist.
//
// Bounded capacity prevents unbounded memory growth if the Shipper falls behind.
// Dropped events are counted so operators can detect overload.

import type { DomainEvent, GovernanceDecisionRecord } from '@red-codes/core';

/** Default buffer capacity before events are dropped (per queue). */
export const EMITTER_DEFAULT_CAPACITY = 10_000;

/** NonBlockingEmitter — zero-backpressure event and decision buffer. */
export interface NonBlockingEmitter {
  /**
   * Enqueue a domain event. Never throws. Never blocks.
   * Returns `true` if enqueued, `false` if the buffer was full (event dropped).
   */
  enqueue(event: DomainEvent): boolean;

  /**
   * Enqueue a governance decision record. Never throws. Never blocks.
   * Returns `true` if enqueued, `false` if the buffer was full (record dropped).
   */
  enqueueDecision(record: GovernanceDecisionRecord): boolean;

  /** Number of events currently in the event queue. */
  readonly eventQueueSize: number;

  /** Number of decision records currently in the decision queue. */
  readonly decisionQueueSize: number;

  /** Total items dropped because the buffer was at capacity. */
  readonly droppedCount: number;

  /** Total events enqueued (including those later dropped or drained). */
  readonly totalEnqueued: number;

  /**
   * Drain all buffered items into the provided callbacks and clear the queues.
   * Callbacks are invoked synchronously in FIFO order.
   */
  drain(
    onEvent: (event: DomainEvent) => void,
    onDecision: (record: GovernanceDecisionRecord) => void,
  ): void;
}

/** Create a new NonBlockingEmitter with an optional buffer capacity. */
export function createNonBlockingEmitter(capacity = EMITTER_DEFAULT_CAPACITY): NonBlockingEmitter {
  const eventQueue: DomainEvent[] = [];
  const decisionQueue: GovernanceDecisionRecord[] = [];
  let droppedCount = 0;
  let totalEnqueued = 0;

  return {
    enqueue(event: DomainEvent): boolean {
      totalEnqueued++;
      if (eventQueue.length >= capacity) {
        droppedCount++;
        return false;
      }
      eventQueue.push(event);
      return true;
    },

    enqueueDecision(record: GovernanceDecisionRecord): boolean {
      if (decisionQueue.length >= capacity) {
        droppedCount++;
        return false;
      }
      decisionQueue.push(record);
      return true;
    },

    get eventQueueSize() {
      return eventQueue.length;
    },

    get decisionQueueSize() {
      return decisionQueue.length;
    },

    get droppedCount() {
      return droppedCount;
    },

    get totalEnqueued() {
      return totalEnqueued;
    },

    drain(
      onEvent: (event: DomainEvent) => void,
      onDecision: (record: GovernanceDecisionRecord) => void,
    ): void {
      const events = eventQueue.splice(0);
      for (const e of events) {
        onEvent(e);
      }
      const decisions = decisionQueue.splice(0);
      for (const d of decisions) {
        onDecision(d);
      }
    },
  };
}

// BackgroundShipper — failure-isolated persistence plane for KE-4.
//
// The Shipper owns the connection between the Emitter (in-memory buffer) and
// the persistence backends (EventSink, DecisionSink). Its sole guarantee:
//
//   Failures in sinks NEVER propagate to the caller.
//
// The Evaluator calls ship() / shipDecision() and never sees a thrown error.
// All sink failures are silenced at the Shipper boundary.
//
// Drain strategy: synchronous after each ship() call so that callers see
// events in sinks immediately after propose() returns. This maintains
// backward compatibility with tests. A future Phase 2 can swap the drain
// strategy for setImmediate-based batching without changing the API.

import type {
  DomainEvent,
  EventSink,
  GovernanceDecisionRecord,
  DecisionSink,
} from '@red-codes/core';
import type { NonBlockingEmitter } from './emitter.js';

/** BackgroundShipper — failure-isolated bridge from Emitter to persistence sinks. */
export interface BackgroundShipper {
  /**
   * Ship one domain event: enqueue → drain → silence any sink errors.
   * Never throws.
   */
  ship(event: DomainEvent): void;

  /**
   * Ship one decision record: enqueue → drain → silence any sink errors.
   * Never throws.
   */
  shipDecision(record: GovernanceDecisionRecord): void;

  /**
   * Ship multiple events in one call (avoids repeated drain overhead).
   * Never throws.
   */
  shipAll(events: DomainEvent[]): void;

  /**
   * Total events that have passed through ship() (including those dropped by
   * the Emitter due to capacity). Used by the kernel for getEventCount().
   */
  readonly eventCount: number;

  /**
   * Drain any remaining buffered items into sinks.
   * Called by shutdown() for a final flush before process exit.
   */
  drain(): void;

  /**
   * Drain remaining buffered items, then flush all sinks.
   * Safe to call multiple times.
   */
  shutdown(): void;
}

/** Create a BackgroundShipper backed by a NonBlockingEmitter. */
export function createBackgroundShipper(
  emitter: NonBlockingEmitter,
  sinks: EventSink[],
  decisionSinks: DecisionSink[]
): BackgroundShipper {
  let eventCount = 0;

  /** Write a single event to all sinks, silencing individual sink errors. */
  function writeEventToSinks(event: DomainEvent): void {
    for (const sink of sinks) {
      try {
        sink.write(event);
      } catch {
        // Shipper plane: sink failures are silenced — never propagate to Evaluator.
      }
    }
  }

  /** Write a single decision to all decision sinks, silencing errors. */
  function writeDecisionToSinks(record: GovernanceDecisionRecord): void {
    for (const sink of decisionSinks) {
      try {
        sink.write(record);
      } catch {
        // Shipper plane: decision sink failures are silenced.
      }
    }
  }

  /** Drain everything the Emitter has buffered into the sinks. */
  function drainEmitter(): void {
    emitter.drain(writeEventToSinks, writeDecisionToSinks);
  }

  return {
    ship(event: DomainEvent): void {
      eventCount++;
      emitter.enqueue(event);
      drainEmitter();
    },

    shipDecision(record: GovernanceDecisionRecord): void {
      emitter.enqueueDecision(record);
      drainEmitter();
    },

    shipAll(events: DomainEvent[]): void {
      for (const event of events) {
        eventCount++;
        emitter.enqueue(event);
      }
      drainEmitter();
    },

    get eventCount() {
      return eventCount;
    },

    drain(): void {
      drainEmitter();
    },

    shutdown(): void {
      drainEmitter();
      for (const sink of sinks) {
        try {
          if (sink.flush) sink.flush();
        } catch {
          // Shutdown errors are silenced.
        }
      }
      for (const sink of decisionSinks) {
        try {
          if (sink.flush) sink.flush();
        } catch {
          // Shutdown errors are silenced.
        }
      }
    },
  };
}

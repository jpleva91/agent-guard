/**
 * Shipper plane — background persistence to sinks, crash-resilient.
 *
 * Periodically drains the Emitter's ring buffers and writes events/decisions
 * to the registered sinks (SQLite, JSONL, etc.). All sink write errors are
 * caught and reported via onError — they NEVER propagate to the Evaluator.
 *
 * On shutdown, `flush()` synchronously drains all remaining buffered data
 * to ensure no events are lost, even for short-lived processes (e.g. hook
 * invocations that spawn a process per tool call).
 *
 * @see KE-4 Plane Separation (Issue #687)
 */

import type { EventSink, DecisionSink } from '@red-codes/core';
import type { Emitter, Shipper, ShipperConfig } from './types.js';

const DEFAULT_INTERVAL_MS = 50;

/**
 * Create a Shipper — the background persistence layer that drains the Emitter.
 */
export function createShipper(config: ShipperConfig): Shipper {
  const { emitter, eventSinks, decisionSinks } = config;
  const intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS;
  const onError = config.onError ?? (() => {});

  let timer: ReturnType<typeof setInterval> | null = null;
  let eventsShipped = 0;
  let decisionsShipped = 0;
  let errorCount = 0;

  function shipEvents(sinks: EventSink[], emitterRef: Emitter): void {
    const events = emitterRef.drainEvents();
    if (events.length === 0) return;

    for (const sink of sinks) {
      for (const event of events) {
        try {
          sink.write(event);
        } catch (err) {
          errorCount++;
          onError(err as Error, `event_sink_write:${event.kind}`);
          // Continue — never let one sink failure block others
        }
      }
    }
    eventsShipped += events.length;
  }

  function shipDecisions(sinks: DecisionSink[], emitterRef: Emitter): void {
    const decisions = emitterRef.drainDecisions();
    if (decisions.length === 0) return;

    for (const sink of sinks) {
      for (const decision of decisions) {
        try {
          sink.write(decision);
        } catch (err) {
          errorCount++;
          onError(err as Error, `decision_sink_write:${decision.recordId}`);
        }
      }
    }
    decisionsShipped += decisions.length;
  }

  function drainAll(): void {
    shipEvents(eventSinks, emitter);
    shipDecisions(decisionSinks, emitter);
  }

  return {
    start(): void {
      if (timer !== null) return; // Already running
      timer = setInterval(drainAll, intervalMs);
      // Unref the timer so it doesn't prevent process exit
      if (typeof timer === 'object' && 'unref' in timer) {
        timer.unref();
      }
    },

    stop(): void {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    },

    flush(): void {
      drainAll();
      // Also flush underlying sinks
      for (const sink of eventSinks) {
        try {
          sink.flush?.();
        } catch (err) {
          errorCount++;
          onError(err as Error, 'event_sink_flush');
        }
      }
      for (const sink of decisionSinks) {
        try {
          sink.flush?.();
        } catch (err) {
          errorCount++;
          onError(err as Error, 'decision_sink_flush');
        }
      }
    },

    isRunning(): boolean {
      return timer !== null;
    },

    totalEventsShipped(): number {
      return eventsShipped;
    },

    totalDecisionsShipped(): number {
      return decisionsShipped;
    },

    totalErrors(): number {
      return errorCount;
    },
  };
}

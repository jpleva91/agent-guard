/**
 * Emitter plane — non-blocking event queuing via ring buffers.
 *
 * The Evaluator writes events/decisions here. Writes are O(1) in-memory
 * with zero I/O. The Shipper plane drains these buffers periodically.
 *
 * Ring buffers have bounded capacity — when full, oldest entries are
 * overwritten. This guarantees bounded memory and zero backpressure
 * on the Evaluator, even if the Shipper falls behind.
 *
 * @see KE-4 Plane Separation (Issue #687)
 */

import type { DomainEvent, EventSink, DecisionSink } from '@red-codes/core';
import type { GovernanceDecisionRecord } from '../decisions/types.js';
import { createRingBuffer } from '@red-codes/events';
import type { Emitter, EmitterConfig } from './types.js';

const DEFAULT_EVENT_CAPACITY = 4096;
const DEFAULT_DECISION_CAPACITY = 1024;

/**
 * Create an Emitter — the non-blocking bridge between the Evaluator and Shipper planes.
 */
export function createEmitter(config: EmitterConfig = {}): Emitter {
  const eventBuffer = createRingBuffer<DomainEvent>(config.eventCapacity ?? DEFAULT_EVENT_CAPACITY);
  const decisionBuffer = createRingBuffer<GovernanceDecisionRecord>(
    config.decisionCapacity ?? DEFAULT_DECISION_CAPACITY
  );

  const eventSink: EventSink = {
    write(event: DomainEvent): void {
      eventBuffer.write(event);
    },
    flush(): void {
      // No-op — the Shipper handles flushing
    },
  };

  const decisionSink: DecisionSink = {
    write(record: GovernanceDecisionRecord): void {
      decisionBuffer.write(record);
    },
    flush(): void {
      // No-op — the Shipper handles flushing
    },
  };

  return {
    eventSink,
    decisionSink,

    drainEvents(): DomainEvent[] {
      return eventBuffer.drain();
    },

    drainDecisions(): GovernanceDecisionRecord[] {
      return decisionBuffer.drain();
    },

    eventCount(): number {
      return eventBuffer.size();
    },

    decisionCount(): number {
      return decisionBuffer.size();
    },

    eventsDropped(): number {
      return eventBuffer.dropped();
    },

    decisionsDropped(): number {
      return decisionBuffer.dropped();
    },
  };
}

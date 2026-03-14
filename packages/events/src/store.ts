// Event store interface and in-memory reference implementation.
// No DOM, no Node.js APIs — pure domain logic.
// File-based persistence: see src/cli/file-event-store.ts

import type { DomainEvent, EventFilter, EventStore, ValidationResult } from '@red-codes/core';
import { validateEvent } from './schema.js';

/**
 * Create an in-memory event store.
 * Serves as the reference implementation and test double.
 */
export function createInMemoryStore(): EventStore {
  let events: DomainEvent[] = [];

  return {
    append(event: DomainEvent): void {
      const { valid, errors } = validateEvent(
        event as unknown as Record<string, unknown>
      ) as ValidationResult;
      if (!valid) {
        throw new Error(`Cannot append invalid event: ${errors.join('; ')}`);
      }
      events.push(event);
    },

    query(filter: EventFilter = {}): DomainEvent[] {
      let result = events;
      if (filter.kind) {
        result = result.filter((e) => e.kind === filter.kind);
      }
      if (filter.since !== undefined) {
        result = result.filter((e) => e.timestamp >= filter.since!);
      }
      if (filter.until !== undefined) {
        result = result.filter((e) => e.timestamp <= filter.until!);
      }
      if (filter.fingerprint) {
        result = result.filter((e) => e.fingerprint === filter.fingerprint);
      }
      return result;
    },

    replay(fromId?: string): DomainEvent[] {
      if (!fromId) return [...events];
      const idx = events.findIndex((e) => e.id === fromId);
      if (idx === -1) return [];
      return events.slice(idx);
    },

    count(): number {
      return events.length;
    },

    clear(): void {
      events = [];
    },

    toNDJSON(): string {
      return events.map((e) => JSON.stringify(e)).join('\n');
    },

    fromNDJSON(ndjson: string): number {
      const lines = ndjson.split('\n').filter((line) => line.trim().length > 0);
      let loaded = 0;
      for (const line of lines) {
        const parsed = JSON.parse(line) as DomainEvent;
        events.push(parsed);
        loaded++;
      }
      return loaded;
    },
  };
}

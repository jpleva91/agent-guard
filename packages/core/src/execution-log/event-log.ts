// Execution Event Log — append-only event log with causal chain support.
// Stores execution events and supports query, replay, trace, and NDJSON serialization.
// No DOM, no Node.js APIs — pure domain logic.

import type { ExecutionEvent, ExecutionEventFilter, ExecutionEventLog } from '../types.js';
import { validateExecutionEvent } from './event-schema.js';

/**
 * Create an in-memory execution event log.
 * Append-only with support for causal chain tracing and NDJSON persistence.
 */
export function createExecutionEventLog(): ExecutionEventLog {
  let events: ExecutionEvent[] = [];
  const indexById = new Map<string, number>();

  function rebuildIndex(): void {
    indexById.clear();
    for (let i = 0; i < events.length; i++) {
      indexById.set(events[i].id, i);
    }
  }

  return {
    append(event: ExecutionEvent): void {
      const { valid, errors } = validateExecutionEvent(event as unknown as Record<string, unknown>);
      if (!valid) {
        throw new Error(`Cannot append invalid execution event: ${errors.join('; ')}`);
      }
      if (event.causedBy && !indexById.has(event.causedBy)) {
        // causedBy references must point to events already in the log,
        // or to events from a previous session (allow unknown references)
      }
      indexById.set(event.id, events.length);
      events.push(event);
    },

    query(filter: ExecutionEventFilter = {}): ExecutionEvent[] {
      let result = events;
      if (filter.kind) {
        result = result.filter((e) => e.kind === filter.kind);
      }
      if (filter.actor) {
        result = result.filter((e) => e.actor === filter.actor);
      }
      if (filter.source) {
        result = result.filter((e) => e.source === filter.source);
      }
      if (filter.since !== undefined) {
        result = result.filter((e) => e.timestamp >= filter.since!);
      }
      if (filter.until !== undefined) {
        result = result.filter((e) => e.timestamp <= filter.until!);
      }
      if (filter.agentRunId) {
        result = result.filter((e) => e.context.agentRunId === filter.agentRunId);
      }
      if (filter.file) {
        result = result.filter((e) => e.context.file === filter.file);
      }
      return result;
    },

    replay(fromId?: string): ExecutionEvent[] {
      if (!fromId) return [...events];
      const idx = indexById.get(fromId);
      if (idx === undefined) return [];
      return events.slice(idx);
    },

    trace(eventId: string): ExecutionEvent[] {
      const chain: ExecutionEvent[] = [];
      const visited = new Set<string>();
      let currentId: string | undefined = eventId;

      while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        const idx = indexById.get(currentId);
        if (idx === undefined) break;
        const event = events[idx];
        chain.unshift(event);
        currentId = event.causedBy;
      }

      return chain;
    },

    count(): number {
      return events.length;
    },

    clear(): void {
      events = [];
      indexById.clear();
    },

    toNDJSON(): string {
      return events.map((e) => JSON.stringify(e)).join('\n');
    },

    fromNDJSON(ndjson: string): number {
      const lines = ndjson.split('\n').filter((line) => line.trim().length > 0);
      let loaded = 0;
      for (const line of lines) {
        const parsed = JSON.parse(line) as ExecutionEvent;
        indexById.set(parsed.id, events.length);
        events.push(parsed);
        loaded++;
      }
      rebuildIndex();
      return loaded;
    },
  };
}

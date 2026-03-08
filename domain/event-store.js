// Event store interface and in-memory reference implementation.
// No DOM, no Node.js APIs — pure domain logic.
//
// TODO(roadmap/phase-4): Add file-based event store (.bugmon/events/)
// TODO(roadmap/phase-4): Add event stream serialization format
// TODO(roadmap/phase-4): Add session metadata (run ID, RNG seed, timestamps)
// TODO(roadmap/phase-4): Add deterministic replay with seeded RNG
// TODO(roadmap/ts-migration): Migrate to TypeScript (src/domain/)

import { validateEvent } from './events.js';

/**
 * Create an in-memory event store.
 * Serves as the reference implementation and test double.
 *
 * @returns {{
 *   append: (event: object) => void,
 *   query: (filter?: { kind?: string, since?: number, until?: number, fingerprint?: string }) => object[],
 *   replay: (fromId?: string) => object[],
 *   count: () => number,
 *   clear: () => void
 * }}
 */
export function createInMemoryStore() {
  let events = [];

  return {
    append(event) {
      const { valid, errors } = validateEvent(event);
      if (!valid) {
        throw new Error(`Cannot append invalid event: ${errors.join('; ')}`);
      }
      events.push(event);
    },

    query(filter = {}) {
      let result = events;
      if (filter.kind) {
        result = result.filter((e) => e.kind === filter.kind);
      }
      if (filter.since !== undefined) {
        result = result.filter((e) => e.timestamp >= filter.since);
      }
      if (filter.until !== undefined) {
        result = result.filter((e) => e.timestamp <= filter.until);
      }
      if (filter.fingerprint) {
        result = result.filter((e) => e.fingerprint === filter.fingerprint);
      }
      return result;
    },

    replay(fromId) {
      if (!fromId) return [...events];
      const idx = events.findIndex((e) => e.id === fromId);
      if (idx === -1) return [];
      return events.slice(idx);
    },

    count() {
      return events.length;
    },

    clear() {
      events = [];
    },
  };
}

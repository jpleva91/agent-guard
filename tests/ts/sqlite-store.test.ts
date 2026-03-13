import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/storage/migrations.js';
import {
  createSqliteEventStore,
  listRunIds,
  getLatestRunId,
  loadRunEvents,
} from '../../src/storage/sqlite-store.js';
import type { DomainEvent } from '../../src/core/types.js';

function makeEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    kind: 'ActionRequested',
    timestamp: Date.now(),
    fingerprint: 'fp_test',
    ...overrides,
  } as DomainEvent;
}

describe('SQLite EventStore', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  describe('append + count', () => {
    it('appends events and increments count', () => {
      const store = createSqliteEventStore(db, 'run_1');
      expect(store.count()).toBe(0);

      store.append(makeEvent({ id: 'evt_1' }));
      expect(store.count()).toBe(1);

      store.append(makeEvent({ id: 'evt_2' }));
      expect(store.count()).toBe(2);
    });

    it('ignores duplicate event IDs', () => {
      const store = createSqliteEventStore(db, 'run_1');
      const event = makeEvent({ id: 'evt_dup' });

      store.append(event);
      store.append(event);
      expect(store.count()).toBe(1);
    });
  });

  describe('query', () => {
    it('returns all events when no filter is given', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(makeEvent({ id: 'e1', timestamp: 100 }));
      store.append(makeEvent({ id: 'e2', timestamp: 200 }));

      const results = store.query();
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('e1');
      expect(results[1].id).toBe('e2');
    });

    it('filters by kind', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(makeEvent({ id: 'e1', kind: 'ActionRequested' }));
      store.append(makeEvent({ id: 'e2', kind: 'ActionDenied' }));

      const results = store.query({ kind: 'ActionDenied' });
      expect(results).toHaveLength(1);
      expect(results[0].kind).toBe('ActionDenied');
    });

    it('filters by time range', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(makeEvent({ id: 'e1', timestamp: 100 }));
      store.append(makeEvent({ id: 'e2', timestamp: 200 }));
      store.append(makeEvent({ id: 'e3', timestamp: 300 }));

      const results = store.query({ since: 150, until: 250 });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('e2');
    });

    it('filters by fingerprint', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(makeEvent({ id: 'e1', fingerprint: 'fp_a' }));
      store.append(makeEvent({ id: 'e2', fingerprint: 'fp_b' }));

      const results = store.query({ fingerprint: 'fp_a' });
      expect(results).toHaveLength(1);
      expect(results[0].fingerprint).toBe('fp_a');
    });

    it('combines multiple filters', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(makeEvent({ id: 'e1', kind: 'ActionDenied', timestamp: 100 }));
      store.append(makeEvent({ id: 'e2', kind: 'ActionDenied', timestamp: 200 }));
      store.append(makeEvent({ id: 'e3', kind: 'ActionRequested', timestamp: 200 }));

      const results = store.query({ kind: 'ActionDenied', since: 150 });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('e2');
    });
  });

  describe('replay', () => {
    it('returns all events ordered by timestamp when no fromId', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(makeEvent({ id: 'e2', timestamp: 200 }));
      store.append(makeEvent({ id: 'e1', timestamp: 100 }));

      const events = store.replay();
      expect(events[0].id).toBe('e1');
      expect(events[1].id).toBe('e2');
    });

    it('replays from a specific event ID', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(makeEvent({ id: 'e1', timestamp: 100 }));
      store.append(makeEvent({ id: 'e2', timestamp: 200 }));
      store.append(makeEvent({ id: 'e3', timestamp: 300 }));

      const events = store.replay('e2');
      expect(events).toHaveLength(2);
      expect(events[0].id).toBe('e2');
      expect(events[1].id).toBe('e3');
    });

    it('returns empty array for unknown fromId', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(makeEvent({ id: 'e1' }));

      expect(store.replay('nonexistent')).toEqual([]);
    });
  });

  describe('clear', () => {
    it('removes all events', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(makeEvent({ id: 'e1' }));
      store.append(makeEvent({ id: 'e2' }));
      expect(store.count()).toBe(2);

      store.clear();
      expect(store.count()).toBe(0);
    });
  });

  describe('NDJSON serialization', () => {
    it('round-trips through toNDJSON and fromNDJSON', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(makeEvent({ id: 'e1', kind: 'ActionRequested', timestamp: 100 }));
      store.append(makeEvent({ id: 'e2', kind: 'ActionDenied', timestamp: 200 }));

      const ndjson = store.toNDJSON();
      expect(ndjson.split('\n')).toHaveLength(2);

      // Load into a fresh store
      const db2 = new Database(':memory:');
      runMigrations(db2);
      const store2 = createSqliteEventStore(db2, 'run_1');
      const loaded = store2.fromNDJSON(ndjson);

      expect(loaded).toBe(2);
      expect(store2.count()).toBe(2);
      expect(store2.query()[0].id).toBe('e1');
    });

    it('handles empty NDJSON', () => {
      const store = createSqliteEventStore(db, 'run_1');
      expect(store.fromNDJSON('')).toBe(0);
    });
  });

  describe('action_type column', () => {
    it('populates action_type on append for events with actionType', () => {
      const store = createSqliteEventStore(db, 'run_1');
      const event = makeEvent({ id: 'e_at', actionType: 'git.push' } as Partial<DomainEvent>);
      store.append(event);

      const row = db.prepare('SELECT action_type FROM events WHERE id = ?').get('e_at') as {
        action_type: string | null;
      };
      expect(row.action_type).toBe('git.push');
    });

    it('sets action_type to null for events without actionType', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(makeEvent({ id: 'e_no_at' }));

      const row = db.prepare('SELECT action_type FROM events WHERE id = ?').get('e_no_at') as {
        action_type: string | null;
      };
      expect(row.action_type).toBeNull();
    });

    it('populates action_type during fromNDJSON import', () => {
      const event = {
        id: 'e_ndjson',
        kind: 'ActionRequested',
        actionType: 'file.write',
        timestamp: 100,
        fingerprint: 'fp',
      };
      const ndjson = JSON.stringify(event);

      const store = createSqliteEventStore(db, 'run_1');
      store.fromNDJSON(ndjson);

      const row = db.prepare('SELECT action_type FROM events WHERE id = ?').get('e_ndjson') as {
        action_type: string | null;
      };
      expect(row.action_type).toBe('file.write');
    });
  });

  describe('run-scoped helpers', () => {
    it('listRunIds returns runs ordered by most recent', () => {
      const store = createSqliteEventStore(db);
      store.append(makeEvent({ id: 'e1', timestamp: 100, runId: 'run_old' } as DomainEvent));
      store.append(makeEvent({ id: 'e2', timestamp: 200, runId: 'run_new' } as DomainEvent));

      // Re-insert with explicit run_id via separate stores
      const s1 = createSqliteEventStore(db, 'run_old');
      s1.append(makeEvent({ id: 'e3', timestamp: 100 }));
      const s2 = createSqliteEventStore(db, 'run_new');
      s2.append(makeEvent({ id: 'e4', timestamp: 300 }));

      const runs = listRunIds(db);
      expect(runs[0]).toBe('run_new');
    });

    it('getLatestRunId returns the most recent run', () => {
      const s1 = createSqliteEventStore(db, 'run_a');
      s1.append(makeEvent({ id: 'e1', timestamp: 100 }));
      const s2 = createSqliteEventStore(db, 'run_b');
      s2.append(makeEvent({ id: 'e2', timestamp: 200 }));

      expect(getLatestRunId(db)).toBe('run_b');
    });

    it('getLatestRunId returns null when no events', () => {
      expect(getLatestRunId(db)).toBeNull();
    });

    it('loadRunEvents loads events for a specific run', () => {
      const s1 = createSqliteEventStore(db, 'run_a');
      s1.append(makeEvent({ id: 'e1', timestamp: 100 }));
      const s2 = createSqliteEventStore(db, 'run_b');
      s2.append(makeEvent({ id: 'e2', timestamp: 200 }));

      const events = loadRunEvents(db, 'run_a');
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('e1');
    });
  });

  describe('prepared statement caching', () => {
    it('returns correct results on repeated queries with the same filter shape', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(makeEvent({ id: 'e1', kind: 'ActionRequested', timestamp: 100 }));
      store.append(makeEvent({ id: 'e2', kind: 'ActionDenied', timestamp: 200 }));
      store.append(makeEvent({ id: 'e3', kind: 'ActionRequested', timestamp: 300 }));

      // First call compiles and caches the statement
      const first = store.query({ kind: 'ActionRequested' });
      expect(first).toHaveLength(2);

      // Add another event and query again — cached statement must still work
      store.append(makeEvent({ id: 'e4', kind: 'ActionRequested', timestamp: 400 }));
      const second = store.query({ kind: 'ActionRequested' });
      expect(second).toHaveLength(3);
    });

    it('caches different SQL shapes independently', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(
        makeEvent({ id: 'e1', kind: 'ActionDenied', timestamp: 100, fingerprint: 'fp_x' })
      );
      store.append(
        makeEvent({ id: 'e2', kind: 'ActionDenied', timestamp: 200, fingerprint: 'fp_y' })
      );
      store.append(
        makeEvent({ id: 'e3', kind: 'ActionRequested', timestamp: 300, fingerprint: 'fp_x' })
      );

      // Query by kind only
      const byKind = store.query({ kind: 'ActionDenied' });
      expect(byKind).toHaveLength(2);

      // Query by kind + fingerprint (different SQL shape)
      const byKindFp = store.query({ kind: 'ActionDenied', fingerprint: 'fp_x' });
      expect(byKindFp).toHaveLength(1);
      expect(byKindFp[0].id).toBe('e1');

      // Query by time range (yet another shape)
      const byTime = store.query({ since: 150, until: 250 });
      expect(byTime).toHaveLength(1);
      expect(byTime[0].id).toBe('e2');
    });

    it('replay uses pre-prepared statements correctly', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(makeEvent({ id: 'e1', timestamp: 100 }));
      store.append(makeEvent({ id: 'e2', timestamp: 200 }));
      store.append(makeEvent({ id: 'e3', timestamp: 300 }));

      // First replay from e2
      const first = store.replay('e2');
      expect(first).toHaveLength(2);

      // Second replay from e1 — must reuse prepared statements correctly
      const second = store.replay('e1');
      expect(second).toHaveLength(3);

      // Replay with no anchor
      const all = store.replay();
      expect(all).toHaveLength(3);
    });
  });
});

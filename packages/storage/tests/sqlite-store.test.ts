import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@red-codes/storage';
import {
  createSqliteEventStore,
  listRunIds,
  getLatestRunId,
  loadRunEvents,
  getRunAgent,
  getRunAgents,
  listRunIdsByAgent,
} from '@red-codes/storage';
import type { DomainEvent } from '@red-codes/core';

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

  describe('edge cases', () => {
    it('query returns empty array on fresh database with no events', () => {
      const store = createSqliteEventStore(db, 'run_1');
      expect(store.query()).toEqual([]);
      expect(store.query({ kind: 'ActionDenied' })).toEqual([]);
    });

    it('loadRunEvents returns empty array for unknown run ID', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(makeEvent({ id: 'e1' }));

      const events = loadRunEvents(db, 'nonexistent_run');
      expect(events).toEqual([]);
    });

    it('listRunIds returns empty array when no events exist', () => {
      const runs = listRunIds(db);
      expect(runs).toEqual([]);
    });
  });

  describe('agent identity helpers', () => {
    function insertRunStarted(rid: string, agentName?: string, agentId?: string, ts = Date.now()) {
      const payload: Record<string, unknown> = {
        id: `evt_rs_${rid}`,
        kind: 'RunStarted',
        timestamp: ts,
        fingerprint: 'fp',
      };
      if (agentName !== undefined) payload.agentName = agentName;
      if (agentId !== undefined) payload.agentId = agentId;

      db.prepare(
        'INSERT INTO events (id, run_id, kind, timestamp, fingerprint, data, action_type) VALUES (?, ?, ?, ?, ?, ?, NULL)'
      ).run(`evt_rs_${rid}`, rid, 'RunStarted', ts, 'fp', JSON.stringify(payload));
    }

    describe('getRunAgent', () => {
      it('returns agentName from RunStarted event', () => {
        insertRunStarted('run_a', 'kernel-sr');
        expect(getRunAgent(db, 'run_a')).toBe('kernel-sr');
      });

      it('falls back to agentId when agentName is absent', () => {
        insertRunStarted('run_b', undefined, 'copilot-cli:kernel:sr');
        expect(getRunAgent(db, 'run_b')).toBe('copilot-cli:kernel:sr');
      });

      it('prefers agentName over agentId', () => {
        insertRunStarted('run_c', 'my-agent', 'fallback-id');
        expect(getRunAgent(db, 'run_c')).toBe('my-agent');
      });

      it('returns null when no RunStarted event exists', () => {
        const store = createSqliteEventStore(db, 'run_empty');
        store.append(makeEvent({ id: 'e1', kind: 'ActionRequested' }));
        expect(getRunAgent(db, 'run_empty')).toBeNull();
      });

      it('returns null for unknown run ID', () => {
        expect(getRunAgent(db, 'nonexistent')).toBeNull();
      });
    });

    describe('getRunAgents', () => {
      it('returns agent mapping for multiple runs', () => {
        insertRunStarted('run_1', 'alpha');
        insertRunStarted('run_2', 'beta');
        insertRunStarted('run_3', 'gamma');

        const agents = getRunAgents(db, ['run_1', 'run_2', 'run_3']);
        expect(agents.size).toBe(3);
        expect(agents.get('run_1')).toBe('alpha');
        expect(agents.get('run_2')).toBe('beta');
        expect(agents.get('run_3')).toBe('gamma');
      });

      it('returns empty map for empty input', () => {
        const agents = getRunAgents(db, []);
        expect(agents.size).toBe(0);
      });

      it('omits runs without RunStarted events', () => {
        insertRunStarted('run_with', 'agent-a');
        const store = createSqliteEventStore(db, 'run_without');
        store.append(makeEvent({ id: 'e1', kind: 'ActionRequested' }));

        const agents = getRunAgents(db, ['run_with', 'run_without']);
        expect(agents.size).toBe(1);
        expect(agents.get('run_with')).toBe('agent-a');
        expect(agents.has('run_without')).toBe(false);
      });

      it('defaults to "unknown" when neither agentName nor agentId is set', () => {
        insertRunStarted('run_anon');
        const agents = getRunAgents(db, ['run_anon']);
        expect(agents.get('run_anon')).toBe('unknown');
      });
    });

    describe('listRunIdsByAgent', () => {
      it('returns run IDs matching agentName', () => {
        insertRunStarted('run_1', 'kernel-sr', undefined, 100);
        insertRunStarted('run_2', 'kernel-sr', undefined, 200);
        insertRunStarted('run_3', 'qa-bot', undefined, 300);

        const runs = listRunIdsByAgent(db, 'kernel-sr');
        expect(runs).toEqual(['run_2', 'run_1']);
      });

      it('returns run IDs matching agentId', () => {
        insertRunStarted('run_x', undefined, 'copilot-cli:kernel:sr', 100);
        const runs = listRunIdsByAgent(db, 'copilot-cli:kernel:sr');
        expect(runs).toEqual(['run_x']);
      });

      it('returns runs ordered by timestamp DESC', () => {
        insertRunStarted('run_old', 'my-agent', undefined, 100);
        insertRunStarted('run_mid', 'my-agent', undefined, 200);
        insertRunStarted('run_new', 'my-agent', undefined, 300);

        const runs = listRunIdsByAgent(db, 'my-agent');
        expect(runs).toEqual(['run_new', 'run_mid', 'run_old']);
      });

      it('returns empty array for non-matching agent', () => {
        insertRunStarted('run_1', 'alpha');
        expect(listRunIdsByAgent(db, 'nonexistent')).toEqual([]);
      });

      it('returns empty array on empty database', () => {
        expect(listRunIdsByAgent(db, 'anyone')).toEqual([]);
      });
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

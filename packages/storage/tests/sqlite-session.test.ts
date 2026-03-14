// Tests for SQLite session lifecycle (src/storage/sqlite-session.ts).

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@red-codes/storage';
import {
  insertSession,
  updateSessionEnd,
  getSession,
  listSessions,
  createSessionTracker,
} from '@red-codes/storage';
import type { SessionStartData, SessionEndData } from '@red-codes/storage';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

describe('sqlite-session', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  describe('insertSession', () => {
    it('inserts a session row with running status', () => {
      insertSession(db, 'sess_1', 'guard', { policyFile: 'test.yaml' });
      const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get('sess_1') as Record<
        string,
        unknown
      >;
      expect(row).toBeDefined();
      expect(row.command).toBe('guard');
      expect(row.ended_at).toBeNull();
      const data = JSON.parse(row.data as string) as Record<string, unknown>;
      expect(data.status).toBe('running');
      expect(data.policyFile).toBe('test.yaml');
    });

    it('uses INSERT OR IGNORE for idempotent inserts', () => {
      insertSession(db, 'sess_dup', 'guard');
      insertSession(db, 'sess_dup', 'claude-hook'); // same ID, different command
      const rows = db.prepare('SELECT * FROM sessions WHERE id = ?').all('sess_dup');
      expect(rows).toHaveLength(1);
      // First insert wins
      expect((rows[0] as Record<string, unknown>).command).toBe('guard');
    });

    it('swallows errors and calls onError callback', () => {
      db.close(); // Closed DB will throw
      const errors: Error[] = [];
      insertSession(db, 'sess_err', 'guard', {}, (err) => errors.push(err));
      expect(errors).toHaveLength(1);
    });
  });

  describe('updateSessionEnd', () => {
    const endData: SessionEndData = {
      totalActions: 10,
      allowed: 8,
      denied: 2,
      violations: 1,
      durationMs: 5000,
    };

    it('updates ended_at and merges data', () => {
      insertSession(db, 'sess_end', 'guard', { policyFile: 'p.yaml', dryRun: true });
      updateSessionEnd(db, 'sess_end', endData);
      const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get('sess_end') as Record<
        string,
        unknown
      >;
      expect(row.ended_at).toBeTruthy();
      const data = JSON.parse(row.data as string) as Record<string, unknown>;
      expect(data.status).toBe('completed');
      expect(data.totalActions).toBe(10);
      expect(data.policyFile).toBe('p.yaml'); // preserved from start
      expect(data.dryRun).toBe(true); // preserved from start
    });

    it('handles update for nonexistent session gracefully', () => {
      // No insert — update should not throw
      updateSessionEnd(db, 'nonexistent', endData);
      const row = getSession(db, 'nonexistent');
      expect(row).toBeNull();
    });

    it('swallows errors and calls onError callback', () => {
      db.close();
      const errors: Error[] = [];
      updateSessionEnd(db, 'sess_err', endData, (err) => errors.push(err));
      expect(errors).toHaveLength(1);
    });
  });

  describe('getSession', () => {
    it('returns the session row', () => {
      insertSession(db, 'sess_get', 'guard');
      const row = getSession(db, 'sess_get');
      expect(row).not.toBeNull();
      expect(row!.id).toBe('sess_get');
      expect(row!.command).toBe('guard');
    });

    it('returns null for missing session', () => {
      expect(getSession(db, 'missing')).toBeNull();
    });

    it('returns null on error', () => {
      db.close();
      expect(getSession(db, 'anything')).toBeNull();
    });
  });

  describe('listSessions', () => {
    it('returns sessions ordered by started_at DESC', () => {
      // Manually insert with distinct timestamps to test ordering
      const now = Date.now();
      db.prepare(
        'INSERT INTO sessions (id, started_at, ended_at, command, repo, data) VALUES (?, ?, NULL, ?, NULL, ?)'
      ).run('sess_old', new Date(now - 2000).toISOString(), 'guard', '{}');
      db.prepare(
        'INSERT INTO sessions (id, started_at, ended_at, command, repo, data) VALUES (?, ?, NULL, ?, NULL, ?)'
      ).run('sess_mid', new Date(now - 1000).toISOString(), 'guard', '{}');
      db.prepare(
        'INSERT INTO sessions (id, started_at, ended_at, command, repo, data) VALUES (?, ?, NULL, ?, NULL, ?)'
      ).run('sess_new', new Date(now).toISOString(), 'guard', '{}');
      const sessions = listSessions(db);
      expect(sessions).toHaveLength(3);
      expect(sessions[0].id).toBe('sess_new');
      expect(sessions[2].id).toBe('sess_old');
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        insertSession(db, `sess_lim_${i}`, 'guard');
      }
      expect(listSessions(db, 2)).toHaveLength(2);
    });

    it('returns empty array on error', () => {
      db.close();
      expect(listSessions(db)).toEqual([]);
    });
  });

  describe('createSessionTracker', () => {
    it('provides start/end/get/list interface', () => {
      const tracker = createSessionTracker(db);
      tracker.start('sess_track', 'guard', { storageBackend: 'sqlite' });
      const row = tracker.get('sess_track');
      expect(row).not.toBeNull();
      expect(row!.id).toBe('sess_track');

      tracker.end('sess_track', {
        totalActions: 5,
        allowed: 4,
        denied: 1,
        violations: 0,
        durationMs: 1000,
      });
      const updated = tracker.get('sess_track');
      expect(updated!.ended_at).toBeTruthy();

      const all = tracker.list();
      expect(all).toHaveLength(1);
    });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runMigrations, getSchemaVersion } from '@red-codes/storage';

describe('SQLite migrations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  it('creates all tables on first run', () => {
    const applied = runMigrations(db);
    expect(applied).toBe(4);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);

    expect(names).toContain('events');
    expect(names).toContain('decisions');
    expect(names).toContain('sessions');
    expect(names).toContain('migrations');
  });

  it('creates all expected indexes', () => {
    runMigrations(db);

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
      .all() as { name: string }[];
    const names = indexes.map((i) => i.name);

    // v1 indexes
    expect(names).toContain('idx_events_run_ts');
    expect(names).toContain('idx_events_run_kind');
    expect(names).toContain('idx_events_kind');
    expect(names).toContain('idx_events_timestamp');
    expect(names).toContain('idx_events_fingerprint');
    expect(names).toContain('idx_decisions_run_ts');
    expect(names).toContain('idx_decisions_outcome');
    expect(names).toContain('idx_events_kind_timestamp');

    // v2 indexes
    expect(names).toContain('idx_events_action_type');
    expect(names).toContain('idx_decisions_severity');

    // v4 index
    expect(names).toContain('idx_decisions_action_type');
  });

  it('is idempotent — running twice applies nothing the second time', () => {
    const first = runMigrations(db);
    const second = runMigrations(db);

    expect(first).toBe(4);
    expect(second).toBe(0);
  });

  it('tracks schema version', () => {
    expect(getSchemaVersion(db)).toBe(0);
    runMigrations(db);
    expect(getSchemaVersion(db)).toBe(4);
  });

  it('enables WAL mode (on file-based databases)', () => {
    // In-memory databases use 'memory' journal mode and can't switch to WAL.
    // Test with a temp file to verify WAL mode is set for real databases.
    const tmpDir = mkdtempSync(join(tmpdir(), 'ag-wal-'));
    const fileDb = new Database(join(tmpDir, 'test.db'));
    try {
      runMigrations(fileDb);
      const mode = fileDb.pragma('journal_mode', { simple: true }) as string;
      expect(mode).toBe('wal');
    } finally {
      fileDb.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('records migration timestamp', () => {
    runMigrations(db);
    const row = db.prepare('SELECT applied_at FROM migrations WHERE version = 1').get() as {
      applied_at: string;
    };
    expect(row.applied_at).toBeTruthy();
    // Should be a valid ISO timestamp
    expect(new Date(row.applied_at).getTime()).toBeGreaterThan(0);
  });

  it('applies v2 composite index incrementally on existing v1 database', () => {
    // Simulate a v1 database by manually creating the schema
    db.exec('CREATE TABLE migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    db.exec("INSERT INTO migrations (version, applied_at) VALUES (1, '2026-01-01T00:00:00Z')");
    db.exec(`
      CREATE TABLE events (
        id TEXT PRIMARY KEY, run_id TEXT NOT NULL, kind TEXT NOT NULL,
        timestamp INTEGER NOT NULL, fingerprint TEXT NOT NULL, data TEXT NOT NULL
      );
      CREATE TABLE decisions (
        record_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, timestamp INTEGER NOT NULL,
        outcome TEXT NOT NULL, action_type TEXT NOT NULL, target TEXT NOT NULL,
        reason TEXT NOT NULL, data TEXT NOT NULL
      );
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT,
        command TEXT, repo TEXT, data TEXT NOT NULL
      );
    `);
    db.exec('CREATE INDEX idx_events_kind ON events (kind)');
    db.exec('CREATE INDEX idx_events_timestamp ON events (timestamp)');

    expect(getSchemaVersion(db)).toBe(1);

    const applied = runMigrations(db);
    expect(applied).toBe(3);
    expect(getSchemaVersion(db)).toBe(4);

    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name = 'idx_events_kind_timestamp'"
      )
      .all() as { name: string }[];
    expect(indexes).toHaveLength(1);
  });
});

describe('SQLite migration v2 — action_type and severity columns', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  /** Helper to simulate a v1-only database */
  function applyV1Only() {
    db.exec(
      'CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)'
    );
    db.prepare('INSERT INTO migrations (version, applied_at) VALUES (?, ?)').run(
      1,
      '2026-01-01T00:00:00Z'
    );
    db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY, run_id TEXT NOT NULL, kind TEXT NOT NULL,
        timestamp INTEGER NOT NULL, fingerprint TEXT NOT NULL, data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS decisions (
        record_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, timestamp INTEGER NOT NULL,
        outcome TEXT NOT NULL, action_type TEXT NOT NULL, target TEXT NOT NULL,
        reason TEXT NOT NULL, data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT,
        command TEXT, repo TEXT, data TEXT NOT NULL
      );
    `);
  }

  it('adds action_type column to events table', () => {
    runMigrations(db);
    const cols = db.prepare("PRAGMA table_info('events')").all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain('action_type');
  });

  it('adds severity column to decisions table', () => {
    runMigrations(db);
    const cols = db.prepare("PRAGMA table_info('decisions')").all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain('severity');
  });

  it('creates v3 indexes', () => {
    runMigrations(db);
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
      .all() as { name: string }[];
    const names = indexes.map((i) => i.name);
    expect(names).toContain('idx_events_action_type');
    expect(names).toContain('idx_decisions_severity');
  });

  it('backfills action_type from existing event JSON data', () => {
    applyV1Only();

    // Insert an event with actionType in the JSON payload
    db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)').run(
      'evt_1',
      'run_1',
      'ActionRequested',
      1000,
      'fp1',
      JSON.stringify({
        id: 'evt_1',
        kind: 'ActionRequested',
        actionType: 'git.push',
        timestamp: 1000,
        fingerprint: 'fp1',
      })
    );

    // Insert an event without actionType
    db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)').run(
      'evt_2',
      'run_1',
      'RunStarted',
      1001,
      'fp2',
      JSON.stringify({ id: 'evt_2', kind: 'RunStarted', timestamp: 1001, fingerprint: 'fp2' })
    );

    // Run v2+v3+v4 migrations
    const applied = runMigrations(db);
    expect(applied).toBe(3);

    const row1 = db.prepare('SELECT action_type FROM events WHERE id = ?').get('evt_1') as {
      action_type: string | null;
    };
    expect(row1.action_type).toBe('git.push');

    const row2 = db.prepare('SELECT action_type FROM events WHERE id = ?').get('evt_2') as {
      action_type: string | null;
    };
    expect(row2.action_type).toBeNull();
  });

  it('backfills severity from existing decision JSON data', () => {
    applyV1Only();

    db.prepare('INSERT INTO decisions VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      'dec_1',
      'run_1',
      1000,
      'deny',
      'git.push',
      'origin/main',
      'Protected branch',
      JSON.stringify({
        recordId: 'dec_1',
        policy: { severity: 4, matchedPolicyId: 'p1', matchedPolicyName: 'default' },
      })
    );

    runMigrations(db);

    const row = db.prepare('SELECT severity FROM decisions WHERE record_id = ?').get('dec_1') as {
      severity: number | null;
    };
    expect(row.severity).toBe(4);
  });

  it('preserves existing data during upgrade', () => {
    applyV1Only();

    db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)').run(
      'evt_x',
      'run_1',
      'RunStarted',
      500,
      'fpx',
      '{"id":"evt_x","kind":"RunStarted"}'
    );

    runMigrations(db);

    const count = (db.prepare('SELECT COUNT(*) as c FROM events').get() as { c: number }).c;
    expect(count).toBe(1);

    const row = db.prepare('SELECT action_type FROM events WHERE id = ?').get('evt_x') as {
      action_type: string | null;
    };
    expect(row.action_type).toBeNull();
  });

  it('handles malformed JSON gracefully during backfill', () => {
    applyV1Only();

    db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)').run(
      'evt_bad',
      'run_1',
      'ActionRequested',
      1000,
      'fp1',
      'NOT_VALID_JSON'
    );

    // Should not throw
    expect(() => runMigrations(db)).not.toThrow();

    const row = db.prepare('SELECT action_type FROM events WHERE id = ?').get('evt_bad') as {
      action_type: string | null;
    };
    expect(row.action_type).toBeNull();
  });

  it('creates idx_decisions_action_type index for filtered queries', () => {
    runMigrations(db);

    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name = 'idx_decisions_action_type'"
      )
      .all() as { name: string }[];
    expect(indexes).toHaveLength(1);
  });

  it('applies v4 index incrementally on existing v3 database', () => {
    // Start fresh — simulate v3 database
    const db2 = new Database(':memory:');
    db2.pragma('journal_mode = WAL');
    db2.exec('CREATE TABLE migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    for (let v = 1; v <= 3; v++) {
      db2
        .prepare('INSERT INTO migrations (version, applied_at) VALUES (?, ?)')
        .run(v, '2026-01-01T00:00:00Z');
    }
    db2.exec(`
      CREATE TABLE events (
        id TEXT PRIMARY KEY, run_id TEXT NOT NULL, kind TEXT NOT NULL,
        timestamp INTEGER NOT NULL, fingerprint TEXT NOT NULL, data TEXT NOT NULL,
        action_type TEXT
      );
      CREATE TABLE decisions (
        record_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, timestamp INTEGER NOT NULL,
        outcome TEXT NOT NULL, action_type TEXT NOT NULL, target TEXT NOT NULL,
        reason TEXT NOT NULL, data TEXT NOT NULL, severity INTEGER
      );
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT,
        command TEXT, repo TEXT, data TEXT NOT NULL
      );
    `);

    expect(getSchemaVersion(db2)).toBe(3);

    const applied = runMigrations(db2);
    expect(applied).toBe(1);
    expect(getSchemaVersion(db2)).toBe(4);

    const indexes = db2
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name = 'idx_decisions_action_type'"
      )
      .all() as { name: string }[];
    expect(indexes).toHaveLength(1);
    db2.close();
  });
});

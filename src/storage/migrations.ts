// SQLite schema migrations — version-based, transactional.

import type Database from 'better-sqlite3';

interface Migration {
  readonly version: number;
  readonly description: string;
  up(db: Database.Database): void;
}

const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    description: 'Initial schema: events, decisions, sessions tables with indexes',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS events (
          id          TEXT    PRIMARY KEY,
          run_id      TEXT    NOT NULL,
          kind        TEXT    NOT NULL,
          timestamp   INTEGER NOT NULL,
          fingerprint TEXT    NOT NULL,
          data        TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS decisions (
          record_id    TEXT    PRIMARY KEY,
          run_id       TEXT    NOT NULL,
          timestamp    INTEGER NOT NULL,
          outcome      TEXT    NOT NULL,
          action_type  TEXT    NOT NULL,
          target       TEXT    NOT NULL,
          reason       TEXT    NOT NULL,
          data         TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id         TEXT    PRIMARY KEY,
          started_at TEXT    NOT NULL,
          ended_at   TEXT,
          command    TEXT,
          repo       TEXT,
          data       TEXT    NOT NULL
        );

        -- Event indexes: support all query patterns
        CREATE INDEX IF NOT EXISTS idx_events_run_ts       ON events (run_id, timestamp);
        CREATE INDEX IF NOT EXISTS idx_events_run_kind     ON events (run_id, kind);
        CREATE INDEX IF NOT EXISTS idx_events_kind         ON events (kind);
        CREATE INDEX IF NOT EXISTS idx_events_timestamp    ON events (timestamp);
        CREATE INDEX IF NOT EXISTS idx_events_fingerprint  ON events (fingerprint);

        -- Decision indexes
        CREATE INDEX IF NOT EXISTS idx_decisions_run_ts    ON decisions (run_id, timestamp);
        CREATE INDEX IF NOT EXISTS idx_decisions_outcome   ON decisions (outcome);
      `);
    },
  },
];

/**
 * Run all pending migrations on the given database.
 * Creates the migrations tracking table if it doesn't exist.
 * All migrations within a single call are wrapped in one transaction.
 */
export function runMigrations(db: Database.Database): number {
  // Enable WAL mode for concurrent read/write
  db.pragma('journal_mode = WAL');

  // Ensure migrations table exists
  db.exec(
    'CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)'
  );

  const row = db.prepare('SELECT MAX(version) as v FROM migrations').get() as {
    v: number | null;
  };
  const currentVersion = row?.v ?? 0;

  const pending = MIGRATIONS.filter((m) => m.version > currentVersion);
  if (pending.length === 0) return 0;

  const migrate = db.transaction(() => {
    for (const migration of pending) {
      migration.up(db);
      db.prepare('INSERT INTO migrations (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        new Date().toISOString()
      );
    }
  });

  migrate();
  return pending.length;
}

/** Get the current schema version */
export function getSchemaVersion(db: Database.Database): number {
  try {
    const row = db.prepare('SELECT MAX(version) as v FROM migrations').get() as {
      v: number | null;
    };
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}

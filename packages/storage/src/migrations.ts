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
  {
    version: 2,
    description: 'Add composite index (kind, timestamp) on events for covering index scans',
    up(db) {
      db.exec('CREATE INDEX IF NOT EXISTS idx_events_kind_timestamp ON events (kind, timestamp)');
    },
  },

  {
    version: 3,
    description: 'Add action_type to events, severity to decisions; backfill from JSON data',
    up(db) {
      // Add new columns (nullable — old rows start as NULL until backfilled)
      db.exec('ALTER TABLE events ADD COLUMN action_type TEXT');
      db.exec('ALTER TABLE decisions ADD COLUMN severity INTEGER');

      // Backfill events.action_type from JSON data payload
      const eventRows = db
        .prepare('SELECT id, data FROM events WHERE action_type IS NULL')
        .all() as { id: string; data: string }[];

      const updateEvent = db.prepare('UPDATE events SET action_type = ? WHERE id = ?');
      for (const row of eventRows) {
        try {
          const parsed = JSON.parse(row.data) as Record<string, unknown>;
          const actionType = (parsed.actionType as string) ?? null;
          if (actionType) {
            updateEvent.run(actionType, row.id);
          }
        } catch {
          // Skip malformed JSON rows — don't crash the migration
        }
      }

      // Backfill decisions.severity from JSON data payload
      const decisionRows = db
        .prepare('SELECT record_id, data FROM decisions WHERE severity IS NULL')
        .all() as { record_id: string; data: string }[];

      const updateDecision = db.prepare('UPDATE decisions SET severity = ? WHERE record_id = ?');
      for (const row of decisionRows) {
        try {
          const parsed = JSON.parse(row.data) as Record<string, unknown>;
          const policy = parsed.policy as Record<string, unknown> | undefined;
          const severity = (policy?.severity as number) ?? null;
          if (severity !== null) {
            updateDecision.run(severity, row.record_id);
          }
        } catch {
          // Skip malformed JSON rows
        }
      }

      // Add indexes on the new columns for fast filtered queries
      db.exec('CREATE INDEX IF NOT EXISTS idx_events_action_type ON events (action_type)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_decisions_severity ON decisions (severity)');
    },
  },

  {
    version: 4,
    description: 'Add standalone index on decisions.action_type for filtered queries',
    up(db) {
      db.exec('CREATE INDEX IF NOT EXISTS idx_decisions_action_type ON decisions (action_type)');
    },
  },

  {
    version: 5,
    description:
      'Add agent_id column to sessions table with index; backfill from RunStarted events',
    up(db) {
      db.exec('ALTER TABLE sessions ADD COLUMN agent_id TEXT');
      db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_agent_id ON sessions (agent_id)');

      // Backfill agent_id from RunStarted events where possible
      const rows = db
        .prepare(
          `SELECT run_id,
                  COALESCE(json_extract(data, '$.agentName'), json_extract(data, '$.agentId')) as agent
           FROM events
           WHERE kind = 'RunStarted'
             AND COALESCE(json_extract(data, '$.agentName'), json_extract(data, '$.agentId')) IS NOT NULL`
        )
        .all() as Array<{ run_id: string; agent: string }>;

      const update = db.prepare(
        'UPDATE sessions SET agent_id = ? WHERE id = ? AND agent_id IS NULL'
      );
      for (const row of rows) {
        update.run(row.agent, row.run_id);
      }
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

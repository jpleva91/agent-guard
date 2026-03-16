// SQLite-backed telemetry event queue — crash-safe, persistent, bounded.

import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { TelemetryQueue, TelemetryPayloadEvent } from './types.js';

const DEFAULT_QUEUE_PATH = join(homedir(), '.agentguard', 'telemetry-queue.db');
const MAX_QUEUE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const EVICTION_BATCH = 100;

/** Create a SQLite-backed telemetry queue. Throws if better-sqlite3 is not available. */
export async function createSqliteQueue(path?: string): Promise<TelemetryQueue> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Database: any;
  try {
    // Dynamic import to avoid compile-time resolution — better-sqlite3 is optional
    const moduleName = 'better-sqlite3';
    const mod = await (Function('m', 'return import(m)')(moduleName) as Promise<
      Record<string, unknown>
    >);
    Database = mod.default ?? mod;
  } catch {
    throw new Error(
      'SQLite telemetry queue requires better-sqlite3. Install it with: npm install better-sqlite3'
    );
  }

  const dbPath = path ?? DEFAULT_QUEUE_PATH;
  try {
    mkdirSync(dirname(dbPath), { recursive: true });
  } catch {
    // Ignore
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS telemetry_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  const insertStmt = db.prepare(
    'INSERT INTO telemetry_queue (event_json, created_at) VALUES (?, ?)'
  );
  const selectStmt = db.prepare(
    'SELECT id, event_json FROM telemetry_queue ORDER BY id ASC LIMIT ?'
  );
  const deleteStmt = db.prepare('DELETE FROM telemetry_queue WHERE id <= ?');
  const countStmt = db.prepare('SELECT COUNT(*) as cnt FROM telemetry_queue');
  const clearStmt = db.prepare('DELETE FROM telemetry_queue');
  const evictStmt = db.prepare(
    'DELETE FROM telemetry_queue WHERE id IN (SELECT id FROM telemetry_queue ORDER BY id ASC LIMIT ?)'
  );

  function getSizeBytes(): number {
    try {
      const pageCount = db.pragma('page_count', { simple: true }) as number;
      const pageSize = db.pragma('page_size', { simple: true }) as number;
      return pageCount * pageSize;
    } catch {
      return 0;
    }
  }

  function evictIfNeeded(): void {
    while (getSizeBytes() > MAX_QUEUE_SIZE_BYTES) {
      const result = evictStmt.run(EVICTION_BATCH);
      if (result.changes === 0) break;
    }
  }

  return {
    enqueue(event: TelemetryPayloadEvent): void {
      try {
        evictIfNeeded();
        insertStmt.run(JSON.stringify(event), Date.now());
      } catch {
        // Never crash the kernel
      }
    },

    dequeue(count: number): TelemetryPayloadEvent[] {
      try {
        const rows = selectStmt.all(count) as Array<{ id: number; event_json: string }>;
        if (rows.length === 0) return [];

        const maxId = rows[rows.length - 1].id;
        deleteStmt.run(maxId);

        return rows.map((r) => JSON.parse(r.event_json) as TelemetryPayloadEvent);
      } catch {
        return [];
      }
    },

    size(): number {
      try {
        const row = countStmt.get() as { cnt: number };
        return row.cnt;
      } catch {
        return 0;
      }
    },

    sizeBytes(): number {
      return getSizeBytes();
    },

    clear(): void {
      try {
        clearStmt.run();
      } catch {
        // Ignore
      }
    },

    close(): void {
      try {
        db.close();
      } catch {
        // Ignore
      }
    },
  };
}

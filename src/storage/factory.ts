// Storage backend factory — produces the correct storage objects based on config.
// Dynamic import of better-sqlite3 ensures it's only loaded for SQLite backend.

import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { createJsonlSink } from '../events/jsonl.js';
import { createDecisionJsonlSink } from '../events/decision-jsonl.js';
import type { EventSink } from '../kernel/kernel.js';
import type { DecisionSink } from '../kernel/decisions/types.js';
import type { StorageConfig } from './types.js';
import { DEFAULT_BASE_DIR, DEFAULT_DB_FILENAME } from './types.js';

/** Bundled storage objects returned by the factory */
export interface StorageBundle {
  createEventSink(runId: string): EventSink;
  createDecisionSink(runId: string): DecisionSink;
  /** Close the underlying database (no-op for JSONL) */
  close(): void;
  /** The raw better-sqlite3 Database instance, if using SQLite. Cast to Database.Database to use. */
  readonly db?: unknown;
}

/** Create a storage bundle based on configuration */
export async function createStorageBundle(config: StorageConfig): Promise<StorageBundle> {
  if (config.backend === 'sqlite') {
    return createSqliteBundle(config);
  }
  return createJsonlBundle(config);
}

function createJsonlBundle(config: StorageConfig): StorageBundle {
  const baseDir = config.baseDir ?? DEFAULT_BASE_DIR;

  return {
    createEventSink(runId: string): EventSink {
      return createJsonlSink({ runId, baseDir });
    },
    createDecisionSink(runId: string): DecisionSink {
      return createDecisionJsonlSink({ runId, baseDir });
    },
    close(): void {
      // No-op for JSONL
    },
  };
}

async function createSqliteBundle(config: StorageConfig): Promise<StorageBundle> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Database: any;
  try {
    const mod = await import('better-sqlite3');
    Database = mod.default ?? mod;
  } catch {
    throw new Error(
      'SQLite backend requires better-sqlite3. Install it with: npm install better-sqlite3'
    );
  }

  const { runMigrations } = await import('./migrations.js');
  const { createSqliteEventSink, createSqliteDecisionSink } = await import('./sqlite-sink.js');

  const dbPath = config.dbPath ?? join(config.baseDir ?? DEFAULT_BASE_DIR, DEFAULT_DB_FILENAME);

  // Ensure parent directory exists
  try {
    mkdirSync(dirname(dbPath), { recursive: true });
  } catch (err) {
    // Ignore EEXIST — directory already exists
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
      process.stderr.write(`[agentguard] Warning: failed to create SQLite directory: ${err}\n`);
    }
  }

  const db = new Database(dbPath);
  runMigrations(db);

  return {
    createEventSink(runId: string): EventSink {
      return createSqliteEventSink(db, runId);
    },
    createDecisionSink(runId: string): DecisionSink {
      return createSqliteDecisionSink(db, runId);
    },
    close(): void {
      try {
        db.close();
      } catch (err) {
        process.stderr.write(`[agentguard] Warning: failed to close SQLite database: ${err}\n`);
      }
    },
    db,
  };
}

/** Resolve storage config from CLI args and environment */
export function resolveStorageConfig(args: string[]): StorageConfig {
  const storeIdx = args.findIndex((a) => a === '--store');
  const storeArg = storeIdx !== -1 ? args[storeIdx + 1] : undefined;
  const envStore = process.env.AGENTGUARD_STORE;

  const raw = storeArg !== undefined ? storeArg : envStore;
  const backend = raw === 'sqlite' ? 'sqlite' : 'jsonl';

  const dirIdx = args.findIndex((a) => a === '--dir' || a === '-d');
  const baseDir = dirIdx !== -1 ? args[dirIdx + 1] : undefined;

  return { backend, baseDir };
}

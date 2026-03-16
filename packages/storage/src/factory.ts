// Storage backend factory — produces the correct storage objects based on config.
// Dynamic import of better-sqlite3 ensures it's only loaded when needed.

import { dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import type { EventSink } from '@red-codes/core';
import type { DecisionSink } from '@red-codes/core';
import type { StorageConfig } from './types.js';
import { DEFAULT_BASE_DIR, DEFAULT_DB_FILENAME, DEFAULT_SQLITE_DB_PATH } from './types.js';
import { join } from 'node:path';

/** Bundled storage objects returned by the factory */
export interface StorageBundle {
  createEventSink(runId: string): EventSink;
  createDecisionSink(runId: string): DecisionSink;
  /** Close the underlying database */
  close(): void;
  /** The raw better-sqlite3 Database instance. Cast to Database.Database to use. */
  readonly db?: unknown;
  /** Session lifecycle tracker */
  readonly sessions?: import('./sqlite-session.js').SessionTracker;
}

/** Create a storage bundle based on configuration */
export async function createStorageBundle(config: StorageConfig): Promise<StorageBundle> {
  return createSqliteBundle(config);
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
  const { createSessionTracker } = await import('./sqlite-session.js');

  const dbPath = resolveSqlitePath(config);

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
    sessions: createSessionTracker(db),
  };
}

/**
 * Resolve the SQLite database path from config, with home-dir default.
 *
 * Priority: config.dbPath > config.baseDir + filename > repo-local fallback > home-dir default
 */
export function resolveSqlitePath(config: StorageConfig): string {
  // Explicit dbPath takes top priority
  if (config.dbPath) return config.dbPath;

  // Explicit baseDir means user chose a custom location
  if (config.baseDir) return join(config.baseDir, DEFAULT_DB_FILENAME);

  // Check for repo-local DB (backward compat) — use it if it exists, but hint migration
  const repoLocal = join(DEFAULT_BASE_DIR, DEFAULT_DB_FILENAME);
  if (existsSync(repoLocal)) {
    process.stderr.write(
      `[agentguard] Using repo-local SQLite database at ${repoLocal}\n` +
        `[agentguard] Hint: the default location has moved to ${DEFAULT_SQLITE_DB_PATH}\n` +
        `[agentguard] To migrate, move the file and remove --dir / AGENTGUARD_DIR overrides.\n`
    );
    return repoLocal;
  }

  // Default: home directory
  return DEFAULT_SQLITE_DB_PATH;
}

/** Resolve storage config from CLI args and environment */
export function resolveStorageConfig(args: string[]): StorageConfig {
  const dirIdx = args.findIndex((a) => a === '--dir' || a === '-d');
  const baseDir = dirIdx !== -1 ? args[dirIdx + 1] : undefined;

  // --db-path flag or AGENTGUARD_DB_PATH env var for explicit SQLite path
  const dbPathIdx = args.findIndex((a) => a === '--db-path');
  const dbPathArg = dbPathIdx !== -1 ? args[dbPathIdx + 1] : undefined;
  const dbPath = dbPathArg ?? process.env.AGENTGUARD_DB_PATH ?? undefined;

  return { backend: 'sqlite', baseDir, dbPath };
}

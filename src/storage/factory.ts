// Storage backend factory — produces the correct storage objects based on config.
// Dynamic import of better-sqlite3 ensures it's only loaded for SQLite backend.

import { join, dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { createJsonlSink } from '../events/jsonl.js';
import { createDecisionJsonlSink } from '../events/decision-jsonl.js';
import type { EventSink } from '../kernel/kernel.js';
import type { DecisionSink } from '../kernel/decisions/types.js';
import type { StorageConfig } from './types.js';
import { DEFAULT_BASE_DIR, DEFAULT_DB_FILENAME, DEFAULT_SQLITE_DB_PATH } from './types.js';

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
  if (config.backend === 'firestore') {
    return createFirestoreBundle(config);
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
  };
}

async function createFirestoreBundle(config: StorageConfig): Promise<StorageBundle> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Firestore: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = await (Function('return import("@google-cloud/firestore")')() as Promise<
      Record<string, unknown>
    >);
    Firestore = mod.Firestore ?? (mod.default as Record<string, unknown>)?.Firestore ?? mod.default;
  } catch {
    throw new Error(
      'Firestore backend requires @google-cloud/firestore. Install it with: npm install @google-cloud/firestore'
    );
  }

  const { createFirestoreEventSink, createFirestoreDecisionSink } =
    await import('./firestore-sink.js');

  const projectId = config.firestoreProjectId ?? process.env.GCLOUD_PROJECT ?? undefined;
  const db = new Firestore(projectId ? { projectId } : {});

  return {
    createEventSink(runId: string): EventSink {
      return createFirestoreEventSink(db, runId);
    },
    createDecisionSink(runId: string): DecisionSink {
      return createFirestoreDecisionSink(db, runId);
    },
    close(): void {
      // Firestore client manages its own connection lifecycle
    },
    db,
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
  const storeIdx = args.findIndex((a) => a === '--store');
  const storeArg = storeIdx !== -1 ? args[storeIdx + 1] : undefined;
  const envStore = process.env.AGENTGUARD_STORE;

  const raw = storeArg !== undefined ? storeArg : envStore;
  const backend = raw === 'sqlite' ? 'sqlite' : raw === 'firestore' ? 'firestore' : 'jsonl';

  const dirIdx = args.findIndex((a) => a === '--dir' || a === '-d');
  const baseDir = dirIdx !== -1 ? args[dirIdx + 1] : undefined;

  // --db-path flag or AGENTGUARD_DB_PATH env var for explicit SQLite path
  const dbPathIdx = args.findIndex((a) => a === '--db-path');
  const dbPathArg = dbPathIdx !== -1 ? args[dbPathIdx + 1] : undefined;
  const dbPath = dbPathArg ?? process.env.AGENTGUARD_DB_PATH ?? undefined;

  return { backend, baseDir, dbPath };
}

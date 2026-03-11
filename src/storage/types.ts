// Storage backend configuration types.

import { homedir } from 'node:os';
import { join } from 'node:path';

/** Supported storage backends */
export type StorageBackend = 'jsonl' | 'sqlite';

/** Configuration for the storage layer */
export interface StorageConfig {
  /** Which backend to use. Default: 'jsonl' */
  readonly backend: StorageBackend;
  /** For sqlite: path to the .db file. Default: ~/.agentguard/agentguard.db */
  readonly dbPath?: string;
  /** Base directory for JSONL event data. Default: .agentguard (repo-local) */
  readonly baseDir?: string;
}

/** Default paths */
export const DEFAULT_BASE_DIR = '.agentguard';
export const DEFAULT_DB_FILENAME = 'agentguard.db';

/** Default SQLite database directory (home directory, out of repo tree) */
export const DEFAULT_SQLITE_DIR = join(homedir(), '.agentguard');

/** Default SQLite database path */
export const DEFAULT_SQLITE_DB_PATH = join(DEFAULT_SQLITE_DIR, DEFAULT_DB_FILENAME);

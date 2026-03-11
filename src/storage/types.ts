// Storage backend configuration types.

/** Supported storage backends */
export type StorageBackend = 'jsonl' | 'sqlite';

/** Configuration for the storage layer */
export interface StorageConfig {
  /** Which backend to use. Default: 'jsonl' */
  readonly backend: StorageBackend;
  /** For sqlite: path to the .db file. Default: .agentguard/agentguard.db */
  readonly dbPath?: string;
  /** Base directory for event data. Default: .agentguard */
  readonly baseDir?: string;
}

/** Default paths */
export const DEFAULT_BASE_DIR = '.agentguard';
export const DEFAULT_DB_FILENAME = 'agentguard.db';

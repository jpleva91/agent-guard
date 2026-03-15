// MCP server configuration — resolved from environment variables.

export type BackendType = 'local' | 'firestore' | 'remote';
export type LocalStoreType = 'jsonl' | 'sqlite';

export interface McpConfig {
  backend: BackendType;
  localStore: LocalStoreType;
  baseDir: string;
  dbPath?: string;
  firestoreProject?: string;
  remoteUrl?: string;
  remoteApiKey?: string;
  policyPath?: string;
}

export function resolveConfig(): McpConfig {
  return {
    backend: (process.env.AGENTGUARD_MCP_BACKEND as BackendType) || 'local',
    localStore: (process.env.AGENTGUARD_STORE as LocalStoreType) || 'jsonl',
    baseDir: process.env.AGENTGUARD_DIR || '.agentguard',
    dbPath: process.env.AGENTGUARD_DB_PATH,
    firestoreProject: process.env.AGENTGUARD_FIRESTORE_PROJECT,
    remoteUrl: process.env.AGENTGUARD_REMOTE_URL,
    remoteApiKey: process.env.AGENTGUARD_REMOTE_API_KEY,
    policyPath: process.env.AGENTGUARD_POLICY,
  };
}

// MCP server configuration — resolved from environment variables + config file.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export type BackendType = 'local' | 'remote';
export type LocalStoreType = 'sqlite';

export interface McpConfig {
  backend: BackendType;
  localStore: LocalStoreType;
  baseDir: string;
  dbPath?: string;
  remoteUrl?: string;
  remoteApiKey?: string;
  policyPath?: string;
  cloudEndpoint?: string;
  cloudApiKey?: string;
}

/** Read ~/.agentguard/config.json, returning an empty object on any failure. */
function readCloudConfigFile(): { endpoint?: string; apiKey?: string } {
  try {
    const configPath = join(homedir(), '.agentguard', 'config.json');
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    const cloud = raw?.cloud;
    if (cloud && typeof cloud === 'object') {
      return {
        endpoint: typeof cloud.endpoint === 'string' ? cloud.endpoint : undefined,
        apiKey: typeof cloud.apiKey === 'string' ? cloud.apiKey : undefined,
      };
    }
  } catch {
    // Config file missing or malformed — that's fine, fall through.
  }
  return {};
}

export function resolveConfig(): McpConfig {
  const fileCloud = readCloudConfigFile();

  return {
    backend: (process.env.AGENTGUARD_MCP_BACKEND as BackendType) || 'local',
    localStore: (process.env.AGENTGUARD_STORE as LocalStoreType) || 'sqlite',
    baseDir: process.env.AGENTGUARD_DIR || '.agentguard',
    dbPath: process.env.AGENTGUARD_DB_PATH,
    remoteUrl: process.env.AGENTGUARD_REMOTE_URL,
    remoteApiKey: process.env.AGENTGUARD_REMOTE_API_KEY,
    policyPath: process.env.AGENTGUARD_POLICY,
    cloudEndpoint: process.env.AGENTGUARD_CLOUD_ENDPOINT || fileCloud.endpoint,
    cloudApiKey: process.env.AGENTGUARD_CLOUD_API_KEY || fileCloud.apiKey,
  };
}

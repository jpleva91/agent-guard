// agentguard cloud — manage cloud connection (connect, status, disconnect)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { RESET, BOLD, DIM, FG } from '../colors.js';

const DEFAULT_ENDPOINT = 'https://telemetry.agentguard.dev';
const CONFIG_PATH = join(homedir(), '.agentguard', 'config.json');

interface CloudConfig {
  endpoint: string;
  apiKey: string;
}

interface ConfigFile {
  cloud?: CloudConfig;
  [key: string]: unknown;
}

/** Load ~/.agentguard/config.json, returning an empty object if missing or invalid. */
function loadConfig(): ConfigFile {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ConfigFile;
    }
    return {};
  } catch {
    return {};
  }
}

/** Write config object to ~/.agentguard/config.json, creating the directory if needed. */
function saveConfig(config: ConfigFile): void {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

/** Validate API key format: must start with `ag_` and be at least 20 characters. */
function validateApiKey(key: string): string | null {
  if (!key.startsWith('ag_')) {
    return 'API key must start with "ag_"';
  }
  if (key.length < 20) {
    return 'API key must be at least 20 characters';
  }
  return null;
}

/** Mask an API key for display: show first 8 chars + "..." */
function maskApiKey(key: string): string {
  if (key.length <= 8) return key;
  return key.slice(0, 8) + '...';
}

/**
 * CLI handler for `agentguard cloud` command.
 *
 * Subcommands:
 *   connect <api-key> [--endpoint <url>]   Connect to AgentGuard Cloud
 *   status                                  Show cloud connection status
 *   disconnect                              Remove cloud connection
 */
export async function cloud(args: string[]): Promise<number> {
  const sub = args[0];

  switch (sub) {
    case 'connect':
      return cloudConnect(args.slice(1));
    case 'status':
      return cloudStatus();
    case 'disconnect':
      return cloudDisconnect();
    case 'help':
    case undefined:
      return showCloudHelp();
    default:
      process.stderr.write(`  ${FG.red}Error:${RESET} Unknown subcommand: ${sub}\n`);
      process.stderr.write(`  ${DIM}Run "agentguard cloud help" for usage.${RESET}\n`);
      return 1;
  }
}

function cloudConnect(args: string[]): number {
  // Parse --endpoint flag
  let endpoint = DEFAULT_ENDPOINT;
  let apiKey: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--endpoint' && args[i + 1]) {
      endpoint = args[i + 1];
      i++; // skip value
    } else if (!args[i].startsWith('-')) {
      apiKey = args[i];
    }
  }

  if (!apiKey) {
    process.stderr.write(
      `  ${FG.red}Error:${RESET} Missing API key. Usage: agentguard cloud connect <api-key>\n`
    );
    return 1;
  }

  const validationError = validateApiKey(apiKey);
  if (validationError) {
    process.stderr.write(`  ${FG.red}Error:${RESET} ${validationError}\n`);
    return 1;
  }

  // Load existing config, merge cloud key, and save
  const config = loadConfig();
  config.cloud = { endpoint, apiKey };
  saveConfig(config);

  process.stderr.write('\n');
  process.stderr.write(`  ${FG.green}✓${RESET}  Connected to AgentGuard Cloud\n`);
  process.stderr.write(`  ${DIM}Endpoint:${RESET}  ${endpoint}\n`);
  process.stderr.write(`  ${DIM}API Key:${RESET}   ${maskApiKey(apiKey)}\n`);
  process.stderr.write(`  ${DIM}Config:${RESET}    ${CONFIG_PATH}\n`);
  process.stderr.write('\n');

  return 0;
}

function cloudStatus(): number {
  const config = loadConfig();

  process.stderr.write('\n');
  process.stderr.write(`  ${BOLD}AgentGuard Cloud${RESET}\n\n`);

  if (!config.cloud) {
    process.stderr.write(`  ${DIM}Status:${RESET}    ${FG.yellow}not connected${RESET}\n`);
    process.stderr.write(
      `\n  ${DIM}Run "agentguard cloud connect <api-key>" to connect.${RESET}\n`
    );
    process.stderr.write('\n');
    return 0;
  }

  process.stderr.write(`  ${DIM}Status:${RESET}    ${FG.green}connected${RESET}\n`);
  process.stderr.write(`  ${DIM}Endpoint:${RESET}  ${config.cloud.endpoint}\n`);
  process.stderr.write(`  ${DIM}API Key:${RESET}   ${maskApiKey(config.cloud.apiKey)}\n`);
  process.stderr.write(`  ${DIM}Config:${RESET}    ${CONFIG_PATH}\n`);
  process.stderr.write('\n');

  return 0;
}

function cloudDisconnect(): number {
  const config = loadConfig();

  if (!config.cloud) {
    process.stderr.write(`  ${DIM}Cloud is not connected. Nothing to do.${RESET}\n`);
    return 0;
  }

  delete config.cloud;
  saveConfig(config);

  process.stderr.write(`  ${FG.green}✓${RESET}  Disconnected from AgentGuard Cloud\n`);
  return 0;
}

function showCloudHelp(): number {
  process.stderr.write(`
  ${BOLD}agentguard cloud${RESET} — Manage AgentGuard Cloud connection

  ${BOLD}Usage:${RESET}
    agentguard cloud connect <api-key>              Connect to cloud
    agentguard cloud connect <api-key> --endpoint <url>  Use custom endpoint
    agentguard cloud status                         Show connection status
    agentguard cloud disconnect                     Remove cloud connection

  ${BOLD}API Key format:${RESET}
    Keys must start with "ag_" and be at least 20 characters.

  ${BOLD}Examples:${RESET}
    agentguard cloud connect ag_live_abc123def456xyz
    agentguard cloud connect ag_test_key1234567890 --endpoint https://custom.example.com
    agentguard cloud status
    agentguard cloud disconnect
`);
  return 0;
}

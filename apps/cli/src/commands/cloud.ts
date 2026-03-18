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
    case 'events':
      return cloudEvents(args.slice(1));
    case 'runs':
      return cloudRuns(args.slice(1));
    case 'summary':
      return cloudSummary();
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

/** Return the cloud config or write a "not connected" message and return null. */
function requireCloudConfig(): CloudConfig | null {
  const config = loadConfig();
  if (!config.cloud) {
    process.stderr.write(`  ${FG.red}Error:${RESET} Not connected to AgentGuard Cloud.\n`);
    process.stderr.write(`  ${DIM}Run "agentguard cloud connect <api-key>" to connect.${RESET}\n`);
    return null;
  }
  return config.cloud;
}

/** Build a URL from the cloud endpoint and path, appending query params. */
function buildUrl(
  endpoint: string,
  path: string,
  params: Record<string, string | undefined>
): string {
  const base = endpoint.replace(/\/+$/, '');
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

/** Colour an outcome / status string for display. */
function colorOutcome(value: string): string {
  const lower = value.toLowerCase();
  if (lower === 'allowed' || lower === 'completed' || lower === 'success') {
    return `${FG.green}${value}${RESET}`;
  }
  if (lower === 'denied' || lower === 'failed' || lower === 'error') {
    return `${FG.red}${value}${RESET}`;
  }
  if (lower === 'running' || lower === 'pending' || lower === 'escalated') {
    return `${FG.yellow}${value}${RESET}`;
  }
  return value;
}

async function cloudEvents(args: string[]): Promise<number> {
  const cloud = requireCloudConfig();
  if (!cloud) return 1;

  // Parse flags
  let limit: string | undefined;
  let sessionId: string | undefined;
  let agent: string | undefined;
  let type: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = args[i + 1];
      i++;
    } else if (args[i] === '--session' && args[i + 1]) {
      sessionId = args[i + 1];
      i++;
    } else if (args[i] === '--agent' && args[i + 1]) {
      agent = args[i + 1];
      i++;
    } else if (args[i] === '--type' && args[i + 1]) {
      type = args[i + 1];
      i++;
    }
  }

  const url = buildUrl(cloud.endpoint, '/v1/events', {
    limit: limit ?? '20',
    sessionId,
    agentId: agent,
    eventType: type,
    excludeService: 'true',
  });

  try {
    const res = await fetch(url, {
      headers: { 'X-API-Key': cloud.apiKey },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      process.stderr.write(
        `  ${FG.red}Error:${RESET} Cloud API returned ${res.status}${body ? `: ${body}` : ''}\n`
      );
      return 1;
    }

    const data = (await res.json()) as {
      events: Array<{
        timestamp?: string;
        outcome?: string;
        eventType?: string;
        action?: string;
        agentId?: string;
      }>;
      total?: number;
      count?: number;
    };

    process.stderr.write('\n');
    process.stderr.write(
      `  ${BOLD}Cloud Events${RESET}  ${DIM}(${data.count ?? data.events.length} of ${data.total ?? '?'})${RESET}\n\n`
    );

    if (data.events.length === 0) {
      process.stderr.write(`  ${DIM}No events found.${RESET}\n\n`);
      return 0;
    }

    // Header
    process.stderr.write(
      `  ${DIM}${'Timestamp'.padEnd(24)} ${'Outcome'.padEnd(12)} ${'Type'.padEnd(22)} ${'Action'.padEnd(20)} Agent${RESET}\n`
    );
    process.stderr.write(`  ${DIM}${'─'.repeat(90)}${RESET}\n`);

    for (const ev of data.events) {
      const ts = ev.timestamp
        ? new Date(ev.timestamp).toISOString().replace('T', ' ').slice(0, 19)
        : '—';
      const outcome = colorOutcome(ev.outcome ?? '—');
      const evType = ev.eventType ?? '—';
      const action = ev.action ?? '—';
      const agentId = ev.agentId ?? '—';

      process.stderr.write(
        `  ${ts.padEnd(24)} ${outcome}${''.padEnd(Math.max(0, 12 - (ev.outcome ?? '—').length))} ${evType.padEnd(22)} ${action.padEnd(20)} ${agentId}\n`
      );
    }

    process.stderr.write('\n');
    return 0;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`  ${FG.red}Error:${RESET} ${message}\n`);
    return 1;
  }
}

async function cloudRuns(args: string[]): Promise<number> {
  const cloud = requireCloudConfig();
  if (!cloud) return 1;

  // Parse flags
  let limit: string | undefined;
  let status: string | undefined;
  let agent: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = args[i + 1];
      i++;
    } else if (args[i] === '--status' && args[i + 1]) {
      status = args[i + 1];
      i++;
    } else if (args[i] === '--agent' && args[i + 1]) {
      agent = args[i + 1];
      i++;
    }
  }

  const url = buildUrl(cloud.endpoint, '/v1/runs', {
    limit: limit ?? '20',
    status,
    agentId: agent,
  });

  try {
    const res = await fetch(url, {
      headers: { 'X-API-Key': cloud.apiKey },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      process.stderr.write(
        `  ${FG.red}Error:${RESET} Cloud API returned ${res.status}${body ? `: ${body}` : ''}\n`
      );
      return 1;
    }

    const data = (await res.json()) as {
      runs: Array<{
        sessionId?: string;
        status?: string;
        eventCount?: number;
        violationCount?: number;
        startedAt?: string;
      }>;
      total?: number;
      count?: number;
    };

    process.stderr.write('\n');
    process.stderr.write(
      `  ${BOLD}Cloud Runs${RESET}  ${DIM}(${data.count ?? data.runs.length} of ${data.total ?? '?'})${RESET}\n\n`
    );

    if (data.runs.length === 0) {
      process.stderr.write(`  ${DIM}No runs found.${RESET}\n\n`);
      return 0;
    }

    // Header
    process.stderr.write(
      `  ${DIM}${'Session'.padEnd(28)} ${'Status'.padEnd(12)} ${'Events'.padEnd(8)} ${'Violations'.padEnd(12)} Started${RESET}\n`
    );
    process.stderr.write(`  ${DIM}${'─'.repeat(80)}${RESET}\n`);

    for (const run of data.runs) {
      const sid = run.sessionId ?? '—';
      const st = colorOutcome(run.status ?? '—');
      const ec = String(run.eventCount ?? 0);
      const vc = String(run.violationCount ?? 0);
      const started = run.startedAt
        ? new Date(run.startedAt).toISOString().replace('T', ' ').slice(0, 19)
        : '—';

      process.stderr.write(
        `  ${sid.padEnd(28)} ${st}${''.padEnd(Math.max(0, 12 - (run.status ?? '—').length))} ${ec.padEnd(8)} ${vc.padEnd(12)} ${started}\n`
      );
    }

    process.stderr.write('\n');
    return 0;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`  ${FG.red}Error:${RESET} ${message}\n`);
    return 1;
  }
}

async function cloudSummary(): Promise<number> {
  const cloud = requireCloudConfig();
  if (!cloud) return 1;

  const url = buildUrl(cloud.endpoint, '/v1/analytics/summary', {});

  try {
    const res = await fetch(url, {
      headers: { 'X-API-Key': cloud.apiKey },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      process.stderr.write(
        `  ${FG.red}Error:${RESET} Cloud API returned ${res.status}${body ? `: ${body}` : ''}\n`
      );
      return 1;
    }

    const data: unknown = await res.json();

    process.stderr.write('\n');
    process.stderr.write(`  ${BOLD}Cloud Analytics Summary${RESET}\n\n`);
    process.stderr.write(JSON.stringify(data, null, 2) + '\n');
    process.stderr.write('\n');

    return 0;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`  ${FG.red}Error:${RESET} ${message}\n`);
    return 1;
  }
}

function showCloudHelp(): number {
  process.stderr.write(`
  ${BOLD}agentguard cloud${RESET} — Manage AgentGuard Cloud connection and query data

  ${BOLD}Usage:${RESET}
    agentguard cloud connect <api-key>              Connect to cloud
    agentguard cloud connect <api-key> --endpoint <url>  Use custom endpoint
    agentguard cloud status                         Show connection status
    agentguard cloud disconnect                     Remove cloud connection
    agentguard cloud events [flags]                 Query governance events
    agentguard cloud runs [flags]                   Query governance runs
    agentguard cloud summary                        Show analytics summary

  ${BOLD}Events flags:${RESET}
    --limit <n>       Number of events to return (default: 20)
    --session <id>    Filter by session ID
    --agent <name>    Filter by agent ID
    --type <type>     Filter by event type

  ${BOLD}Runs flags:${RESET}
    --limit <n>       Number of runs to return (default: 20)
    --status <s>      Filter by status (e.g., completed, running)
    --agent <name>    Filter by agent ID

  ${BOLD}API Key format:${RESET}
    Keys must start with "ag_" and be at least 20 characters.

  ${BOLD}Examples:${RESET}
    agentguard cloud connect ag_live_abc123def456xyz
    agentguard cloud connect ag_test_key1234567890 --endpoint https://custom.example.com
    agentguard cloud status
    agentguard cloud disconnect
    agentguard cloud events
    agentguard cloud events --limit 50 --agent claude
    agentguard cloud events --type ActionDenied
    agentguard cloud runs
    agentguard cloud runs --status completed --limit 10
    agentguard cloud summary
`);
  return 0;
}

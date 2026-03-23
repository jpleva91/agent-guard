// agentguard cloud — manage cloud connection (connect, status, disconnect)
// Reads/writes credentials from the project's .env file (not a global config).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, parse as parsePath } from 'node:path';
import { RESET, BOLD, DIM, FG, padVis } from '../colors.js';

const DEFAULT_ENDPOINT = 'https://agentguard-cloud.vercel.app';

interface CloudConfig {
  endpoint: string;
  apiKey: string;
}

/**
 * Find the project root by walking up from cwd looking for common markers.
 */
function findProjectRoot(): string {
  const markers = ['package.json', 'agentguard.yaml', '.git', 'pyproject.toml', 'Cargo.toml'];
  let dir = process.cwd();
  const { root } = parsePath(dir);
  while (dir !== root) {
    if (markers.some((m) => existsSync(join(dir, m)))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

function getEnvPath(): string {
  return join(findProjectRoot(), '.env');
}

/** Read a single AGENTGUARD_* value from the .env file. */
function readEnvVar(envPath: string, key: string): string | undefined {
  if (!existsSync(envPath)) return undefined;
  const pattern = new RegExp(`^${key}=(.+)$`, 'm');
  const match = readFileSync(envPath, 'utf8').match(pattern);
  let value = match?.[1]?.trim();
  if (
    value &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

/** Upsert a key=value in the .env file. */
function upsertEnvVar(envPath: string, key: string, value: string): void {
  let lines: string[] = [];
  if (existsSync(envPath)) {
    lines = readFileSync(envPath, 'utf8').split('\n');
  }
  const pattern = new RegExp(`^${key}=`);
  const newLine = `${key}=${value}`;
  const idx = lines.findIndex((l) => pattern.test(l));
  if (idx >= 0) {
    lines[idx] = newLine;
  } else {
    if (lines.length > 0 && lines[lines.length - 1]!.trim() !== '') {
      lines.push('');
    }
    lines.push(`# AgentGuard Cloud`);
    lines.push(newLine);
  }
  const content = lines.join('\n').replace(/\n*$/, '\n');
  writeFileSync(envPath, content, { mode: 0o600 });
}

/** Remove AGENTGUARD_* cloud vars from .env. */
function removeCloudEnvVars(envPath: string): void {
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split('\n');
  const cloudKeys = ['AGENTGUARD_API_KEY', 'AGENTGUARD_TELEMETRY_URL', 'AGENTGUARD_TELEMETRY'];
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    // Remove the vars and their comment header
    if (
      trimmed === '# AgentGuard Cloud' ||
      trimmed === '# AgentGuard Cloud (added by agentguard cloud login)'
    )
      return false;
    return !cloudKeys.some((k) => trimmed.startsWith(`${k}=`));
  });
  writeFileSync(envPath, filtered.join('\n').replace(/\n{3,}/g, '\n\n'), { mode: 0o600 });
}

/** Load cloud config from the project .env. Returns null if not configured. */
function loadCloudConfig(): CloudConfig | null {
  const envPath = getEnvPath();
  const apiKey = readEnvVar(envPath, 'AGENTGUARD_API_KEY');
  if (!apiKey) return null;
  const endpoint = readEnvVar(envPath, 'AGENTGUARD_TELEMETRY_URL') ?? DEFAULT_ENDPOINT;
  return { endpoint, apiKey };
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
      return await cloudConnect(args.slice(1));
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

async function cloudConnect(args: string[]): Promise<number> {
  let endpoint = DEFAULT_ENDPOINT;
  let apiKey: string | undefined;
  let tenantId: string | undefined;
  let authKey: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--endpoint' && args[i + 1]) {
      endpoint = args[i + 1]!;
      i++;
    } else if (arg === '--api' && args[i + 1]) {
      endpoint = args[i + 1]!;
      i++;
    } else if (arg === '--tenant' && args[i + 1]) {
      tenantId = args[i + 1]!;
      i++;
    } else if (arg === '--key' && args[i + 1]) {
      authKey = args[i + 1]!;
      i++;
    } else if (arg.startsWith('-')) {
      process.stderr.write(`  ${FG.red}Error:${RESET} Unknown flag: ${arg}\n`);
      process.stderr.write(`  ${DIM}Run "agentguard cloud help" for usage.${RESET}\n`);
      return 1;
    } else {
      apiKey = arg;
    }
  }

  // Mode 1: Direct API key — just save it (existing behavior)
  if (apiKey && !tenantId) {
    const validationError = validateApiKey(apiKey);
    if (validationError) {
      process.stderr.write(`  ${FG.red}Error:${RESET} ${validationError}\n`);
      return 1;
    }

    const envPath = getEnvPath();
    upsertEnvVar(envPath, 'AGENTGUARD_API_KEY', apiKey);
    upsertEnvVar(envPath, 'AGENTGUARD_TELEMETRY_URL', endpoint);

    process.stderr.write('\n');
    process.stderr.write(`  ${FG.green}✓${RESET}  Connected to AgentGuard Cloud\n`);
    process.stderr.write(`  ${DIM}Endpoint:${RESET}  ${endpoint}\n`);
    process.stderr.write(`  ${DIM}API Key:${RESET}   ${maskApiKey(apiKey)}\n`);
    process.stderr.write(`  ${DIM}Saved to:${RESET}  ${envPath}\n`);
    process.stderr.write('\n');
    return 0;
  }

  // Mode 2: Provision a new key by tenant ID
  if (tenantId) {
    // Resolve auth key: --key flag → current .env → error
    if (!authKey) {
      const existing = loadCloudConfig();
      authKey = existing?.apiKey;
    }

    if (!authKey) {
      process.stderr.write(`  ${FG.red}Error:${RESET} No API key found for authentication.\n`);
      process.stderr.write(
        `  ${DIM}Provide --key <key> or run "agentguard cloud login" first.${RESET}\n`
      );
      return 1;
    }

    const base = endpoint.replace(/\/+$/, '');
    process.stderr.write(`  ${DIM}Provisioning key for tenant ${tenantId}...${RESET}\n`);

    try {
      const res = await fetch(`${base}/v1/cli/provision-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': authKey,
        },
        body: JSON.stringify({ tenantId }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        process.stderr.write(
          `  ${FG.red}Error:${RESET} Provision failed (${res.status})${body ? `: ${body}` : ''}\n`
        );
        return 1;
      }

      const data = (await res.json()) as { apiKey: string; tenantName: string };

      const envPath = getEnvPath();
      upsertEnvVar(envPath, 'AGENTGUARD_API_KEY', data.apiKey);
      upsertEnvVar(envPath, 'AGENTGUARD_TELEMETRY_URL', endpoint);

      process.stderr.write('\n');
      process.stderr.write(
        `  ${FG.green}✓${RESET}  Connected to ${BOLD}${data.tenantName}${RESET}\n`
      );
      process.stderr.write(`  ${DIM}Endpoint:${RESET}  ${endpoint}\n`);
      process.stderr.write(`  ${DIM}API Key:${RESET}   ${maskApiKey(data.apiKey)}\n`);
      process.stderr.write(`  ${DIM}Saved to:${RESET}  ${envPath}\n`);
      process.stderr.write('\n');
      return 0;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`  ${FG.red}Error:${RESET} ${message}\n`);
      return 1;
    }
  }

  // Neither key nor tenant provided
  process.stderr.write(
    `  ${FG.red}Error:${RESET} Provide an API key or use --tenant <id> to provision one.\n`
  );
  process.stderr.write(`  ${DIM}Usage: agentguard cloud connect <api-key>\n`);
  process.stderr.write(`         agentguard cloud connect --tenant <id> --api <url>${RESET}\n`);
  return 1;
}

function cloudStatus(): number {
  const cloud = loadCloudConfig();
  const envPath = getEnvPath();

  process.stderr.write('\n');
  process.stderr.write(`  ${BOLD}AgentGuard Cloud${RESET}\n\n`);

  if (!cloud) {
    process.stderr.write(`  ${DIM}Status:${RESET}    ${FG.yellow}not connected${RESET}\n`);
    process.stderr.write(
      `\n  ${DIM}Run "agentguard cloud login" or "agentguard cloud connect <api-key>" to connect.${RESET}\n`
    );
    process.stderr.write('\n');
    return 0;
  }

  const telemetryMode = readEnvVar(envPath, 'AGENTGUARD_TELEMETRY') ?? 'anonymous';

  process.stderr.write(`  ${DIM}Status:${RESET}    ${FG.green}connected${RESET}\n`);
  process.stderr.write(`  ${DIM}Endpoint:${RESET}  ${cloud.endpoint}\n`);
  process.stderr.write(`  ${DIM}API Key:${RESET}   ${maskApiKey(cloud.apiKey)}\n`);
  process.stderr.write(`  ${DIM}Telemetry:${RESET} ${telemetryMode}\n`);
  process.stderr.write(`  ${DIM}Config:${RESET}    ${envPath}\n`);
  process.stderr.write('\n');

  return 0;
}

function cloudDisconnect(): number {
  const cloud = loadCloudConfig();

  if (!cloud) {
    process.stderr.write(`  ${DIM}Cloud is not connected. Nothing to do.${RESET}\n`);
    return 0;
  }

  removeCloudEnvVars(getEnvPath());

  process.stderr.write(`  ${FG.green}✓${RESET}  Disconnected from AgentGuard Cloud\n`);
  return 0;
}

/** Return the cloud config or write a "not connected" message and return null. */
function requireCloudConfig(): CloudConfig | null {
  const cloud = loadCloudConfig();
  if (!cloud) {
    process.stderr.write(`  ${FG.red}Error:${RESET} Not connected to AgentGuard Cloud.\n`);
    process.stderr.write(
      `  ${DIM}Run "agentguard cloud login" or "agentguard cloud connect <api-key>" to connect.${RESET}\n`
    );
    return null;
  }
  return cloud;
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
        `  ${ts.padEnd(24)} ${padVis(outcome, 12)} ${evType.padEnd(22)} ${action.padEnd(20)} ${agentId}\n`
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
        `  ${sid.padEnd(28)} ${padVis(st, 12)} ${ec.padEnd(8)} ${vc.padEnd(12)} ${started}\n`
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
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
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
    agentguard cloud connect <api-key>              Connect with existing key
    agentguard cloud connect <api-key> --api <url>  Connect with custom endpoint
    agentguard cloud connect --tenant <id> --api <url>  Provision new key for tenant
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

  ${BOLD}Connect flags:${RESET}
    --api <url>           Cloud API endpoint (alias: --endpoint)
    --tenant <uuid>       Provision a new key for this tenant
    --key <api-key>       Auth key for provisioning (default: reads from .env)

  ${BOLD}Examples:${RESET}
    agentguard cloud connect ag_live_abc123def456xyz
    agentguard cloud connect ag_live_abc123def456xyz --api https://custom.example.com
    agentguard cloud connect --tenant 0c478e74-... --api https://agentguard-cloud.vercel.app
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

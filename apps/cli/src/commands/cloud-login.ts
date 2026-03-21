// agentguard cloud login — device-code auth flow for CLI-to-cloud authentication

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { RESET, BOLD, DIM, FG } from '../colors.js';

const DEFAULT_API_ENDPOINT = 'https://agentguard-cloud.vercel.app';
const DEFAULT_DASHBOARD_URL = 'https://agentguard-cloud-dashboard.vercel.app';
const CONFIG_PATH = join(homedir(), '.agentguard', 'config.json');

const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 150; // 5 minutes

interface ConfigFile {
  cloud?: {
    endpoint: string;
    apiKey: string;
  };
  [key: string]: unknown;
}

interface PollResponse {
  status: 'pending' | 'authorized' | 'expired';
  apiKey?: string;
  tenantName?: string;
  endpoint?: string;
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

/** Generate a random 8-char alphanumeric code. */
function generateDeviceCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = randomBytes(8);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join('');
}

/**
 * Open a URL in the default browser (best-effort — does not fail on error).
 * Uses execFile (not exec) to avoid shell injection risks.
 */
function openBrowser(url: string): void {
  const platform = process.platform;

  if (platform === 'darwin') {
    execFile('open', [url], () => {
      // Silently ignore errors — user can open the URL manually
    });
  } else if (platform === 'win32') {
    // On Windows, 'cmd.exe /c start' is the standard way to open a URL
    execFile('cmd.exe', ['/c', 'start', '', url], () => {
      // Silently ignore errors
    });
  } else {
    execFile('xdg-open', [url], () => {
      // Silently ignore errors
    });
  }
}

/** Sleep for the given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * CLI handler for `agentguard cloud login` command.
 *
 * Performs a device-code authentication flow:
 *   1. Generates a random code and registers it with the cloud API
 *   2. Prints an auth URL and opens it in the browser
 *   3. Polls the cloud API until the code is authorized or expired
 *   4. Saves the resulting API key and endpoint to ~/.agentguard/config.json
 */
export async function cloudLogin(args: string[]): Promise<number> {
  // Parse flags
  let apiEndpoint: string | undefined;
  let dashboardUrl: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--endpoint' && args[i + 1]) {
      apiEndpoint = args[i + 1];
      i++;
    } else if (args[i] === '--dashboard-url' && args[i + 1]) {
      dashboardUrl = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      showLoginHelp();
      return 0;
    }
  }

  // Determine the API endpoint: flag → existing config → default
  if (!apiEndpoint) {
    const config = loadConfig();
    apiEndpoint = config.cloud?.endpoint ?? DEFAULT_API_ENDPOINT;
  }

  // Derive dashboard URL: fall back to default if not explicitly provided
  if (!dashboardUrl) {
    dashboardUrl = DEFAULT_DASHBOARD_URL;
  }

  // 1. Generate device code
  const code = generateDeviceCode();

  // 2. Register code with the cloud API
  const baseEndpoint = apiEndpoint.replace(/\/+$/, '');
  try {
    const registerRes = await fetch(`${baseEndpoint}/v1/cli/device-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!registerRes.ok) {
      const body = await registerRes.text().catch(() => '');
      process.stderr.write(
        `  ${FG.red}Error:${RESET} Failed to register device code (${registerRes.status})${body ? `: ${body}` : ''}\n`
      );
      return 1;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `  ${FG.red}Error:${RESET} Could not reach cloud API at ${baseEndpoint}: ${message}\n`
    );
    process.stderr.write(
      `  ${DIM}Check your network connection or use --endpoint to specify a different endpoint.${RESET}\n`
    );
    return 1;
  }

  // 3. Build auth URL and display instructions
  const authUrl = `${dashboardUrl.replace(/\/+$/, '')}/cli-auth?code=${code}`;

  process.stderr.write('\n');
  process.stderr.write(`  ${BOLD}AgentGuard Cloud Login${RESET}\n\n`);
  process.stderr.write(`  Open this URL to authenticate:\n`);
  process.stderr.write(`  ${FG.cyan}${authUrl}${RESET}\n\n`);
  process.stderr.write(`  ${DIM}Waiting for authentication...${RESET}\n`);

  // 4. Open browser (best-effort)
  openBrowser(authUrl);

  // 5. Poll for authorization
  const pollUrl = `${baseEndpoint}/v1/cli/poll?code=${code}`;

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    let pollData: PollResponse;
    try {
      const pollRes = await fetch(pollUrl, {
        signal: AbortSignal.timeout(10_000),
      });

      if (!pollRes.ok) {
        const body = await pollRes.text().catch(() => '');
        process.stderr.write(
          `\n  ${FG.red}Error:${RESET} Poll request failed (${pollRes.status})${body ? `: ${body}` : ''}\n`
        );
        return 1;
      }

      pollData = (await pollRes.json()) as PollResponse;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`\n  ${FG.red}Error:${RESET} Poll request failed: ${message}\n`);
      return 1;
    }

    if (pollData.status === 'pending') {
      // Show a progress tick every 10 seconds (5 polls at 2s each)
      if (attempt > 0 && attempt % 5 === 0) {
        const elapsed = Math.round(((attempt + 1) * POLL_INTERVAL_MS) / 1000);
        process.stderr.write(`  ${DIM}Still waiting... (${elapsed}s)${RESET}\n`);
      }
      continue;
    }

    if (pollData.status === 'authorized') {
      const { apiKey, tenantName, endpoint: authorizedEndpoint } = pollData;

      if (!apiKey) {
        process.stderr.write(
          `\n  ${FG.red}Error:${RESET} Authorization succeeded but no API key was returned.\n`
        );
        return 1;
      }

      // 6. Save to config using the same pattern as cloudConnect in cloud.ts
      const savedEndpoint = authorizedEndpoint ?? apiEndpoint;
      const config = loadConfig();
      config.cloud = { endpoint: savedEndpoint, apiKey };
      saveConfig(config);

      const displayName = tenantName ?? 'AgentGuard Cloud';

      process.stderr.write('\n');
      process.stderr.write(`  ${FG.green}✓${RESET}  Connected to ${BOLD}${displayName}${RESET}\n`);
      process.stderr.write(
        `  ${FG.green}✓${RESET}  API key saved to ${DIM}${CONFIG_PATH}${RESET}\n`
      );
      process.stderr.write('\n');
      process.stderr.write(`  ${DIM}Run \`agentguard cloud status\` to verify.${RESET}\n\n`);

      return 0;
    }

    if (pollData.status === 'expired') {
      process.stderr.write(
        `\n  ${FG.red}Error:${RESET} Device code expired. Please run \`agentguard cloud login\` again.\n`
      );
      return 1;
    }

    // Unknown status
    process.stderr.write(
      `\n  ${FG.red}Error:${RESET} Unexpected poll status: ${String((pollData as { status: unknown }).status)}\n`
    );
    return 1;
  }

  // Timeout — 150 attempts × 2s = 5 minutes
  process.stderr.write(
    `\n  ${FG.yellow}Timeout:${RESET} Authentication timed out after 5 minutes.\n`
  );
  process.stderr.write(
    `  ${DIM}Please run \`agentguard cloud login\` again to start a new login flow.${RESET}\n\n`
  );
  return 1;
}

function showLoginHelp(): void {
  process.stderr.write(`
  ${BOLD}agentguard cloud login${RESET} — Authenticate with AgentGuard Cloud via browser

  ${BOLD}Usage:${RESET}
    agentguard cloud login [flags]

  ${BOLD}Flags:${RESET}
    --endpoint <url>        Override the cloud API endpoint
    --dashboard-url <url>   Override the dashboard URL for the auth page

  ${BOLD}Flow:${RESET}
    1. A device code is generated and registered with the cloud API.
    2. Your browser is opened to the authentication page.
    3. After you authorize in the browser, the CLI saves your API key.

  ${BOLD}Examples:${RESET}
    agentguard cloud login
    agentguard cloud login --endpoint https://custom.agentguard.example.com
`);
}

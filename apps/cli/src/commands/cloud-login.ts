// agentguard cloud login — device-code auth flow for CLI-to-cloud authentication
// Saves credentials to project .env (not global config) and optionally enables
// verified telemetry mode for cloud metrics.

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, parse as parsePath } from 'node:path';
import { execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { RESET, BOLD, DIM, FG } from '../colors.js';

const DEFAULT_API_ENDPOINT = 'https://agentguard-cloud.vercel.app';
const DEFAULT_DASHBOARD_URL = 'https://agentguard-cloud-dashboard.vercel.app';

const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 150; // 5 minutes

interface PollResponse {
  status: 'pending' | 'authorized' | 'expired';
  apiKey?: string;
  tenantName?: string;
  endpoint?: string;
}

// ── Project root + .env helpers ──────────────────────────────────────────────

/**
 * Find the project root by walking up from cwd looking for common markers.
 * Returns cwd if no marker is found.
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

/**
 * Upsert a key=value pair in a .env file. Creates the file if it doesn't exist.
 * Preserves existing content and comments.
 */
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
    // Add a blank line separator if the file doesn't end with one
    if (lines.length > 0 && lines[lines.length - 1]!.trim() !== '') {
      lines.push('');
    }
    lines.push(`# AgentGuard Cloud (added by agentguard cloud login)`);
    lines.push(newLine);
  }

  // Ensure file ends with a newline
  const content = lines.join('\n').replace(/\n*$/, '\n');
  writeFileSync(envPath, content, { mode: 0o600 });
}

/** Load existing endpoint from project .env if present. */
function loadEndpointFromEnv(envPath: string): string | undefined {
  if (!existsSync(envPath)) return undefined;
  const match = readFileSync(envPath, 'utf8').match(/^AGENTGUARD_TELEMETRY_URL=(.+)$/m);
  let value = match?.[1]?.trim();
  if (value && ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'")))) {
    value = value.slice(1, -1);
  }
  return value;
}

// ── Interactive prompts ──────────────────────────────────────────────────────

/** Prompt the user with a yes/no question. Returns true for yes. */
async function promptYesNo(question: string, defaultYes = true): Promise<boolean> {
  if (!process.stdin.isTTY) return defaultYes;

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const hint = defaultYes ? 'Y/n' : 'y/N';

  return new Promise<boolean>((resolve) => {
    rl.question(`  ${question} [${hint}]: `, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === '') return resolve(defaultYes);
      resolve(a === 'y' || a === 'yes');
    });
  });
}

// ── Utilities ────────────────────────────────────────────────────────────────

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

// ── Main command ─────────────────────────────────────────────────────────────

/**
 * CLI handler for `agentguard cloud login` command.
 *
 * Performs a device-code authentication flow:
 *   1. Generates a random code and registers it with the cloud API
 *   2. Prints an auth URL and opens it in the browser
 *   3. Polls the cloud API until the code is authorized or expired
 *   4. Saves the API key and endpoint to the project's .env file
 *   5. Asks if the user wants cloud metrics (sets telemetry to verified mode)
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

  // Determine the API endpoint: flag → existing .env → default
  const projectRoot = findProjectRoot();
  const envPath = join(projectRoot, '.env');

  if (!apiEndpoint) {
    apiEndpoint = loadEndpointFromEnv(envPath) ?? DEFAULT_API_ENDPOINT;
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

      // 6. Save to project .env file
      const savedEndpoint = authorizedEndpoint ?? apiEndpoint;
      upsertEnvVar(envPath, 'AGENTGUARD_API_KEY', apiKey);
      upsertEnvVar(envPath, 'AGENTGUARD_TELEMETRY_URL', savedEndpoint);

      const displayName = tenantName ?? 'AgentGuard Cloud';

      process.stderr.write('\n');
      process.stderr.write(`  ${FG.green}✓${RESET}  Connected to ${BOLD}${displayName}${RESET}\n`);
      process.stderr.write(
        `  ${FG.green}✓${RESET}  Credentials saved to ${DIM}${envPath}${RESET}\n`
      );

      // 7. Ask about cloud metrics / telemetry mode
      const enableMetrics = await promptYesNo(
        'Enable cloud metrics? (sends governance telemetry to AgentGuard Cloud)',
      );

      if (enableMetrics) {
        upsertEnvVar(envPath, 'AGENTGUARD_TELEMETRY', 'verified');
        process.stderr.write(`  ${FG.green}✓${RESET}  Telemetry set to ${BOLD}verified${RESET} mode\n`);
      } else {
        upsertEnvVar(envPath, 'AGENTGUARD_TELEMETRY', 'anonymous');
        process.stderr.write(`  ${DIM}Telemetry set to anonymous mode${RESET}\n`);
      }

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
    3. After you authorize in the browser, the CLI saves your API key to .env.
    4. You're asked if you want to enable cloud metrics (verified telemetry).

  ${BOLD}Credentials:${RESET}
    Saved to the project's .env file (not a global config). The hook reads
    AGENTGUARD_API_KEY and AGENTGUARD_TELEMETRY_URL from .env at runtime.

  ${BOLD}Examples:${RESET}
    agentguard cloud login
    agentguard cloud login --endpoint https://custom.agentguard.example.com
`);
}

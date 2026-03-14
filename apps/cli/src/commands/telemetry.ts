// CLI command: agentguard telemetry — manage telemetry enrollment and settings.

import { bold, color, dim } from '../colors.js';

export async function telemetry(args: string[]): Promise<number> {
  const subcommand = args[0];

  switch (subcommand) {
    case 'enroll':
      return enrollSubcommand(args.slice(1));
    case 'status':
      return statusSubcommand();
    case 'enable':
      return enableSubcommand(args.slice(1));
    case 'disable':
      return disableSubcommand();
    case 'reset':
      return resetSubcommand();
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printTelemetryHelp();
      return 0;
    default:
      process.stderr.write(`  ${color('Error:', 'red')} Unknown telemetry subcommand: ${subcommand}\n`);
      process.stderr.write(`  Run ${dim('agentguard telemetry help')} for usage info.\n`);
      return 1;
  }
}

async function enrollSubcommand(args: string[]): Promise<number> {
  const serverIdx = args.findIndex((a) => a === '--server' || a === '-s');
  const serverUrl = serverIdx !== -1 ? args[serverIdx + 1] : process.env.AGENTGUARD_TELEMETRY_SERVER;

  if (!serverUrl) {
    process.stderr.write(
      `  ${color('Error:', 'red')} Server URL required.\n` +
        `  Use ${dim('--server <url>')} or set ${dim('AGENTGUARD_TELEMETRY_SERVER')} env var.\n`
    );
    return 1;
  }

  const {
    createTelemetryClient,
    loadIdentity,
    generateIdentity,
    saveIdentity,
  } = await import('@red-codes/telemetry-client');

  process.stderr.write(`  ${dim('Enrolling with server:')} ${serverUrl}\n`);

  // Ensure identity exists
  let identity = loadIdentity();
  if (!identity) {
    identity = generateIdentity('verified');
    saveIdentity(identity);
    process.stderr.write(`  ${dim('Generated new install identity:')} ${identity.install_id}\n`);
  }

  try {
    const client = await createTelemetryClient({
      serverUrl,
      mode: 'verified',
    });
    await client.enroll(serverUrl);
    process.stderr.write(`\n  ${color('✓', 'green')} ${bold('Enrolled successfully')}\n`);
    process.stderr.write(`  ${dim('Install ID:')} ${identity.install_id}\n`);
    process.stderr.write(`  ${dim('Mode:')} verified\n\n`);
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`  ${color('Error:', 'red')} Enrollment failed: ${message}\n`);
    return 1;
  }
}

async function statusSubcommand(): Promise<number> {
  const { loadIdentity, resolveMode } = await import('@red-codes/telemetry-client');

  const identity = loadIdentity();
  const mode = resolveMode(identity);

  process.stderr.write(`\n  ${bold('AgentGuard Telemetry Status')}\n\n`);
  process.stderr.write(`  ${dim('Mode:')}        ${formatMode(mode)}\n`);

  if (identity) {
    process.stderr.write(`  ${dim('Install ID:')} ${identity.install_id}\n`);
    process.stderr.write(`  ${dim('Enrolled:')}   ${identity.enrollment_token ? color('yes', 'green') : color('no', 'yellow')}\n`);
    if (identity.enrolled_at) {
      process.stderr.write(`  ${dim('Enrolled at:')} ${identity.enrolled_at}\n`);
    }
  } else {
    process.stderr.write(`  ${dim('Install ID:')} ${color('none', 'gray')}\n`);
  }

  // Try to show queue info
  try {
    const { createTelemetryClient } = await import('@red-codes/telemetry-client');
    const client = await createTelemetryClient({ mode: mode === 'off' ? 'anonymous' : mode });
    const status = client.status();
    process.stderr.write(`  ${dim('Queue size:')} ${status.queueSize} events (${formatBytes(status.queueSizeBytes)})\n`);
    client.stop();
  } catch {
    // Queue not available
  }

  process.stderr.write('\n');
  return 0;
}

async function enableSubcommand(args: string[]): Promise<number> {
  const modeIdx = args.findIndex((a) => a === '--mode' || a === '-m');
  const modeArg = modeIdx !== -1 ? args[modeIdx + 1] : 'anonymous';

  if (modeArg !== 'anonymous' && modeArg !== 'verified') {
    process.stderr.write(`  ${color('Error:', 'red')} Mode must be 'anonymous' or 'verified'\n`);
    return 1;
  }

  const { loadIdentity, generateIdentity, saveIdentity } =
    await import('@red-codes/telemetry-client');

  let identity = loadIdentity();
  if (!identity) {
    identity = generateIdentity(modeArg);
    process.stderr.write(`  ${dim('Generated new install identity:')} ${identity.install_id}\n`);
  } else {
    identity = { ...identity, mode: modeArg };
  }

  saveIdentity(identity);
  process.stderr.write(`  ${color('✓', 'green')} Telemetry ${bold('enabled')} (mode: ${modeArg})\n`);
  return 0;
}

async function disableSubcommand(): Promise<number> {
  const { loadIdentity, saveIdentity } = await import('@red-codes/telemetry-client');

  const identity = loadIdentity();
  if (identity) {
    saveIdentity({ ...identity, mode: 'off' });
  }

  process.stderr.write(`  ${color('✓', 'green')} Telemetry ${bold('disabled')}\n`);
  return 0;
}

async function resetSubcommand(): Promise<number> {
  const { deleteIdentity, getDefaultIdentityPath } = await import('@red-codes/telemetry-client');
  const { unlinkSync } = await import('node:fs');
  const { homedir } = await import('node:os');
  const { join } = await import('node:path');

  deleteIdentity();
  process.stderr.write(`  ${dim('Deleted identity file:')} ${getDefaultIdentityPath()}\n`);

  // Remove queue files
  const dir = join(homedir(), '.agentguard');
  for (const f of ['telemetry-queue.db', 'telemetry-queue.jsonl']) {
    try {
      unlinkSync(join(dir, f));
      process.stderr.write(`  ${dim('Deleted queue file:')} ${join(dir, f)}\n`);
    } catch {
      // Ignore
    }
  }

  process.stderr.write(`  ${color('✓', 'green')} Telemetry ${bold('reset')} complete\n`);
  return 0;
}

function formatMode(mode: string): string {
  switch (mode) {
    case 'off':
      return color('OFF', 'red');
    case 'anonymous':
      return color('ANONYMOUS', 'yellow');
    case 'verified':
      return color('VERIFIED', 'green');
    default:
      return mode;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function printTelemetryHelp(): void {
  process.stderr.write(`
  ${bold('agentguard telemetry')} — Manage telemetry settings

  ${bold('Commands:')}
    enroll          Enroll this installation for verified telemetry
    status          Show current telemetry mode and identity
    enable          Enable telemetry (default: anonymous mode)
    disable         Disable telemetry
    reset           Delete identity and queue data

  ${bold('Enroll flags:')}
    --server, -s    Telemetry server URL (or AGENTGUARD_TELEMETRY_SERVER env)

  ${bold('Enable flags:')}
    --mode, -m      Mode: anonymous (default) or verified

  ${bold('Examples:')}
    agentguard telemetry status
    agentguard telemetry enable
    agentguard telemetry enable --mode verified
    agentguard telemetry enroll --server https://telemetry.agentguard.dev
    agentguard telemetry disable
    agentguard telemetry reset

`);
}

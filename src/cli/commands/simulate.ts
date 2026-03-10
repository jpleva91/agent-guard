// CLI command: agentguard simulate — standalone impact analysis.
// Runs an action through the simulation registry and displays predicted impact
// without executing the action.

import { normalizeIntent } from '../../kernel/aab.js';
import type { RawAgentAction } from '../../kernel/aab.js';
import type { NormalizedIntent } from '../../policy/evaluator.js';
import { createSimulatorRegistry } from '../../kernel/simulation/registry.js';
import { createGitSimulator } from '../../kernel/simulation/git-simulator.js';
import { createFilesystemSimulator } from '../../kernel/simulation/filesystem-simulator.js';
import { createPackageSimulator } from '../../kernel/simulation/package-simulator.js';
import type { SimulationResult } from '../../kernel/simulation/types.js';
import { ACTION_TYPES } from '../../core/actions.js';
import { bold, color, dim } from '../colors.js';

export interface SimulateOptions {
  json?: boolean;
}

const RISK_COLORS: Record<string, string> = {
  low: 'green',
  medium: 'yellow',
  high: 'red',
};

/**
 * Build a NormalizedIntent from CLI args. Two modes:
 * 1. JSON positional arg → pass through AAB normalizeIntent (same as guard command)
 * 2. Structured flags (--action, --target, etc.) → construct intent directly
 */
function buildIntent(args: string[]): NormalizedIntent | null {
  // Mode 1: JSON string as first positional arg
  const firstArg = args.find((a) => !a.startsWith('--'));
  if (firstArg) {
    try {
      const raw = JSON.parse(firstArg) as RawAgentAction;
      return normalizeIntent(raw);
    } catch {
      // Not JSON — fall through to structured flags
    }
  }

  // Mode 2: Structured flags — construct NormalizedIntent directly
  const action = flagValue(args, '--action');
  const target = flagValue(args, '--target');
  const command = flagValue(args, '--command');
  const branch = flagValue(args, '--branch');

  if (!action && !command) return null;

  return {
    action: action || 'shell.exec',
    target: target || '',
    agent: 'cli',
    branch: branch || undefined,
    command: command || undefined,
    destructive: false,
  };
}

function flagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function renderTextOutput(result: SimulationResult): void {
  const riskColor = RISK_COLORS[result.riskLevel] || 'white';

  process.stderr.write(`\n  ${bold('Simulation Result')}\n`);
  process.stderr.write(`  ${dim('─'.repeat(50))}\n\n`);

  process.stderr.write(`  ${dim('Simulator:')}    ${result.simulatorId}\n`);
  process.stderr.write(
    `  ${dim('Risk level:')}   ${color(result.riskLevel.toUpperCase(), riskColor)}\n`
  );
  process.stderr.write(`  ${dim('Blast radius:')} ${result.blastRadius}\n`);
  process.stderr.write(`  ${dim('Duration:')}     ${result.durationMs}ms\n\n`);

  if (result.predictedChanges.length > 0) {
    process.stderr.write(`  ${bold('Predicted Changes')}\n`);
    for (const change of result.predictedChanges) {
      process.stderr.write(`    ${color('•', riskColor)} ${change}\n`);
    }
    process.stderr.write('\n');
  }

  if (Object.keys(result.details).length > 0) {
    process.stderr.write(`  ${bold('Details')}\n`);
    for (const [key, value] of Object.entries(result.details)) {
      const display = typeof value === 'object' ? JSON.stringify(value) : String(value);
      process.stderr.write(`    ${dim(key + ':')} ${display}\n`);
    }
    process.stderr.write('\n');
  }
}

function printUsage(): void {
  process.stderr.write(`
  ${bold('Usage:')} agentguard simulate <action-json> [flags]
         agentguard simulate --action <type> --target <path> [flags]

  ${bold('Examples:')}
    agentguard simulate '{"tool":"Bash","command":"git push origin main"}'
    agentguard simulate --action file.write --target .env
    agentguard simulate --action git.push --branch main
    agentguard simulate --action shell.exec --command "npm install express"
    agentguard simulate --action file.delete --target package-lock.json --json

  ${bold('Flags:')}
    --action <type>     Action type (e.g., file.write, git.push, shell.exec)
    --target <path>     Target file or resource path
    --command <cmd>     Shell command (for shell.exec actions)
    --branch <name>     Git branch name
    --json              Output raw SimulationResult as JSON

  ${bold('Supported action types for simulation:')}
    file.write, file.delete       → Filesystem simulator
    git.push, git.merge,          → Git simulator
    git.force-push, git.branch.delete
    shell.exec (npm/yarn/pnpm)    → Package simulator
`);
}

export async function simulate(args: string[], options: SimulateOptions = {}): Promise<number> {
  const jsonOutput = options.json || args.includes('--json');

  const intent = buildIntent(args);
  if (!intent) {
    if (jsonOutput) {
      process.stdout.write(JSON.stringify({ error: 'No action provided' }) + '\n');
    } else {
      process.stderr.write(`  ${color('Error:', 'red')} No action provided.\n`);
      printUsage();
    }
    return 1;
  }

  // Validate the action type is recognized when provided via --action flag
  const actionArg = flagValue(args, '--action');
  if (actionArg && !ACTION_TYPES[actionArg]) {
    const validTypes = Object.keys(ACTION_TYPES).join(', ');
    if (jsonOutput) {
      process.stdout.write(
        JSON.stringify({ error: `Unknown action type: ${actionArg}`, validTypes }) + '\n'
      );
    } else {
      process.stderr.write(`  ${color('Error:', 'red')} Unknown action type: ${actionArg}\n`);
      process.stderr.write(`  ${dim('Valid types:')} ${validTypes}\n`);
    }
    return 1;
  }

  // Build simulator registry with all built-in simulators
  const simulators = createSimulatorRegistry();
  simulators.register(createGitSimulator());
  simulators.register(createFilesystemSimulator());
  simulators.register(createPackageSimulator());

  // Find a simulator that supports this intent
  const simulator = simulators.find(intent);
  if (!simulator) {
    if (jsonOutput) {
      process.stdout.write(
        JSON.stringify({
          error: `No simulator supports action: ${intent.action}`,
          intent: { action: intent.action, target: intent.target },
        }) + '\n'
      );
    } else {
      process.stderr.write(
        `  ${color('No simulator available', 'yellow')} for action ${bold(intent.action)}\n`
      );
      process.stderr.write(
        `  ${dim('Supported:')} file.write, file.delete, git.push, git.merge, git.force-push, git.branch.delete, shell.exec (npm/yarn/pnpm)\n`
      );
    }
    return 1;
  }

  // Run the simulation
  const result = await simulator.simulate(intent, {});

  if (jsonOutput) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    renderTextOutput(result);
  }

  return 0;
}

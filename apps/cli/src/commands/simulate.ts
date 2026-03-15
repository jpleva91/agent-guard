// CLI command: agentguard simulate — standalone impact analysis.
// Runs an action through the simulation registry and displays predicted impact
// without executing the action. Optionally evaluates the action against policy
// rules and invariants, returning non-zero exit codes for denials.

import { readFileSync } from 'node:fs';
import {
  normalizeIntent,
  createSimulatorRegistry,
  createGitSimulator,
  createFilesystemSimulator,
  createPackageSimulator,
  simulatePlan,
  createDependencyGraphSimulator,
} from '@red-codes/kernel';
import type { RawAgentAction, SimulationResult, PlanSimulationResult } from '@red-codes/kernel';
import { evaluate, loadPolicies } from '@red-codes/policy';
import type { NormalizedIntent, EvalResult } from '@red-codes/policy';
import { loadPolicyDefs } from '../policy-resolver.js';
import { checkAllInvariants, buildSystemState, DEFAULT_INVARIANTS } from '@red-codes/invariants';
import { ACTION_TYPES } from '@red-codes/core';
import { bold, color, dim } from '../colors.js';

export interface SimulateOptions {
  json?: boolean;
  policy?: string;
  plan?: string;
}

/** Exit codes — 0 = allowed, 1 = input error, 2 = policy denied, 3 = invariant violated */
const EXIT_OK = 0;
const EXIT_INPUT_ERROR = 1;
const EXIT_POLICY_DENIED = 2;
const EXIT_INVARIANT_VIOLATION = 3;

const RISK_COLORS: Record<string, string> = {
  low: 'green',
  medium: 'yellow',
  high: 'red',
};

/**
 * Build a NormalizedIntent from CLI args. Three modes:
 * 1. JSON positional arg → pass through AAB normalizeIntent (same as guard command)
 * 2. Structured flags (--action, --target, etc.) → construct intent directly
 * 3. Stdin JSON (when piped) → handled by caller before invoking this
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

/** Build system state from simulation result + intent for invariant checking */
function buildStateFromSimulation(
  intent: NormalizedIntent,
  result: SimulationResult
): ReturnType<typeof buildSystemState> {
  const isGitPush = intent.action === 'git.push' || intent.action === 'git.force-push';
  const isForcePush = intent.action === 'git.force-push';

  return buildSystemState({
    modifiedFiles: result.predictedChanges,
    targetBranch: intent.branch || '',
    directPush: isGitPush,
    forcePush: isForcePush,
    isPush: isGitPush,
    filesAffected: result.blastRadius,
    simulatedBlastRadius: result.blastRadius,
    simulatedRiskLevel: result.riskLevel,
    currentTarget: intent.target,
    currentCommand: intent.command || '',
  });
}

interface GovernanceResult {
  policyResult: EvalResult | null;
  invariantViolations: Array<{
    invariant: string;
    expected: string;
    actual: string;
  }>;
  allowed: boolean;
}

/** Evaluate the simulated action against policy rules and invariants */
function evaluateGovernance(
  intent: NormalizedIntent,
  result: SimulationResult,
  policyPath?: string
): GovernanceResult {
  let policyResult: EvalResult | null = null;

  // Load and evaluate policy
  const policyDefs = loadPolicyDefs(policyPath);
  if (policyDefs.length > 0) {
    const { policies } = loadPolicies(policyDefs);
    if (policies.length > 0) {
      policyResult = evaluate(intent, policies);
    }
  }

  // Check invariants against simulated state
  const state = buildStateFromSimulation(intent, result);
  const { violations } = checkAllInvariants(DEFAULT_INVARIANTS, state);

  const invariantViolations = violations.map((v) => ({
    invariant: v.invariant.name,
    expected: v.result.expected,
    actual: v.result.actual,
  }));

  const policyAllowed = policyResult ? policyResult.allowed : true;
  const invariantsHold = invariantViolations.length === 0;

  return {
    policyResult,
    invariantViolations,
    allowed: policyAllowed && invariantsHold,
  };
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

function renderGovernanceOutput(gov: GovernanceResult): void {
  process.stderr.write(`  ${bold('Governance Evaluation')}\n`);
  process.stderr.write(`  ${dim('─'.repeat(50))}\n\n`);

  if (gov.policyResult) {
    const policyColor = gov.policyResult.allowed ? 'green' : 'red';
    const policyIcon = gov.policyResult.allowed ? 'ALLOW' : 'DENY';
    process.stderr.write(
      `  ${dim('Policy:')}      ${color(policyIcon, policyColor)}  ${gov.policyResult.reason}\n`
    );
  } else {
    process.stderr.write(`  ${dim('Policy:')}      ${dim('No policy loaded')}\n`);
  }

  if (gov.invariantViolations.length === 0) {
    process.stderr.write(
      `  ${dim('Invariants:')}  ${color('PASS', 'green')}  All invariants hold\n`
    );
  } else {
    process.stderr.write(
      `  ${dim('Invariants:')}  ${color('FAIL', 'red')}  ${gov.invariantViolations.length} violation(s)\n`
    );
    for (const v of gov.invariantViolations) {
      process.stderr.write(`    ${color('✗', 'red')} ${v.invariant}: ${v.actual}\n`);
    }
  }

  process.stderr.write('\n');

  const verdict = gov.allowed ? color('ALLOWED', 'green') : color('DENIED', 'red');
  process.stderr.write(`  ${bold('Verdict:')}     ${verdict}\n\n`);
}

function renderPlanTextOutput(planResult: PlanSimulationResult): void {
  const cf = planResult.compositeForecast;
  const riskColor = RISK_COLORS[cf.riskLevel] || 'white';

  process.stderr.write(`\n  ${bold('Plan Simulation Result')}\n`);
  process.stderr.write(`  ${dim('─'.repeat(50))}\n\n`);

  process.stderr.write(`  ${dim('Total steps:')}     ${cf.totalSteps}\n`);
  process.stderr.write(`  ${dim('Simulated:')}       ${cf.simulatedSteps}\n`);
  process.stderr.write(
    `  ${dim('Risk level:')}      ${color(cf.riskLevel.toUpperCase(), riskColor)}\n`
  );
  process.stderr.write(`  ${dim('Blast radius:')}    ${cf.blastRadiusScore}\n`);
  process.stderr.write(`  ${dim('Test risk:')}       ${cf.testRiskScore}/100\n`);
  process.stderr.write(`  ${dim('Duration:')}        ${planResult.durationMs}ms\n\n`);

  // Per-step summary
  process.stderr.write(`  ${bold('Steps')}\n`);
  for (const step of planResult.steps) {
    const label = step.label || step.intent.action;
    const icon = step.result ? color('●', RISK_COLORS[step.result.riskLevel] || 'white') : dim('○');
    const risk = step.result ? ` (${step.result.riskLevel})` : ' (no simulator)';
    process.stderr.write(`    ${icon} ${dim(`[${step.index}]`)} ${label}${dim(risk)}\n`);
  }
  process.stderr.write('\n');

  // Interactions
  if (planResult.interactions.length > 0) {
    process.stderr.write(`  ${bold('Interactions')}\n`);
    for (const interaction of planResult.interactions) {
      const icon =
        interaction.type === 'cumulative-risk' ? color('⚠', 'red') : color('↔', 'yellow');
      process.stderr.write(`    ${icon} ${interaction.description}\n`);
    }
    process.stderr.write('\n');
  }

  // Predicted files
  if (cf.predictedFiles.length > 0) {
    process.stderr.write(`  ${bold('Predicted Files')}\n`);
    for (const file of cf.predictedFiles) {
      process.stderr.write(`    ${color('•', riskColor)} ${file}\n`);
    }
    process.stderr.write('\n');
  }
}

function printUsage(): void {
  process.stderr.write(`
  ${bold('Usage:')} agentguard simulate <action-json> [flags]
         agentguard simulate --action <type> --target <path> [flags]
         agentguard simulate --plan <actions.json>
         echo '{"tool":"Bash","command":"..."}' | agentguard simulate --policy policy.yaml

  ${bold('Examples:')}
    agentguard simulate '{"tool":"Bash","command":"git push origin main"}'
    agentguard simulate --action file.write --target .env
    agentguard simulate --action git.push --branch main
    agentguard simulate --action shell.exec --command "npm install express"
    agentguard simulate --action file.delete --target package-lock.json --json
    agentguard simulate --action file.write --target .env --policy agentguard.yaml
    agentguard simulate --plan plan.json
    agentguard simulate --plan plan.json --policy agentguard.yaml --json

  ${bold('Flags:')}
    --action <type>     Action type (e.g., file.write, git.push, shell.exec)
    --target <path>     Target file or resource path
    --command <cmd>     Shell command (for shell.exec actions)
    --branch <name>     Git branch name
    --plan <file>       JSON file containing an action plan (array of actions)
    --policy <file>     Policy file (YAML/JSON) to evaluate against
    --json              Output raw result as JSON

  ${bold('Exit Codes:')}
    0  Action would be allowed
    1  Input error (missing action, unknown type, no simulator)
    2  Action would be denied by policy
    3  Action would violate an invariant

  ${bold('Supported action types for simulation:')}
    file.write, file.delete       → Filesystem simulator
    git.push, git.merge,          → Git simulator
    git.force-push, git.branch.delete
    shell.exec (npm/yarn/pnpm)    → Package simulator

  ${bold('Plan file format:')}
    [
      { "tool": "Write", "file": "src/config.ts", "label": "Write config" },
      { "tool": "Bash", "command": "npm test", "label": "Run tests" },
      { "tool": "Bash", "command": "git push origin main", "label": "Push" }
    ]
`);
}

/** Read stdin if data is piped (non-TTY). Returns null if stdin is a TTY or empty. */
async function readStdin(): Promise<string | null> {
  // Only read stdin when it's explicitly piped (isTTY is exactly false or undefined with data)
  if (process.stdin.isTTY) return null;

  // Race stdin read against a short timeout to avoid hanging when no data is piped
  return new Promise<string | null>((resolve) => {
    const chunks: Buffer[] = [];
    let resolved = false;

    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
    };
    const onEnd = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        process.stdin.off('data', onData);
        process.stdin.off('end', onEnd);
        process.stdin.off('error', onError);
        const text = Buffer.concat(chunks).toString('utf8').trim();
        resolve(text.length > 0 ? text : null);
      }
    };
    const onError = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        process.stdin.off('data', onData);
        process.stdin.off('end', onEnd);
        process.stdin.off('error', onError);
        resolve(null);
      }
    };

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        process.stdin.off('data', onData);
        process.stdin.off('end', onEnd);
        process.stdin.off('error', onError);
        process.stdin.pause();
        resolve(null);
      }
    }, 500);

    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
    process.stdin.on('error', onError);
    process.stdin.resume();
  });
}

/** Load and parse a plan file, returning normalized steps */
function loadPlanFile(
  planPath: string,
  jsonOutput: boolean
): { steps: Array<{ intent: NormalizedIntent; label?: string }> } | null {
  try {
    const raw = readFileSync(planPath, 'utf8');
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;

    if (!Array.isArray(parsed) || parsed.length === 0) {
      if (jsonOutput) {
        process.stdout.write(
          JSON.stringify({ error: 'Plan file must contain a non-empty JSON array' }) + '\n'
        );
      } else {
        process.stderr.write(
          `  ${color('Error:', 'red')} Plan file must contain a non-empty JSON array.\n`
        );
      }
      return null;
    }

    const steps = parsed.map((entry) => {
      const label = typeof entry.label === 'string' ? entry.label : undefined;
      const intent = normalizeIntent(entry as RawAgentAction);
      return { intent, label };
    });

    return { steps };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (jsonOutput) {
      process.stdout.write(JSON.stringify({ error: `Failed to load plan: ${message}` }) + '\n');
    } else {
      process.stderr.write(`  ${color('Error:', 'red')} Failed to load plan: ${message}\n`);
    }
    return null;
  }
}

export async function simulate(args: string[], options: SimulateOptions = {}): Promise<number> {
  const jsonOutput = options.json || args.includes('--json');
  const policyPath = options.policy || flagValue(args, '--policy');
  const planPath = options.plan || flagValue(args, '--plan');

  // Build simulator registry with all built-in simulators
  const simulators = createSimulatorRegistry();
  simulators.register(createGitSimulator());
  simulators.register(createFilesystemSimulator());
  simulators.register(createDependencyGraphSimulator());
  simulators.register(createPackageSimulator());

  // Plan mode: simulate a batch of actions
  if (planPath) {
    return simulatePlanCommand(planPath, simulators, policyPath, jsonOutput);
  }

  // Single-action mode (existing behavior)
  // Try to build intent from args first, fall back to stdin
  let intent = buildIntent(args);

  if (!intent) {
    const stdinData = await readStdin();
    if (stdinData) {
      try {
        const raw = JSON.parse(stdinData) as RawAgentAction;
        intent = normalizeIntent(raw);
      } catch {
        if (jsonOutput) {
          process.stdout.write(JSON.stringify({ error: 'Invalid JSON on stdin' }) + '\n');
        } else {
          process.stderr.write(`  ${color('Error:', 'red')} Invalid JSON on stdin.\n`);
        }
        return EXIT_INPUT_ERROR;
      }
    }
  }

  if (!intent) {
    if (jsonOutput) {
      process.stdout.write(JSON.stringify({ error: 'No action provided' }) + '\n');
    } else {
      process.stderr.write(`  ${color('Error:', 'red')} No action provided.\n`);
      printUsage();
    }
    return EXIT_INPUT_ERROR;
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
    return EXIT_INPUT_ERROR;
  }

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
    return EXIT_INPUT_ERROR;
  }

  // Run the simulation
  const result = await simulator.simulate(intent, {});

  // Evaluate governance (policy + invariants) if --policy is provided
  const gov = policyPath ? evaluateGovernance(intent, result, policyPath) : null;

  if (jsonOutput) {
    const output: Record<string, unknown> = { ...result };
    if (gov) {
      output.governance = {
        allowed: gov.allowed,
        policy: gov.policyResult
          ? {
              decision: gov.policyResult.decision,
              reason: gov.policyResult.reason,
              matchedRule: gov.policyResult.matchedRule,
            }
          : null,
        invariantViolations: gov.invariantViolations,
      };
    }
    process.stdout.write(JSON.stringify(output) + '\n');
  } else {
    renderTextOutput(result);
    if (gov) {
      renderGovernanceOutput(gov);
    }
  }

  // Determine exit code based on governance evaluation
  if (gov) {
    if (gov.policyResult && !gov.policyResult.allowed) return EXIT_POLICY_DENIED;
    if (gov.invariantViolations.length > 0) return EXIT_INVARIANT_VIOLATION;
  }

  return EXIT_OK;
}

/** Handle plan-level simulation via --plan flag */
async function simulatePlanCommand(
  planPath: string,
  simulators: ReturnType<typeof createSimulatorRegistry>,
  policyPath: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const plan = loadPlanFile(planPath, jsonOutput);
  if (!plan) return EXIT_INPUT_ERROR;

  const planResult = await simulatePlan(plan.steps, simulators);

  // Evaluate governance for each step that produced a result
  let worstExit = EXIT_OK;
  const stepGovernance: Array<GovernanceResult | null> = [];

  if (policyPath) {
    let hasPolicyDenial = false;
    let hasInvariantViolation = false;

    for (const step of planResult.steps) {
      if (step.result) {
        const gov = evaluateGovernance(step.intent, step.result, policyPath);
        stepGovernance.push(gov);
        if (gov.policyResult && !gov.policyResult.allowed) hasPolicyDenial = true;
        if (gov.invariantViolations.length > 0) hasInvariantViolation = true;
      } else {
        stepGovernance.push(null);
      }
    }

    // Policy denial takes priority over invariant violation (matching single-action behavior)
    if (hasPolicyDenial) worstExit = EXIT_POLICY_DENIED;
    else if (hasInvariantViolation) worstExit = EXIT_INVARIANT_VIOLATION;
  }

  if (jsonOutput) {
    const output: Record<string, unknown> = {
      steps: planResult.steps,
      interactions: planResult.interactions,
      compositeForecast: planResult.compositeForecast,
      durationMs: planResult.durationMs,
    };
    if (policyPath) {
      output.governance = {
        allowed: worstExit === EXIT_OK,
        steps: stepGovernance.map((gov) =>
          gov
            ? {
                allowed: gov.allowed,
                policy: gov.policyResult
                  ? {
                      decision: gov.policyResult.decision,
                      reason: gov.policyResult.reason,
                    }
                  : null,
                invariantViolations: gov.invariantViolations,
              }
            : null
        ),
      };
    }
    process.stdout.write(JSON.stringify(output) + '\n');
  } else {
    renderPlanTextOutput(planResult);
    if (policyPath && stepGovernance.some((g) => g !== null)) {
      process.stderr.write(`  ${bold('Governance Evaluation')}\n`);
      process.stderr.write(`  ${dim('─'.repeat(50))}\n\n`);
      for (let i = 0; i < stepGovernance.length; i++) {
        const gov = stepGovernance[i];
        if (!gov) continue;
        const step = planResult.steps[i];
        const label = step.label || step.intent.action;
        const govColor = gov.allowed ? 'green' : 'red';
        const verdict = gov.allowed ? 'ALLOW' : 'DENY';
        process.stderr.write(`    ${dim(`[${i}]`)} ${label}: ${color(verdict, govColor)}\n`);
      }
      process.stderr.write('\n');
      const overallVerdict =
        worstExit === EXIT_OK ? color('ALLOWED', 'green') : color('DENIED', 'red');
      process.stderr.write(`  ${bold('Verdict:')}     ${overallVerdict}\n\n`);
    }
  }

  return worstExit;
}

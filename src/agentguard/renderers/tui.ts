// Terminal UI renderer — real-time action stream display.
// Node.js module. Writes ANSI-colored output to stderr.

import type { KernelResult } from '../kernel.js';
import type { MonitorDecision } from '../monitor.js';
import type { GovernanceDecisionRecord } from '../decisions/types.js';
import type { SimulationResult } from '../simulation/types.js';

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const ICONS = {
  allowed: '\u2713',  // ✓
  denied: '\u2717',   // ✗
  warning: '\u26A0',  // ⚠
  arrow: '\u2192',    // →
  bullet: '\u2022',   // •
};

export interface TuiConfig {
  policyName?: string;
  invariantCount?: number;
  verbose?: boolean;
}

export function renderBanner(config: TuiConfig): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${ANSI.bold}${ANSI.cyan}AgentGuard Runtime Active${ANSI.reset}`);

  const parts: string[] = [];
  if (config.policyName) {
    parts.push(`policy: ${ANSI.bold}${config.policyName}${ANSI.reset}`);
  }
  if (config.invariantCount !== undefined) {
    parts.push(`invariants: ${ANSI.bold}${config.invariantCount}${ANSI.reset} active`);
  }
  if (parts.length > 0) {
    lines.push(`  ${ANSI.dim}${parts.join(' | ')}${ANSI.reset}`);
  }

  lines.push('');
  return lines.join('\n');
}

export function renderAction(result: KernelResult, verbose?: boolean): string {
  const intent = result.decision.intent;
  const action = intent.action;
  const target = intent.target;

  if (result.allowed) {
    const exec = result.executed ? '' : ` ${ANSI.dim}(dry-run)${ANSI.reset}`;
    return `  ${ANSI.green}${ICONS.allowed}${ANSI.reset} ${action} ${ANSI.dim}${target}${ANSI.reset}${exec}`;
  }

  const reason = result.decision.decision.reason;
  const policy = result.decision.decision.matchedPolicy;
  const policyTag = policy ? ` (${policy.id})` : '';

  const lines: string[] = [];
  lines.push(
    `  ${ANSI.red}${ICONS.denied}${ANSI.reset} ${action} ${target} ${ANSI.red}${ICONS.arrow} DENIED${ANSI.reset}${ANSI.dim}${policyTag}${ANSI.reset}`
  );

  if (verbose && reason) {
    lines.push(`    ${ANSI.dim}${reason}${ANSI.reset}`);
  }

  return lines.join('\n');
}

export function renderViolations(result: KernelResult): string {
  const violations = result.decision.violations;
  if (violations.length === 0) return '';

  const lines: string[] = [];
  for (const v of violations) {
    lines.push(
      `  ${ANSI.yellow}${ICONS.warning}${ANSI.reset} invariant violated: ${ANSI.bold}${v.name}${ANSI.reset}`
    );
  }
  return lines.join('\n');
}

export function renderMonitorStatus(decision: MonitorDecision): string {
  const m = decision.monitor;
  const level = ['NORMAL', 'ELEVATED', 'HIGH', 'LOCKDOWN'][m.escalationLevel];

  const levelColor =
    m.escalationLevel === 0
      ? ANSI.green
      : m.escalationLevel === 1
        ? ANSI.yellow
        : m.escalationLevel === 2
          ? ANSI.red
          : ANSI.bold + ANSI.red;

  return `  ${ANSI.dim}[${levelColor}${level}${ANSI.reset}${ANSI.dim}] evals:${m.totalEvaluations} denied:${m.totalDenials} violations:${m.totalViolations}${ANSI.reset}`;
}

export function renderSimulation(simulation: SimulationResult): string {
  const lines: string[] = [];
  const riskColor =
    simulation.riskLevel === 'high'
      ? ANSI.red
      : simulation.riskLevel === 'medium'
        ? ANSI.yellow
        : ANSI.green;

  lines.push(`  ${ANSI.bold}${ANSI.blue}Simulation${ANSI.reset} ${ANSI.dim}(${simulation.simulatorId})${ANSI.reset}`);

  for (const change of simulation.predictedChanges) {
    lines.push(`    ${ANSI.dim}${ICONS.bullet} ${change}${ANSI.reset}`);
  }

  lines.push(
    `    blast radius: ${ANSI.bold}${simulation.blastRadius}${ANSI.reset} | risk: ${riskColor}${simulation.riskLevel}${ANSI.reset} | ${ANSI.dim}${simulation.durationMs}ms${ANSI.reset}`
  );

  return lines.join('\n');
}

export function renderDecisionRecord(record: GovernanceDecisionRecord): string {
  const lines: string[] = [];
  const outcomeColor = record.outcome === 'allow' ? ANSI.green : ANSI.red;
  const outcomeIcon = record.outcome === 'allow' ? ICONS.allowed : ICONS.denied;

  lines.push(`  ${ANSI.bold}Decision Record${ANSI.reset} ${ANSI.dim}${record.recordId}${ANSI.reset}`);
  lines.push(`    action: ${record.action.type} ${ANSI.dim}${record.action.target}${ANSI.reset}`);
  lines.push(`    outcome: ${outcomeColor}${outcomeIcon} ${record.outcome.toUpperCase()}${ANSI.reset}`);
  lines.push(`    reason: ${ANSI.dim}${record.reason}${ANSI.reset}`);

  if (record.policy.matchedPolicyId) {
    lines.push(`    policy: ${ANSI.dim}${record.policy.matchedPolicyName} (${record.policy.matchedPolicyId})${ANSI.reset}`);
  }

  if (record.invariants.violations.length > 0) {
    for (const v of record.invariants.violations) {
      lines.push(`    ${ANSI.yellow}${ICONS.warning} ${v.name}${ANSI.reset} ${ANSI.dim}(${v.actual})${ANSI.reset}`);
    }
  }

  if (record.simulation) {
    const sim = record.simulation;
    const riskColor = sim.riskLevel === 'high' ? ANSI.red : sim.riskLevel === 'medium' ? ANSI.yellow : ANSI.green;
    lines.push(`    simulation: blast=${sim.blastRadius} risk=${riskColor}${sim.riskLevel}${ANSI.reset}`);
  }

  if (record.execution.executed) {
    const execStatus = record.execution.success
      ? `${ANSI.green}success${ANSI.reset}`
      : `${ANSI.red}failed${ANSI.reset}`;
    lines.push(`    execution: ${execStatus} ${ANSI.dim}(${record.execution.durationMs}ms)${ANSI.reset}`);
  }

  return lines.join('\n');
}

export function renderDecisionTable(records: GovernanceDecisionRecord[]): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${ANSI.bold}Decision Records${ANSI.reset} ${ANSI.dim}(${records.length} decisions)${ANSI.reset}`);
  lines.push(`  ${ANSI.dim}${'─'.repeat(50)}${ANSI.reset}`);

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const num = `${i + 1}.`.padStart(4);
    const icon = r.outcome === 'allow'
      ? `${ANSI.green}${ICONS.allowed}${ANSI.reset}`
      : `${ANSI.red}${ICONS.denied}${ANSI.reset}`;

    lines.push(`  ${num} ${icon} ${r.action.type} ${ANSI.dim}${r.action.target}${ANSI.reset}`);
    lines.push(`       ${ANSI.dim}${r.reason}${ANSI.reset}`);

    if (r.invariants.violations.length > 0) {
      for (const v of r.invariants.violations) {
        lines.push(`       ${ANSI.yellow}${ICONS.warning} ${v.name}${ANSI.reset}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function renderKernelResult(result: KernelResult, verbose?: boolean): string {
  const lines: string[] = [];
  lines.push(renderAction(result, verbose));

  const violationText = renderViolations(result);
  if (violationText) lines.push(violationText);

  return lines.join('\n');
}

export function renderActionGraph(results: KernelResult[]): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${ANSI.bold}Action Graph${ANSI.reset} ${ANSI.dim}(${results.length} actions)${ANSI.reset}`);
  lines.push(`  ${ANSI.dim}${'─'.repeat(50)}${ANSI.reset}`);

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const intent = r.decision.intent;
    const num = `${i + 1}.`.padStart(4);
    const icon = r.allowed ? `${ANSI.green}${ICONS.allowed}${ANSI.reset}` : `${ANSI.red}${ICONS.denied}${ANSI.reset}`;
    const status = r.allowed
      ? r.executed
        ? `${ANSI.green}EXECUTED${ANSI.reset}`
        : `${ANSI.dim}ALLOWED${ANSI.reset}`
      : `${ANSI.red}DENIED${ANSI.reset}`;

    lines.push(`  ${num} ${icon} ${intent.action} ${ANSI.dim}${intent.target}${ANSI.reset} ${ANSI.gray}[${status}${ANSI.gray}]${ANSI.reset}`);

    if (!r.allowed) {
      lines.push(`       ${ANSI.dim}${r.decision.decision.reason}${ANSI.reset}`);
    }

    for (const v of r.decision.violations) {
      lines.push(`       ${ANSI.yellow}${ICONS.warning} ${v.name}${ANSI.reset}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function renderEventStream(events: Array<{ kind: string; timestamp: number; [key: string]: unknown }>): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${ANSI.bold}Event Stream${ANSI.reset} ${ANSI.dim}(${events.length} events)${ANSI.reset}`);
  lines.push(`  ${ANSI.dim}${'─'.repeat(50)}${ANSI.reset}`);

  for (const event of events) {
    const time = new Date(event.timestamp).toISOString().slice(11, 23);
    const kindColor = event.kind.includes('Denied') || event.kind.includes('Violation')
      ? ANSI.red
      : event.kind.includes('Allowed') || event.kind.includes('Executed')
        ? ANSI.green
        : ANSI.cyan;

    lines.push(`  ${ANSI.dim}${time}${ANSI.reset} ${kindColor}${event.kind}${ANSI.reset}`);
  }

  lines.push('');
  return lines.join('\n');
}

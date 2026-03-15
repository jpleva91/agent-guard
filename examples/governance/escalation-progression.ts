/**
 * Scenario: Escalation Progression
 *
 * Demonstrates the monitor's 4-level escalation system:
 * NORMAL → ELEVATED → HIGH → LOCKDOWN
 *
 * A persistent agent submits repeated policy-violating actions.
 * The monitor tracks violations and escalates until LOCKDOWN,
 * where all actions are auto-denied.
 *
 * Run: npx tsx examples/governance/escalation-progression.ts
 * Requires: npm run build:ts
 */

import { createMonitor, ESCALATION } from '../../dist/agentguard/monitor.js';

const LEVEL_NAMES = ['NORMAL', 'ELEVATED', 'HIGH', 'LOCKDOWN'] as const;

const monitor = createMonitor({
  policyDefs: [
    {
      id: 'branch-safety',
      name: 'Branch Safety Policy',
      severity: 4,
      rules: [
        {
          action: 'git.force-push',
          effect: 'deny',
          reason: 'Force push is prohibited',
        },
      ],
    },
  ],
  denialThreshold: 5,
  violationThreshold: 3,
});

console.log('=== Scenario: Escalation Progression ===\n');
console.log('Thresholds: denialThreshold=5, violationThreshold=3\n');
console.log('Action  Denials  Violations  Level       Reason');
console.log('------  -------  ----------  ----------  ------');

// Submit 6 policy-violating actions
for (let i = 1; i <= 6; i++) {
  const result = monitor.process({
    tool: 'Bash',
    command: 'git push --force origin main',
    agent: 'rogue-agent',
  });

  const level = LEVEL_NAMES[result.monitor.escalationLevel];
  const reason = result.decision.reason;
  const shortReason = reason.length > 40 ? reason.slice(0, 40) + '...' : reason;

  console.log(
    `  ${i}      ${String(result.monitor.totalDenials).padEnd(7)}  ${String(result.monitor.totalViolations).padEnd(10)}  ${level.padEnd(10)}  ${shortReason}`
  );
}

// Try a safe action while in lockdown
console.log('\n--- Attempting safe action during lockdown ---');
const safeResult = monitor.process({
  tool: 'Read',
  file: 'README.md',
  agent: 'rogue-agent',
});

console.log(`Action: file.read (safe)`);
console.log(`Allowed: ${safeResult.allowed}`);
console.log(`Reason: ${safeResult.decision.reason}`);
console.log(`Level: ${LEVEL_NAMES[safeResult.monitor.escalationLevel]}`);

// Show full status
console.log('\n--- Monitor Status ---');
const status = monitor.getStatus();
console.log(`Escalation: ${LEVEL_NAMES[status.escalationLevel as number]}`);
console.log(`Total evaluations: ${status.totalEvaluations}`);
console.log(`Total denials: ${status.totalDenials}`);
console.log(`Total violations: ${status.totalViolations}`);
console.log(`Denials by agent: ${JSON.stringify(status.denialsByAgent)}`);
console.log(`Violations by invariant: ${JSON.stringify(status.violationsByInvariant)}`);

// Reset and verify recovery
console.log('\n--- Human Intervention: resetEscalation() ---');
monitor.resetEscalation();

const afterReset = monitor.process({
  tool: 'Read',
  file: 'README.md',
  agent: 'rogue-agent',
});

console.log(`Action: file.read after reset`);
console.log(`Allowed: ${afterReset.allowed}`);
console.log(`Level: ${LEVEL_NAMES[afterReset.monitor.escalationLevel]}`);

// Verify
console.log('\n--- Verification ---');
console.log(
  `Reached LOCKDOWN: ${safeResult.monitor.escalationLevel === ESCALATION.LOCKDOWN ? 'PASS' : 'FAIL'}`
);
console.log(`Safe action blocked in LOCKDOWN: ${!safeResult.allowed ? 'PASS' : 'FAIL'}`);
console.log(
  `Reset restored NORMAL: ${afterReset.monitor.escalationLevel === ESCALATION.NORMAL ? 'PASS' : 'FAIL'}`
);
console.log(`Safe action works after reset: ${afterReset.allowed ? 'PASS' : 'FAIL'}`);

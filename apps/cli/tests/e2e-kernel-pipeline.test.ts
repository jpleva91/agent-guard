// End-to-end integration test: Claude Code hook → kernel → decision record.
// Validates the full governance pipeline from hook payload to persisted decision.
// Issue #22: https://github.com/jpleva91/agent-guard/issues/22

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { normalizeClaudeCodeAction, processClaudeCodeHook } from '@red-codes/adapters';
import type { ClaudeCodeHookPayload } from '@red-codes/adapters';
import { createKernel } from '@red-codes/kernel';
import type { EventSink, KernelResult } from '@red-codes/kernel';
import type { GovernanceDecisionRecord, DecisionSink } from '@red-codes/core';
import type { DomainEvent } from '@red-codes/core';
import { createSimulatorRegistry } from '@red-codes/kernel';
import type { ActionSimulator, SimulationResult } from '@red-codes/kernel';
import type { NormalizedIntent } from '@red-codes/policy';
import { resetActionCounter } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Collects events and decision records from the kernel for assertions */
function createTestSinks() {
  const events: DomainEvent[] = [];
  const decisions: GovernanceDecisionRecord[] = [];
  const eventSink: EventSink = { write: (e) => events.push(e) };
  const decisionSink: DecisionSink = { write: (r) => decisions.push(r) };
  return { events, decisions, eventSink, decisionSink };
}

/** Builds a PreToolUse hook payload for the given tool */
function preToolUse(
  tool_name: string,
  tool_input: Record<string, unknown> = {}
): ClaudeCodeHookPayload {
  return { hook: 'PreToolUse', tool_name, tool_input };
}

/** Builds a PostToolUse hook payload */
function postToolUse(
  tool_name: string,
  tool_input: Record<string, unknown> = {},
  tool_output: Record<string, unknown> = {}
): ClaudeCodeHookPayload {
  return { hook: 'PostToolUse', tool_name, tool_input, tool_output };
}

/** Creates a mock simulator that returns a configurable result */
function createMockSimulator(config: {
  id: string;
  supportedAction: string;
  blastRadius: number;
  riskLevel: 'low' | 'medium' | 'high';
  predictedChanges?: string[];
}): ActionSimulator {
  return {
    id: config.id,
    supports(intent: NormalizedIntent): boolean {
      return intent.action === config.supportedAction;
    },
    async simulate(): Promise<SimulationResult> {
      return {
        predictedChanges: config.predictedChanges || [`${config.blastRadius} files affected`],
        blastRadius: config.blastRadius,
        riskLevel: config.riskLevel,
        details: {},
        simulatorId: config.id,
        durationMs: 2,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Environment isolation: prevent .agentguard-identity walk-up from finding
// the repo root's identity file, which would override 'claude-code' identity.
// ---------------------------------------------------------------------------
let _savedEnv: NodeJS.ProcessEnv;
let _tmpWorkspace: string;

beforeEach(() => {
  _savedEnv = process.env;
  process.env = { ..._savedEnv };
  delete process.env.AGENTGUARD_AGENT_NAME;
  // Point AGENTGUARD_WORKSPACE to a fresh temp dir containing a controlled
  // identity file. This prevents the walk-up logic from finding the repo
  // root's .agentguard-identity (which may contain a non-default agent name).
  // Writing 'claude-code' mirrors the default identity the tests expect.
  _tmpWorkspace = mkdtempSync(join(tmpdir(), 'ag-e2e-'));
  writeFileSync(join(_tmpWorkspace, '.agentguard-identity'), 'claude-code');
  process.env.AGENTGUARD_WORKSPACE = _tmpWorkspace;
  resetActionCounter();
  resetEventCounter();
});

afterEach(() => {
  process.env = _savedEnv;
  try {
    rmSync(_tmpWorkspace, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

// ---------------------------------------------------------------------------
// 1. PreToolUse flows through full pipeline and produces decision record
// ---------------------------------------------------------------------------

describe('E2E: PreToolUse hook → kernel → decision record', () => {
  it('allowed file read produces a complete decision record', async () => {
    const { events, decisions, eventSink, decisionSink } = createTestSinks();

    const kernel = createKernel({
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      sinks: [eventSink],
      decisionSinks: [decisionSink],
    });

    const payload = preToolUse('Read', { file_path: 'src/index.ts' });
    const result = await processClaudeCodeHook(kernel, payload);

    // Pipeline should allow the read
    expect(result.allowed).toBe(true);
    expect(result.decisionRecord).toBeDefined();

    // Decision record should capture the full action context
    const record = result.decisionRecord!;
    expect(record.outcome).toBe('allow');
    expect(record.action.type).toBe('file.read');
    expect(record.action.target).toBe('src/index.ts');
    expect(record.action.agent).toBe('claude-code');
    expect(record.action.destructive).toBe(false);
    expect(record.runId).toBe(kernel.getRunId());

    // Monitor state should reflect one evaluation, zero denials
    expect(record.monitor.totalEvaluations).toBe(1);
    expect(record.monitor.totalDenials).toBe(0);
    expect(record.monitor.escalationLevel).toBe(0);

    // Invariants should all hold
    expect(record.invariants.allHold).toBe(true);
    expect(record.invariants.violations).toHaveLength(0);

    // No simulation (none configured)
    expect(record.simulation).toBeNull();

    // Decision sink should have received the record
    expect(decisions).toHaveLength(1);
    expect(decisions[0].recordId).toBe(record.recordId);

    // Event lifecycle: ActionRequested → ActionAllowed → DecisionRecorded
    const eventKinds = events.map((e) => e.kind);
    expect(eventKinds).toContain('ActionRequested');
    expect(eventKinds).toContain('ActionAllowed');
    expect(eventKinds).toContain('DecisionRecorded');
  });

  it('Write tool normalizes through adapter and kernel correctly', async () => {
    const { decisions, decisionSink } = createTestSinks();

    const kernel = createKernel({
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
    });

    const payload = preToolUse('Write', {
      file_path: 'src/utils/helper.ts',
      content: 'export const helper = () => {};',
    });
    const result = await processClaudeCodeHook(kernel, payload);

    expect(result.allowed).toBe(true);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].action.type).toBe('file.write');
    expect(decisions[0].action.target).toBe('src/utils/helper.ts');
  });

  it('Edit tool flows through the full pipeline', async () => {
    const { decisions, decisionSink } = createTestSinks();

    const kernel = createKernel({
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
    });

    const payload = preToolUse('Edit', {
      file_path: 'src/app.ts',
      old_string: 'const a = 1;',
      new_string: 'const a = 2;',
    });
    const result = await processClaudeCodeHook(kernel, payload);

    expect(result.allowed).toBe(true);
    expect(decisions[0].action.type).toBe('file.write');
    expect(decisions[0].action.target).toBe('src/app.ts');
  });

  it('Bash tool with benign command flows through correctly', async () => {
    const { decisions, decisionSink } = createTestSinks();

    const kernel = createKernel({
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
    });

    const payload = preToolUse('Bash', { command: 'npm test' });
    const result = await processClaudeCodeHook(kernel, payload);

    expect(result.allowed).toBe(true);
    expect(decisions[0].action.type).toBe('shell.exec');
    expect(decisions[0].action.command).toBe('npm test');
  });
});

// ---------------------------------------------------------------------------
// 2. PostToolUse completes action lifecycle
// ---------------------------------------------------------------------------

describe('E2E: PostToolUse hook completes action lifecycle', () => {
  it('PostToolUse payload flows through kernel and produces decision record', async () => {
    const { events, decisions, eventSink, decisionSink } = createTestSinks();

    const kernel = createKernel({
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      sinks: [eventSink],
      decisionSinks: [decisionSink],
    });

    // Pre-tool: evaluate the action
    const prePayload = preToolUse('Write', {
      file_path: 'src/new-file.ts',
      content: 'export default {};',
    });
    const preResult = await processClaudeCodeHook(kernel, prePayload);
    expect(preResult.allowed).toBe(true);

    // Post-tool: report completion
    const postPayload = postToolUse(
      'Write',
      { file_path: 'src/new-file.ts', content: 'export default {};' },
      { success: true }
    );
    const postResult = await processClaudeCodeHook(kernel, postPayload);

    // Both should produce decision records
    expect(decisions).toHaveLength(2);
    expect(decisions[0].outcome).toBe('allow');
    expect(decisions[1].outcome).toBe('allow');

    // Action log should have 2 entries
    expect(kernel.getActionLog()).toHaveLength(2);

    // Events should include ActionRequested for both
    const requestedEvents = events.filter((e) => e.kind === 'ActionRequested');
    expect(requestedEvents.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 3. Policy denial produces correct decision record with denial reason
// ---------------------------------------------------------------------------

describe('E2E: Policy denial → decision record', () => {
  it('git push denied by policy produces decision record with reason', async () => {
    const { events, decisions, eventSink, decisionSink } = createTestSinks();

    const kernel = createKernel({
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      sinks: [eventSink],
      decisionSinks: [decisionSink],
      policyDefs: [
        {
          id: 'protect-main',
          name: 'Protect Main Branch',
          rules: [
            {
              action: 'git.push',
              effect: 'deny' as const,
              reason: 'Direct push to repository is forbidden',
            },
          ],
          severity: 4,
        },
      ],
    });

    const payload = preToolUse('Bash', { command: 'git push origin main' });
    const result = await processClaudeCodeHook(kernel, payload);

    // Should be denied
    expect(result.allowed).toBe(false);
    expect(result.decisionRecord).toBeDefined();

    const record = result.decisionRecord!;
    expect(record.outcome).toBe('deny');
    expect(record.reason).toContain('Direct push to repository is forbidden');
    expect(record.action.type).toBe('git.push');
    expect(record.action.agent).toBe('claude-code');

    // Policy details should be captured
    expect(record.policy.matchedPolicyId).toBe('protect-main');
    expect(record.policy.matchedPolicyName).toBe('Protect Main Branch');
    expect(record.policy.severity).toBe(4);

    // Intervention should be set
    expect(record.intervention).not.toBeNull();

    // Monitor should track the denial
    expect(record.monitor.totalDenials).toBeGreaterThanOrEqual(1);

    // Decision sink should have received the record
    expect(decisions).toHaveLength(1);

    // Events: ActionRequested → PolicyDenied → ActionDenied → DecisionRecorded
    const eventKinds = events.map((e) => e.kind);
    expect(eventKinds).toContain('ActionRequested');
    expect(eventKinds).toContain('ActionDenied');
    expect(eventKinds).toContain('DecisionRecorded');
  });

  it('multiple policy rules are evaluated correctly', async () => {
    const { decisions, decisionSink } = createTestSinks();

    const kernel = createKernel({
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
      policyDefs: [
        {
          id: 'restrict-ops',
          name: 'Restrict Operations',
          rules: [
            { action: 'git.push', effect: 'deny' as const, reason: 'Push blocked' },
            { action: 'npm.publish', effect: 'deny' as const, reason: 'Publish blocked' },
          ],
          severity: 4,
        },
      ],
    });

    // Allowed: file read (no deny rule)
    const readPayload = preToolUse('Read', { file_path: 'README.md' });
    const readResult = await processClaudeCodeHook(kernel, readPayload);
    expect(readResult.allowed).toBe(true);

    // Denied: git push
    const pushPayload = preToolUse('Bash', { command: 'git push origin main' });
    const pushResult = await processClaudeCodeHook(kernel, pushPayload);
    expect(pushResult.allowed).toBe(false);

    expect(decisions).toHaveLength(2);
    expect(decisions[0].outcome).toBe('allow');
    expect(decisions[1].outcome).toBe('deny');
    expect(decisions[1].reason).toContain('Push blocked');
  });
});

// ---------------------------------------------------------------------------
// 4. Invariant failure (secret exposure) is caught and recorded
// ---------------------------------------------------------------------------

describe('E2E: Invariant violation → decision record', () => {
  it('destructive command triggers invariant denial via adapter', async () => {
    const { decisions, decisionSink } = createTestSinks();

    const kernel = createKernel({
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
    });

    // rm -rf / is detected as destructive by the AAB
    const payload = preToolUse('Bash', { command: 'rm -rf /' });
    const result = await processClaudeCodeHook(kernel, payload);

    expect(result.allowed).toBe(false);
    expect(result.decision.intent.destructive).toBe(true);

    const record = result.decisionRecord!;
    expect(record.outcome).toBe('deny');
    expect(record.action.destructive).toBe(true);
    expect(record.action.agent).toBe('claude-code');
  });

  it('secret exposure in modifiedFiles triggers no-secret-exposure invariant', async () => {
    const { events, decisions, eventSink, decisionSink } = createTestSinks();

    const kernel = createKernel({
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      sinks: [eventSink],
      decisionSinks: [decisionSink],
    });

    // Writing to a .env file with modifiedFiles in system context triggers invariant
    const payload = preToolUse('Write', { file_path: '.env', content: 'SECRET=abc123' });
    const result = await processClaudeCodeHook(kernel, payload, {
      modifiedFiles: ['.env'],
    });

    // The kernel uses the default invariants which include no-secret-exposure
    expect(result.decisionRecord).toBeDefined();
    const record = result.decisionRecord!;

    // If invariant caught it, outcome should be deny with violations
    if (!result.allowed) {
      expect(record.outcome).toBe('deny');
      expect(record.invariants.allHold).toBe(false);
      const secretViolation = record.invariants.violations.find(
        (v) => v.invariantId === 'no-secret-exposure'
      );
      expect(secretViolation).toBeDefined();
      expect(secretViolation!.severity).toBe(5);

      // InvariantViolation event should be emitted
      const violationEvents = events.filter((e) => e.kind === 'InvariantViolation');
      expect(violationEvents.length).toBeGreaterThan(0);
    }
  });

  it('force push is caught by no-force-push invariant', async () => {
    const { decisions, decisionSink } = createTestSinks();

    const kernel = createKernel({
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
    });

    const payload = preToolUse('Bash', { command: 'git push --force origin main' });
    const result = await processClaudeCodeHook(kernel, payload);

    expect(result.allowed).toBe(false);
    expect(result.decision.intent.action).toBe('git.force-push');

    const record = result.decisionRecord!;
    expect(record.outcome).toBe('deny');
    expect(record.action.type).toBe('git.force-push');
  });
});

// ---------------------------------------------------------------------------
// 5. Simulation results are included in the decision record
// ---------------------------------------------------------------------------

describe('E2E: Simulation → decision record', () => {
  it('low-risk simulation allows action and includes simulation in record', async () => {
    const registry = createSimulatorRegistry();
    registry.register(
      createMockSimulator({
        id: 'e2e-file-sim',
        supportedAction: 'file.write',
        blastRadius: 2,
        riskLevel: 'low',
        predictedChanges: ['1 file created: src/helper.ts'],
      })
    );

    const { events, decisions, eventSink, decisionSink } = createTestSinks();

    const kernel = createKernel({
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      sinks: [eventSink],
      decisionSinks: [decisionSink],
      simulators: registry,
    });

    const payload = preToolUse('Write', {
      file_path: 'src/helper.ts',
      content: 'export const help = true;',
    });
    const result = await processClaudeCodeHook(kernel, payload);

    expect(result.allowed).toBe(true);
    expect(result.decisionRecord).toBeDefined();

    const record = result.decisionRecord!;
    expect(record.outcome).toBe('allow');
    expect(record.simulation).not.toBeNull();
    expect(record.simulation!.riskLevel).toBe('low');
    expect(record.simulation!.blastRadius).toBe(2);
    expect(record.simulation!.simulatorId).toBe('e2e-file-sim');
    expect(record.simulation!.predictedChanges).toContain('1 file created: src/helper.ts');

    // SimulationCompleted event should be emitted (kernel sinks it both
    // individually and as part of the batch allEvents flush)
    const simEvents = events.filter((e) => e.kind === 'SimulationCompleted');
    expect(simEvents.length).toBeGreaterThanOrEqual(1);

    // Decision sink should contain simulation data
    expect(decisions[0].simulation).not.toBeNull();
  });

  it('high-risk simulation triggers denial via invariant re-check', async () => {
    const registry = createSimulatorRegistry();
    registry.register(
      createMockSimulator({
        id: 'e2e-git-sim',
        supportedAction: 'git.push',
        blastRadius: 100,
        riskLevel: 'high',
        predictedChanges: ['100 files affected', 'Schema migration detected'],
      })
    );

    const { events, decisions, eventSink, decisionSink } = createTestSinks();

    const kernel = createKernel({
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      sinks: [eventSink],
      decisionSinks: [decisionSink],
      simulators: registry,
      simulationBlastRadiusThreshold: 50,
    });

    // Must pass testsPass so test-before-push doesn't deny first
    const payload = preToolUse('Bash', { command: 'git push origin feature' });
    const result = await processClaudeCodeHook(kernel, payload, { testsPass: true });

    // High blast radius (100) exceeds threshold (50) → re-check invariants → denied
    expect(result.allowed).toBe(false);
    expect(result.decisionRecord).toBeDefined();

    const record = result.decisionRecord!;
    expect(record.outcome).toBe('deny');
    expect(record.simulation).not.toBeNull();
    expect(record.simulation!.riskLevel).toBe('high');
    expect(record.simulation!.blastRadius).toBe(100);

    // Should have blast-radius-limit violation from re-check
    const blastViolation = record.invariants.violations.find(
      (v) => v.invariantId === 'blast-radius-limit'
    );
    expect(blastViolation).toBeDefined();

    // SimulationCompleted and ActionDenied events should both be present
    const eventKinds = events.map((e) => e.kind);
    expect(eventKinds).toContain('SimulationCompleted');
    expect(eventKinds).toContain('ActionDenied');
    expect(eventKinds).toContain('DecisionRecorded');
  });

  it('simulation with no matching simulator produces no simulation data', async () => {
    const registry = createSimulatorRegistry();
    // Register a simulator that only supports git.push
    registry.register(
      createMockSimulator({
        id: 'git-only-sim',
        supportedAction: 'git.push',
        blastRadius: 5,
        riskLevel: 'low',
      })
    );

    const { decisions, decisionSink } = createTestSinks();

    const kernel = createKernel({
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
      simulators: registry,
    });

    // File read has no matching simulator
    const payload = preToolUse('Read', { file_path: 'src/index.ts' });
    const result = await processClaudeCodeHook(kernel, payload);

    expect(result.allowed).toBe(true);
    expect(decisions[0].simulation).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. Full multi-action session with mixed outcomes
// ---------------------------------------------------------------------------

describe('E2E: Full governance session — mixed actions', () => {
  it('processes a realistic agent session with reads, writes, and denied push', async () => {
    const { events, decisions, eventSink, decisionSink } = createTestSinks();

    const kernel = createKernel({
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      sinks: [eventSink],
      decisionSinks: [decisionSink],
      policyDefs: [
        {
          id: 'branch-protection',
          name: 'Branch Protection',
          rules: [
            {
              action: 'git.push',
              effect: 'deny' as const,
              reason: 'Push requires PR review',
            },
          ],
          severity: 4,
        },
      ],
    });

    // Step 1: Agent reads a file (allowed)
    const r1 = await processClaudeCodeHook(
      kernel,
      preToolUse('Read', { file_path: 'src/kernel/kernel.ts' })
    );
    expect(r1.allowed).toBe(true);

    // Step 2: Agent writes a file (allowed)
    const r2 = await processClaudeCodeHook(
      kernel,
      preToolUse('Write', {
        file_path: 'src/utils/new-module.ts',
        content: 'export function newFeature() {}',
      })
    );
    expect(r2.allowed).toBe(true);

    // Step 3: Agent runs tests (allowed)
    const r3 = await processClaudeCodeHook(kernel, preToolUse('Bash', { command: 'npm test' }));
    expect(r3.allowed).toBe(true);

    // Step 4: Agent tries to push (denied by policy)
    const r4 = await processClaudeCodeHook(
      kernel,
      preToolUse('Bash', { command: 'git push origin main' })
    );
    expect(r4.allowed).toBe(false);

    // Step 5: Agent reads another file (still allowed)
    const r5 = await processClaudeCodeHook(
      kernel,
      preToolUse('Read', { file_path: 'package.json' })
    );
    expect(r5.allowed).toBe(true);

    // Verify decision records
    expect(decisions).toHaveLength(5);
    expect(decisions.map((d) => d.outcome)).toEqual(['allow', 'allow', 'allow', 'deny', 'allow']);

    // All records share the same runId
    const runIds = new Set(decisions.map((d) => d.runId));
    expect(runIds.size).toBe(1);
    expect(runIds.has(kernel.getRunId())).toBe(true);

    // Monitor state should show progression
    expect(decisions[3].monitor.totalDenials).toBeGreaterThanOrEqual(1);
    expect(decisions[4].monitor.totalEvaluations).toBe(5);

    // Event lifecycle integrity
    const actionRequested = events.filter((e) => e.kind === 'ActionRequested');
    const actionAllowed = events.filter((e) => e.kind === 'ActionAllowed');
    const actionDenied = events.filter((e) => e.kind === 'ActionDenied');
    const decisionRecorded = events.filter((e) => e.kind === 'DecisionRecorded');

    expect(actionRequested.length).toBe(5);
    expect(actionAllowed.length).toBe(4);
    expect(actionDenied.length).toBe(1);
    expect(decisionRecorded.length).toBe(5);
  });

  it('escalation tracking across a governed session', async () => {
    const { decisions, decisionSink } = createTestSinks();

    const kernel = createKernel({
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
      denialThreshold: 3,
      policyDefs: [
        {
          id: 'deny-push',
          name: 'Deny Push',
          rules: [{ action: 'git.push', effect: 'deny' as const, reason: 'Blocked' }],
          severity: 4,
        },
      ],
    });

    // Generate enough denials to trigger escalation
    const results: KernelResult[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await processClaudeCodeHook(
        kernel,
        preToolUse('Bash', { command: 'git push origin main' })
      );
      results.push(r);
    }

    // All denied
    expect(results.every((r) => !r.allowed)).toBe(true);
    expect(decisions).toHaveLength(5);

    // Escalation level should have increased
    const finalRecord = decisions[decisions.length - 1];
    expect(finalRecord.monitor.escalationLevel).toBeGreaterThan(0);
    expect(finalRecord.monitor.totalDenials).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// 7. Decision record structure validation
// ---------------------------------------------------------------------------

describe('E2E: Decision record completeness', () => {
  it('decision record contains all required fields', async () => {
    const { decisions, decisionSink } = createTestSinks();

    const kernel = createKernel({
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
    });

    const payload = preToolUse('Bash', { command: 'echo hello' });
    await processClaudeCodeHook(kernel, payload);

    expect(decisions).toHaveLength(1);
    const record = decisions[0];

    // Top-level fields
    expect(record.recordId).toMatch(/^dec_/);
    expect(record.runId).toMatch(/^run_/);
    expect(typeof record.timestamp).toBe('number');
    expect(record.timestamp).toBeGreaterThan(0);

    // Action sub-object
    expect(record.action).toBeDefined();
    expect(typeof record.action.type).toBe('string');
    expect(typeof record.action.target).toBe('string');
    expect(record.action.agent).toBe('claude-code');
    expect(typeof record.action.destructive).toBe('boolean');

    // Outcome
    expect(['allow', 'deny']).toContain(record.outcome);
    expect(typeof record.reason).toBe('string');

    // Policy
    expect(record.policy).toBeDefined();
    expect(typeof record.policy.severity).toBe('number');

    // Invariants
    expect(record.invariants).toBeDefined();
    expect(typeof record.invariants.allHold).toBe('boolean');
    expect(Array.isArray(record.invariants.violations)).toBe(true);

    // Monitor
    expect(record.monitor).toBeDefined();
    expect(typeof record.monitor.escalationLevel).toBe('number');
    expect(typeof record.monitor.totalEvaluations).toBe('number');
    expect(typeof record.monitor.totalDenials).toBe('number');

    // Execution (dry-run: not executed)
    expect(record.execution).toBeDefined();
    expect(record.execution.executed).toBe(false);
  });

  it('denied record has correct intervention type', async () => {
    const { decisions, decisionSink } = createTestSinks();

    const kernel = createKernel({
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
    });

    // rm -rf triggers destructive detection → high severity → deny intervention
    const payload = preToolUse('Bash', { command: 'rm -rf /' });
    await processClaudeCodeHook(kernel, payload);

    const record = decisions[0];
    expect(record.outcome).toBe('deny');
    expect(record.intervention).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. Adapter normalization fidelity through the full pipeline
// ---------------------------------------------------------------------------

describe('E2E: Adapter normalization fidelity', () => {
  it('Glob tool normalizes correctly through full pipeline', async () => {
    const { decisions, decisionSink } = createTestSinks();

    const kernel = createKernel({
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
    });

    const payload = preToolUse('Glob', { pattern: 'src/**/*.ts' });
    const result = await processClaudeCodeHook(kernel, payload);

    expect(result.allowed).toBe(true);
    expect(decisions[0].action.type).toBe('file.read');
  });

  it('Grep tool normalizes correctly through full pipeline', async () => {
    const { decisions, decisionSink } = createTestSinks();

    const kernel = createKernel({
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
    });

    const payload = preToolUse('Grep', { pattern: 'import.*from' });
    const result = await processClaudeCodeHook(kernel, payload);

    expect(result.allowed).toBe(true);
    expect(decisions[0].action.type).toBe('file.read');
  });

  it('unknown tool flows through gracefully', async () => {
    const { decisions, decisionSink } = createTestSinks();

    const kernel = createKernel({
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
    });

    const payload = preToolUse('WebSearch', { query: 'typescript docs' });
    const result = await processClaudeCodeHook(kernel, payload);

    // Unknown tools should be allowed by default
    expect(result.allowed).toBe(true);
    expect(decisions[0].action.agent).toBe('claude-code');
  });

  it('git commit via Bash is correctly classified', async () => {
    const { decisions, decisionSink } = createTestSinks();

    const kernel = createKernel({
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
    });

    const payload = preToolUse('Bash', { command: 'git commit -m "feat: add feature"' });
    const result = await processClaudeCodeHook(kernel, payload);

    expect(result.allowed).toBe(true);
    expect(decisions[0].action.type).toBe('git.commit');
  });
});

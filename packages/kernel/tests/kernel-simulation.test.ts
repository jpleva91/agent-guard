// Integration tests: kernel + simulation + invariant re-check
import { describe, it, expect, beforeEach } from 'vitest';
import { createKernel } from '@red-codes/kernel';
import { createSimulatorRegistry } from '@red-codes/kernel';
import type { ActionSimulator, SimulationResult } from '@red-codes/kernel';
import type { NormalizedIntent } from '@red-codes/policy';
import type { GovernanceDecisionRecord, DecisionSink } from '@red-codes/core';
import { resetActionCounter } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';

beforeEach(() => {
  resetActionCounter();
  resetEventCounter();
});

function makeHighRiskSimulator(): ActionSimulator {
  return {
    id: 'test-high-risk',
    supports(intent: NormalizedIntent): boolean {
      return intent.action === 'git.push';
    },
    async simulate(): Promise<SimulationResult> {
      return {
        predictedChanges: ['100 files affected', 'Production database migration'],
        blastRadius: 100,
        riskLevel: 'high',
        details: { critical: true },
        simulatorId: 'test-high-risk',
        durationMs: 5,
      };
    },
  };
}

function makeLowRiskSimulator(): ActionSimulator {
  return {
    id: 'test-low-risk',
    supports(intent: NormalizedIntent): boolean {
      return intent.action === 'file.write';
    },
    async simulate(): Promise<SimulationResult> {
      return {
        predictedChanges: ['1 file modified'],
        blastRadius: 1,
        riskLevel: 'low',
        details: {},
        simulatorId: 'test-low-risk',
        durationMs: 1,
      };
    },
  };
}

function makeFailingSimulator(): ActionSimulator {
  return {
    id: 'test-failing',
    supports(intent: NormalizedIntent): boolean {
      return intent.action === 'shell.exec';
    },
    async simulate(): Promise<SimulationResult> {
      throw new Error('Simulator crashed');
    },
  };
}

describe('Kernel Simulation Integration', () => {
  it('high-risk simulation flips allowed to denied via blast-radius invariant', async () => {
    const registry = createSimulatorRegistry();
    registry.register(makeHighRiskSimulator());

    const sunkRecords: GovernanceDecisionRecord[] = [];
    const decisionSink: DecisionSink = { write(r) { sunkRecords.push(r); } };

    const kernel = createKernel({
      dryRun: true,
      simulators: registry,
      decisionSinks: [decisionSink],
      // Default blast radius limit is 20; simulation returns 100
      simulationBlastRadiusThreshold: 50,
    });

    // Must pass testsPass: true so test-before-push invariant doesn't deny first
    const result = await kernel.propose(
      { tool: 'Bash', command: 'git push origin feature', agent: 'test' },
      { testsPass: true }
    );

    // The action should be denied because simulation blast radius (100) > limit (20)
    expect(result.allowed).toBe(false);
    expect(result.decisionRecord).toBeDefined();
    expect(result.decisionRecord!.outcome).toBe('deny');
    expect(result.decisionRecord!.simulation).not.toBeNull();
    expect(result.decisionRecord!.simulation!.riskLevel).toBe('high');
    expect(result.decisionRecord!.simulation!.blastRadius).toBe(100);

    // Decision sink should have received the record
    expect(sunkRecords).toHaveLength(1);
    expect(sunkRecords[0].outcome).toBe('deny');
  });

  it('low-risk simulation allows action to proceed', async () => {
    const registry = createSimulatorRegistry();
    registry.register(makeLowRiskSimulator());

    const kernel = createKernel({
      dryRun: true,
      simulators: registry,
    });

    const result = await kernel.propose({
      tool: 'Write',
      file: 'src/helper.ts',
      agent: 'test',
    });

    expect(result.allowed).toBe(true);
    expect(result.decisionRecord).toBeDefined();
    expect(result.decisionRecord!.outcome).toBe('allow');
    // Simulation data should be present
    expect(result.decisionRecord!.simulation).not.toBeNull();
    expect(result.decisionRecord!.simulation!.riskLevel).toBe('low');
  });

  it('simulation failure does not crash kernel and emits failure event', async () => {
    const registry = createSimulatorRegistry();
    registry.register(makeFailingSimulator());

    const kernel = createKernel({
      dryRun: true,
      simulators: registry,
    });

    const result = await kernel.propose({
      tool: 'Bash',
      command: 'npm test',
      agent: 'test',
    });

    // Should still process normally despite simulator crash
    expect(result.allowed).toBe(true);
    expect(result.decisionRecord).toBeDefined();

    // Should emit a SimulationCompleted event with failure metadata
    const simEvents = result.events.filter((e) => e.kind === 'SimulationCompleted');
    expect(simEvents.length).toBe(1);
    const simEvent = simEvents[0] as Record<string, unknown>;
    const metadata = simEvent.metadata as Record<string, unknown>;
    expect(metadata.failed).toBe(true);
    expect(metadata.error).toContain('Simulator crashed');
  });

  it('kernel without simulators works as before', async () => {
    const kernel = createKernel({ dryRun: true });

    const result = await kernel.propose({
      tool: 'Read',
      file: 'test.ts',
      agent: 'test',
    });

    expect(result.allowed).toBe(true);
    expect(result.decisionRecord).toBeDefined();
    expect(result.decisionRecord!.simulation).toBeNull();
  });

  it('simulation events are included in result events', async () => {
    const registry = createSimulatorRegistry();
    registry.register(makeLowRiskSimulator());

    const kernel = createKernel({
      dryRun: true,
      simulators: registry,
    });

    const result = await kernel.propose({
      tool: 'Write',
      file: 'src/test.ts',
      agent: 'test',
    });

    const simEvents = result.events.filter((e) => e.kind === 'SimulationCompleted');
    expect(simEvents.length).toBe(1);
  });

  it('simulation-triggered denial includes violation details', async () => {
    const registry = createSimulatorRegistry();
    registry.register(makeHighRiskSimulator());

    const kernel = createKernel({
      dryRun: true,
      simulators: registry,
      simulationBlastRadiusThreshold: 10,
    });

    // Must pass testsPass: true so test-before-push invariant doesn't deny first
    const result = await kernel.propose(
      { tool: 'Bash', command: 'git push origin feature', agent: 'test' },
      { testsPass: true }
    );

    expect(result.allowed).toBe(false);
    expect(result.decision.violations.length).toBeGreaterThan(0);
    // Should have blast-radius-limit violation
    const blastViolation = result.decision.violations.find(
      (v) => v.invariantId === 'blast-radius-limit'
    );
    expect(blastViolation).toBeDefined();
  });
});

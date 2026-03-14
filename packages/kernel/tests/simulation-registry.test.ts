// Tests for Simulator Registry
import { describe, it, expect } from 'vitest';
import { createSimulatorRegistry } from '@red-codes/kernel';
import type { ActionSimulator, SimulationResult } from '@red-codes/kernel';
import type { NormalizedIntent } from '@red-codes/policy';

function makeStubSimulator(id: string, supportedActions: string[]): ActionSimulator {
  return {
    id,
    supports(intent: NormalizedIntent): boolean {
      return supportedActions.includes(intent.action);
    },
    async simulate(): Promise<SimulationResult> {
      return {
        predictedChanges: [],
        blastRadius: 0,
        riskLevel: 'low',
        details: {},
        simulatorId: id,
        durationMs: 0,
      };
    },
  };
}

describe('SimulatorRegistry', () => {
  it('creates empty registry', () => {
    const registry = createSimulatorRegistry();
    expect(registry.all()).toHaveLength(0);
  });

  it('registers a simulator', () => {
    const registry = createSimulatorRegistry();
    registry.register(makeStubSimulator('test', ['file.read']));
    expect(registry.all()).toHaveLength(1);
  });

  it('prevents duplicate registration', () => {
    const registry = createSimulatorRegistry();
    const sim = makeStubSimulator('test', ['file.read']);
    registry.register(sim);
    registry.register(sim);
    expect(registry.all()).toHaveLength(1);
  });

  it('finds simulator for matching intent', () => {
    const registry = createSimulatorRegistry();
    registry.register(makeStubSimulator('git', ['git.push', 'git.force-push']));
    registry.register(makeStubSimulator('fs', ['file.write', 'file.delete']));

    const gitResult = registry.find({
      action: 'git.push',
      target: 'main',
      agent: 'test',
      destructive: false,
    });
    expect(gitResult).not.toBeNull();
    expect(gitResult!.id).toBe('git');

    const fsResult = registry.find({
      action: 'file.write',
      target: 'test.ts',
      agent: 'test',
      destructive: false,
    });
    expect(fsResult).not.toBeNull();
    expect(fsResult!.id).toBe('fs');
  });

  it('returns null when no simulator matches', () => {
    const registry = createSimulatorRegistry();
    registry.register(makeStubSimulator('git', ['git.push']));

    const result = registry.find({
      action: 'file.read',
      target: 'test.ts',
      agent: 'test',
      destructive: false,
    });
    expect(result).toBeNull();
  });

  it('returns first matching simulator', () => {
    const registry = createSimulatorRegistry();
    registry.register(makeStubSimulator('first', ['git.push']));
    registry.register(makeStubSimulator('second', ['git.push']));

    const result = registry.find({
      action: 'git.push',
      target: 'main',
      agent: 'test',
      destructive: false,
    });
    expect(result!.id).toBe('first');
  });
});

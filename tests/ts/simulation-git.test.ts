// Tests for Git Simulator
import { describe, it, expect } from 'vitest';
import { createGitSimulator } from '../../src/agentguard/simulation/git-simulator.js';

describe('GitSimulator', () => {
  const simulator = createGitSimulator();

  it('has correct id', () => {
    expect(simulator.id).toBe('git-simulator');
  });

  it('supports git.push', () => {
    expect(
      simulator.supports({ action: 'git.push', target: 'main', agent: 'test', destructive: false })
    ).toBe(true);
  });

  it('supports git.force-push', () => {
    expect(
      simulator.supports({ action: 'git.force-push', target: 'main', agent: 'test', destructive: false })
    ).toBe(true);
  });

  it('supports git.merge', () => {
    expect(
      simulator.supports({ action: 'git.merge', target: 'feature', agent: 'test', destructive: false })
    ).toBe(true);
  });

  it('supports git.branch.delete', () => {
    expect(
      simulator.supports({ action: 'git.branch.delete', target: 'feature', agent: 'test', destructive: false })
    ).toBe(true);
  });

  it('does not support file actions', () => {
    expect(
      simulator.supports({ action: 'file.write', target: 'test.ts', agent: 'test', destructive: false })
    ).toBe(false);
  });

  it('returns high risk for force push', async () => {
    const result = await simulator.simulate(
      { action: 'git.force-push', target: 'main', agent: 'test', destructive: false },
      {}
    );

    expect(result.riskLevel).toBe('high');
    expect(result.blastRadius).toBe(100);
    expect(result.predictedChanges.some((c) => c.includes('Force push'))).toBe(true);
    expect(result.simulatorId).toBe('git-simulator');
  });

  it('detects protected branch push', async () => {
    const result = await simulator.simulate(
      { action: 'git.push', target: 'main', branch: 'main', agent: 'test', destructive: false },
      { protectedBranches: ['main', 'master'] }
    );

    expect(result.predictedChanges.some((c) => c.includes('protected branch'))).toBe(true);
    expect(result.details.protectedBranch).toBe(true);
  });

  it('returns high risk for deleting protected branch', async () => {
    const result = await simulator.simulate(
      { action: 'git.branch.delete', target: 'main', agent: 'test', destructive: false },
      { protectedBranches: ['main'] }
    );

    expect(result.riskLevel).toBe('high');
    expect(result.blastRadius).toBe(100);
  });

  it('returns low risk for deleting non-protected branch', async () => {
    const result = await simulator.simulate(
      { action: 'git.branch.delete', target: 'feature-xyz', agent: 'test', destructive: false },
      { protectedBranches: ['main'] }
    );

    expect(result.riskLevel).toBe('low');
    expect(result.blastRadius).toBe(1);
  });

  it('returns valid SimulationResult shape', async () => {
    const result = await simulator.simulate(
      { action: 'git.push', target: 'feature', agent: 'test', destructive: false },
      {}
    );

    expect(result).toHaveProperty('predictedChanges');
    expect(result).toHaveProperty('blastRadius');
    expect(result).toHaveProperty('riskLevel');
    expect(result).toHaveProperty('details');
    expect(result).toHaveProperty('simulatorId');
    expect(result).toHaveProperty('durationMs');
    expect(Array.isArray(result.predictedChanges)).toBe(true);
    expect(typeof result.blastRadius).toBe('number');
    expect(['low', 'medium', 'high']).toContain(result.riskLevel);
  });
});

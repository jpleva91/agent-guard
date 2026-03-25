// Tests for Shell Simulator
import { describe, it, expect } from 'vitest';
import { createShellSimulator } from '@red-codes/kernel';

describe('ShellSimulator', () => {
  const simulator = createShellSimulator();

  it('has correct id', () => {
    expect(simulator.id).toBe('shell-simulator');
  });

  it('supports shell.exec', () => {
    expect(
      simulator.supports({ action: 'shell.exec', target: '', agent: 'test', destructive: false })
    ).toBe(true);
  });

  it('does not support file actions', () => {
    expect(
      simulator.supports({
        action: 'file.write',
        target: 'test.ts',
        agent: 'test',
        destructive: false,
      })
    ).toBe(false);
  });

  it('does not support git actions', () => {
    expect(
      simulator.supports({
        action: 'git.push',
        target: 'main',
        agent: 'test',
        destructive: false,
      })
    ).toBe(false);
  });

  it('returns high risk for rm -rf', async () => {
    const result = await simulator.simulate(
      {
        action: 'shell.exec',
        target: '',
        command: 'rm -rf /',
        agent: 'test',
        destructive: false,
      },
      {}
    );

    expect(result.riskLevel).toBe('high');
    expect(result.blastRadius).toBeGreaterThanOrEqual(50);
    expect(result.simulatorId).toBe('shell-simulator');
    expect(result.predictedChanges.some((c) => c.includes('CRITICAL'))).toBe(true);
    expect(result.details.destructivePatternCount).toBeGreaterThan(0);
  });

  it('returns high risk for sudo rm', async () => {
    const result = await simulator.simulate(
      {
        action: 'shell.exec',
        target: '',
        command: 'sudo rm -rf /tmp/data',
        agent: 'test',
        destructive: false,
      },
      {}
    );

    expect(result.riskLevel).toBe('high');
    expect(result.details.destructiveMatches).toBeDefined();
  });

  it('returns medium risk for high-risk commands', async () => {
    const result = await simulator.simulate(
      {
        action: 'shell.exec',
        target: '',
        command: 'kill -9 12345',
        agent: 'test',
        destructive: false,
      },
      {}
    );

    expect(['medium', 'high']).toContain(result.riskLevel);
    expect(result.details.destructivePatternCount).toBeGreaterThan(0);
  });

  it('returns low risk for safe commands', async () => {
    const result = await simulator.simulate(
      {
        action: 'shell.exec',
        target: '',
        command: 'echo hello world',
        agent: 'test',
        destructive: false,
      },
      {}
    );

    expect(result.riskLevel).toBe('low');
    expect(result.blastRadius).toBe(1);
    expect(result.details.destructivePatternCount).toBe(0);
  });

  it('returns low risk for empty command', async () => {
    const result = await simulator.simulate(
      { action: 'shell.exec', target: '', agent: 'test', destructive: false },
      {}
    );

    expect(result.riskLevel).toBe('low');
    expect(result.blastRadius).toBe(0);
    expect(result.details.empty).toBe(true);
  });

  it('detects database destructive patterns', async () => {
    const result = await simulator.simulate(
      {
        action: 'shell.exec',
        target: '',
        command: 'psql -c "DROP DATABASE myapp"',
        agent: 'test',
        destructive: false,
      },
      {}
    );

    expect(result.riskLevel).toBe('high');
    expect(result.predictedChanges.some((c) => c.includes('database'))).toBe(true);
  });

  it('detects infrastructure destructive patterns', async () => {
    const result = await simulator.simulate(
      {
        action: 'shell.exec',
        target: '',
        command: 'terraform destroy -auto-approve',
        agent: 'test',
        destructive: false,
      },
      {}
    );

    expect(result.riskLevel).toBe('high');
    expect(result.predictedChanges.some((c) => c.includes('CRITICAL'))).toBe(true);
  });

  it('returns valid SimulationResult shape', async () => {
    const result = await simulator.simulate(
      {
        action: 'shell.exec',
        target: '',
        command: 'ls -la',
        agent: 'test',
        destructive: false,
      },
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

  it('uses command from target if command field is empty', async () => {
    const result = await simulator.simulate(
      {
        action: 'shell.exec',
        target: 'rm -rf /tmp',
        agent: 'test',
        destructive: false,
      },
      {}
    );

    expect(result.riskLevel).toBe('high');
    expect(result.details.destructivePatternCount).toBeGreaterThan(0);
  });
});

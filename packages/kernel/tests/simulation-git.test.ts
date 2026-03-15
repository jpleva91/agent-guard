// Tests for Git Simulator
import { describe, it, expect } from 'vitest';
import { createGitSimulator, isValidBranchName } from '@red-codes/kernel';

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
      simulator.supports({
        action: 'git.force-push',
        target: 'main',
        agent: 'test',
        destructive: false,
      })
    ).toBe(true);
  });

  it('supports git.merge', () => {
    expect(
      simulator.supports({
        action: 'git.merge',
        target: 'feature',
        agent: 'test',
        destructive: false,
      })
    ).toBe(true);
  });

  it('supports git.branch.delete', () => {
    expect(
      simulator.supports({
        action: 'git.branch.delete',
        target: 'feature',
        agent: 'test',
        destructive: false,
      })
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

describe('isValidBranchName', () => {
  it('accepts valid branch names', () => {
    expect(isValidBranchName('main')).toBe(true);
    expect(isValidBranchName('feature/add-login')).toBe(true);
    expect(isValidBranchName('release-1.0.0')).toBe(true);
    expect(isValidBranchName('fix_bug_123')).toBe(true);
    expect(isValidBranchName('user/feature.branch')).toBe(true);
  });

  it('rejects empty or overly long names', () => {
    expect(isValidBranchName('')).toBe(false);
    expect(isValidBranchName('a'.repeat(256))).toBe(false);
  });

  it('rejects names with shell metacharacters', () => {
    expect(isValidBranchName('main; rm -rf /')).toBe(false);
    expect(isValidBranchName('main && echo pwned')).toBe(false);
    expect(isValidBranchName('main | cat /etc/passwd')).toBe(false);
    expect(isValidBranchName('$(whoami)')).toBe(false);
    expect(isValidBranchName('`whoami`')).toBe(false);
    expect(isValidBranchName("main'")).toBe(false);
    expect(isValidBranchName('main"')).toBe(false);
  });

  it('rejects directory traversal', () => {
    expect(isValidBranchName('../etc/passwd')).toBe(false);
    expect(isValidBranchName('feature/../main')).toBe(false);
  });

  it('rejects names starting with hyphen', () => {
    expect(isValidBranchName('-branch')).toBe(false);
    expect(isValidBranchName('--version')).toBe(false);
  });

  it('rejects names ending with .lock', () => {
    expect(isValidBranchName('branch.lock')).toBe(false);
  });
});

describe('GitSimulator input sanitization', () => {
  const simulator = createGitSimulator();

  it('rejects malicious branch name on push', async () => {
    const result = await simulator.simulate(
      {
        action: 'git.push',
        target: 'main; rm -rf /',
        branch: 'main; rm -rf /',
        agent: 'test',
        destructive: false,
      },
      {}
    );

    expect(result.riskLevel).toBe('high');
    expect(result.details.invalidBranch).toBe(true);
    expect(result.predictedChanges.some((c) => c.includes('Rejected invalid branch name'))).toBe(
      true
    );
  });

  it('rejects command substitution in branch name on merge', async () => {
    const result = await simulator.simulate(
      {
        action: 'git.merge',
        target: '$(whoami)',
        agent: 'test',
        destructive: false,
      },
      {}
    );

    expect(result.riskLevel).toBe('high');
    expect(result.details.invalidBranch).toBe(true);
  });

  it('rejects backtick injection in branch name', async () => {
    const result = await simulator.simulate(
      {
        action: 'git.push',
        branch: '`cat /etc/passwd`',
        target: '',
        agent: 'test',
        destructive: false,
      },
      {}
    );

    expect(result.riskLevel).toBe('high');
    expect(result.details.invalidBranch).toBe(true);
  });
});

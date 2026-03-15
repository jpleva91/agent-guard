// Tests for Filesystem Simulator
import { describe, it, expect } from 'vitest';
import { createFilesystemSimulator } from '@red-codes/kernel';

describe('FilesystemSimulator', () => {
  const simulator = createFilesystemSimulator();

  it('has correct id', () => {
    expect(simulator.id).toBe('filesystem-simulator');
  });

  it('supports file.write', () => {
    expect(
      simulator.supports({
        action: 'file.write',
        target: 'test.ts',
        agent: 'test',
        destructive: false,
      })
    ).toBe(true);
  });

  it('supports file.delete', () => {
    expect(
      simulator.supports({
        action: 'file.delete',
        target: 'test.ts',
        agent: 'test',
        destructive: false,
      })
    ).toBe(true);
  });

  it('does not support file.read', () => {
    expect(
      simulator.supports({
        action: 'file.read',
        target: 'test.ts',
        agent: 'test',
        destructive: false,
      })
    ).toBe(false);
  });

  it('does not support git actions', () => {
    expect(
      simulator.supports({ action: 'git.push', target: 'main', agent: 'test', destructive: false })
    ).toBe(false);
  });

  it('returns high risk for .env files', async () => {
    const result = await simulator.simulate(
      { action: 'file.write', target: '.env', agent: 'test', destructive: false },
      {}
    );

    expect(result.riskLevel).toBe('high');
    expect(result.predictedChanges.some((c) => c.includes('Sensitive'))).toBe(true);
    expect(result.simulatorId).toBe('filesystem-simulator');
  });

  it('returns high risk for credential files', async () => {
    const result = await simulator.simulate(
      {
        action: 'file.write',
        target: 'config/credentials.json',
        agent: 'test',
        destructive: false,
      },
      {}
    );

    expect(result.riskLevel).toBe('high');
  });

  it('returns high risk for .pem files', async () => {
    const result = await simulator.simulate(
      { action: 'file.write', target: 'ssl/server.pem', agent: 'test', destructive: false },
      {}
    );

    expect(result.riskLevel).toBe('high');
  });

  it('returns medium risk for lockfiles', async () => {
    const result = await simulator.simulate(
      { action: 'file.write', target: 'package-lock.json', agent: 'test', destructive: false },
      {}
    );

    expect(result.riskLevel).toBe('medium');
  });

  it('returns medium risk for CI config', async () => {
    const result = await simulator.simulate(
      {
        action: 'file.write',
        target: '.github/workflows/ci.yml',
        agent: 'test',
        destructive: false,
      },
      {}
    );

    expect(result.riskLevel).toBe('medium');
  });

  it('returns medium risk for project configs', async () => {
    const result = await simulator.simulate(
      { action: 'file.write', target: 'tsconfig.json', agent: 'test', destructive: false },
      {}
    );

    expect(result.riskLevel).toBe('medium');
  });

  it('returns low risk for regular source files', async () => {
    const result = await simulator.simulate(
      { action: 'file.write', target: 'src/utils/helper.ts', agent: 'test', destructive: false },
      {}
    );

    expect(result.riskLevel).toBe('low');
  });

  it('identifies delete operations', async () => {
    const result = await simulator.simulate(
      { action: 'file.delete', target: 'test.ts', agent: 'test', destructive: false },
      {}
    );

    expect(result.predictedChanges.some((c) => c.includes('Delete'))).toBe(true);
    expect(result.details.operation).toBe('delete');
  });

  it('uses filesAffected for blast radius', async () => {
    const result = await simulator.simulate(
      {
        action: 'file.write',
        target: 'test.ts',
        agent: 'test',
        destructive: false,
        filesAffected: 5,
      },
      {}
    );

    expect(result.blastRadius).toBe(5);
  });
});

describe('FilesystemSimulator edge cases', () => {
  const simulator = createFilesystemSimulator();

  it('handles empty target string', async () => {
    const result = await simulator.simulate(
      { action: 'file.write', target: '', agent: 'test', destructive: false },
      {}
    );
    expect(result.riskLevel).toBe('low');
    expect(result.simulatorId).toBe('filesystem-simulator');
  });

  it('handles deeply nested paths', async () => {
    const result = await simulator.simulate(
      { action: 'file.write', target: 'a/b/c/d/e/f/g/h.ts', agent: 'test', destructive: false },
      {}
    );
    expect(result.riskLevel).toBe('low');
    expect(result.predictedChanges.some((c) => c.includes('Write'))).toBe(true);
  });

  it('handles paths with .. components', async () => {
    const result = await simulator.simulate(
      { action: 'file.write', target: '../../../etc/passwd', agent: 'test', destructive: false },
      {}
    );
    expect(result.simulatorId).toBe('filesystem-simulator');
  });

  it('handles files with no extension', async () => {
    const result = await simulator.simulate(
      { action: 'file.write', target: 'Makefile', agent: 'test', destructive: false },
      {}
    );
    expect(result.riskLevel).toBe('low');
  });

  it('handles very long file paths', async () => {
    const longPath = 'src/' + 'a'.repeat(200) + '/file.ts';
    const result = await simulator.simulate(
      { action: 'file.write', target: longPath, agent: 'test', destructive: false },
      {}
    );
    expect(result.riskLevel).toBe('low');
  });

  it('detects sensitive files in nested paths', async () => {
    const result = await simulator.simulate(
      {
        action: 'file.write',
        target: 'deploy/config/.env.production',
        agent: 'test',
        destructive: false,
      },
      {}
    );
    expect(result.riskLevel).toBe('high');
  });

  it('defaults blast radius to 1 when filesAffected is not set', async () => {
    const result = await simulator.simulate(
      { action: 'file.write', target: 'test.ts', agent: 'test', destructive: false },
      {}
    );
    expect(result.blastRadius).toBe(1);
  });

  it('returns durationMs as a non-negative number', async () => {
    const result = await simulator.simulate(
      { action: 'file.write', target: 'test.ts', agent: 'test', destructive: false },
      {}
    );
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

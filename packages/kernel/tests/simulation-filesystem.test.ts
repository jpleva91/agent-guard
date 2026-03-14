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
      simulator.supports({ action: 'file.write', target: 'test.ts', agent: 'test', destructive: false })
    ).toBe(true);
  });

  it('supports file.delete', () => {
    expect(
      simulator.supports({ action: 'file.delete', target: 'test.ts', agent: 'test', destructive: false })
    ).toBe(true);
  });

  it('does not support file.read', () => {
    expect(
      simulator.supports({ action: 'file.read', target: 'test.ts', agent: 'test', destructive: false })
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
      { action: 'file.write', target: 'config/credentials.json', agent: 'test', destructive: false },
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
      { action: 'file.write', target: '.github/workflows/ci.yml', agent: 'test', destructive: false },
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
      { action: 'file.write', target: 'test.ts', agent: 'test', destructive: false, filesAffected: 5 },
      {}
    );

    expect(result.blastRadius).toBe(5);
  });
});

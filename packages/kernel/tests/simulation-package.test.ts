// Tests for Package Simulator
import { describe, it, expect } from 'vitest';
import {
  createPackageSimulator,
  parseNpmInstallArgs,
} from '@red-codes/kernel';

describe('PackageSimulator', () => {
  const simulator = createPackageSimulator();

  it('has correct id', () => {
    expect(simulator.id).toBe('package-simulator');
  });

  it('supports npm install commands', () => {
    expect(
      simulator.supports({
        action: 'shell.exec',
        target: '',
        agent: 'test',
        destructive: false,
        command: 'npm install lodash',
      })
    ).toBe(true);
  });

  it('supports npm i shorthand', () => {
    expect(
      simulator.supports({
        action: 'shell.exec',
        target: '',
        agent: 'test',
        destructive: false,
        command: 'npm i lodash',
      })
    ).toBe(true);
  });

  it('supports yarn add', () => {
    expect(
      simulator.supports({
        action: 'shell.exec',
        target: '',
        agent: 'test',
        destructive: false,
        command: 'yarn add lodash',
      })
    ).toBe(true);
  });

  it('supports pnpm add', () => {
    expect(
      simulator.supports({
        action: 'shell.exec',
        target: '',
        agent: 'test',
        destructive: false,
        command: 'pnpm add lodash',
      })
    ).toBe(true);
  });

  it('supports npm uninstall', () => {
    expect(
      simulator.supports({
        action: 'shell.exec',
        target: '',
        agent: 'test',
        destructive: false,
        command: 'npm uninstall lodash',
      })
    ).toBe(true);
  });

  it('does not support non-package shell commands', () => {
    expect(
      simulator.supports({
        action: 'shell.exec',
        target: '',
        agent: 'test',
        destructive: false,
        command: 'git push origin main',
      })
    ).toBe(false);
  });

  it('does not support file actions', () => {
    expect(
      simulator.supports({
        action: 'file.write',
        target: 'package.json',
        agent: 'test',
        destructive: false,
      })
    ).toBe(false);
  });

  it('detects global installs as medium+ risk', async () => {
    const result = await simulator.simulate(
      {
        action: 'shell.exec',
        target: '',
        agent: 'test',
        destructive: false,
        command: 'npm install -g typescript',
      },
      {}
    );

    expect(['medium', 'high']).toContain(result.riskLevel);
    expect(result.predictedChanges.some((c) => c.includes('Global'))).toBe(true);
    expect(result.details.globalInstall).toBe(true);
  });

  it('returns valid SimulationResult shape', async () => {
    const result = await simulator.simulate(
      {
        action: 'shell.exec',
        target: '',
        agent: 'test',
        destructive: false,
        command: 'yarn add react',
      },
      {}
    );

    expect(result).toHaveProperty('predictedChanges');
    expect(result).toHaveProperty('blastRadius');
    expect(result).toHaveProperty('riskLevel');
    expect(result).toHaveProperty('details');
    expect(result).toHaveProperty('simulatorId');
    expect(result).toHaveProperty('durationMs');
    expect(result.simulatorId).toBe('package-simulator');
  });
});

describe('parseNpmInstallArgs', () => {
  it('extracts package names from simple install', () => {
    expect(parseNpmInstallArgs('npm install lodash')).toEqual(['lodash']);
  });

  it('extracts scoped packages', () => {
    expect(parseNpmInstallArgs('npm install @types/node')).toEqual(['@types/node']);
  });

  it('extracts packages with version specifiers', () => {
    expect(parseNpmInstallArgs('npm install lodash@4.17.21')).toEqual(['lodash@4.17.21']);
  });

  it('preserves allowed flags', () => {
    const result = parseNpmInstallArgs('npm install --save-dev lodash');
    expect(result).toContain('--save-dev');
    expect(result).toContain('lodash');
  });

  it('strips shell metacharacters from command', () => {
    // Stops processing at first token containing shell metacharacter
    expect(parseNpmInstallArgs('npm install lodash; rm -rf /')).toEqual([]);
  });

  it('strips command substitution attempts', () => {
    expect(parseNpmInstallArgs('npm install $(whoami)')).toEqual([]);
  });

  it('strips pipe injection', () => {
    expect(parseNpmInstallArgs('npm install lodash | cat /etc/passwd')).toEqual(['lodash']);
  });

  it('strips backtick injection', () => {
    expect(parseNpmInstallArgs('npm install `malicious`')).toEqual([]);
  });

  it('strips unknown flags', () => {
    expect(parseNpmInstallArgs('npm install --unsafe-perm lodash')).toEqual(['lodash']);
  });

  it('handles npm i shorthand', () => {
    expect(parseNpmInstallArgs('npm i lodash')).toEqual(['lodash']);
  });

  it('handles bare npm install with no packages', () => {
    expect(parseNpmInstallArgs('npm install')).toEqual([]);
  });
});

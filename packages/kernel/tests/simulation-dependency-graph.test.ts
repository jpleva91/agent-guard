// Tests for Dependency Graph Simulator
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createDependencyGraphSimulator,
  findMonorepoRoot,
  buildWorkspaceGraph,
  findTransitiveDependents,
  analyzeDependencyGraph,
} from '@red-codes/kernel';
import type { WorkspaceNode } from '@red-codes/kernel';

describe('DependencyGraphSimulator', () => {
  const simulator = createDependencyGraphSimulator();

  it('has correct id', () => {
    expect(simulator.id).toBe('dependency-graph-simulator');
  });

  it('supports file.write to package.json', () => {
    expect(
      simulator.supports({
        action: 'file.write',
        target: '/project/packages/core/package.json',
        agent: 'test',
        destructive: false,
      })
    ).toBe(true);
  });

  it('supports file.write to root package.json', () => {
    expect(
      simulator.supports({
        action: 'file.write',
        target: '/project/package.json',
        agent: 'test',
        destructive: false,
      })
    ).toBe(true);
  });

  it('does not support file.write to non-package.json files', () => {
    expect(
      simulator.supports({
        action: 'file.write',
        target: '/project/src/index.ts',
        agent: 'test',
        destructive: false,
      })
    ).toBe(false);
  });

  it('does not support file.read actions', () => {
    expect(
      simulator.supports({
        action: 'file.read',
        target: '/project/package.json',
        agent: 'test',
        destructive: false,
      })
    ).toBe(false);
  });

  it('does not support shell.exec actions', () => {
    expect(
      simulator.supports({
        action: 'shell.exec',
        target: '',
        agent: 'test',
        destructive: false,
        command: 'npm install lodash',
      })
    ).toBe(false);
  });

  it('returns valid SimulationResult shape', async () => {
    const result = await simulator.simulate(
      {
        action: 'file.write',
        target: '/nonexistent/path/package.json',
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
    expect(result.simulatorId).toBe('dependency-graph-simulator');
  });

  it('returns low risk for non-monorepo package.json', async () => {
    const result = await simulator.simulate(
      {
        action: 'file.write',
        target: '/nonexistent/standalone/package.json',
        agent: 'test',
        destructive: false,
      },
      {}
    );

    expect(result.riskLevel).toBe('low');
    expect(result.blastRadius).toBeGreaterThanOrEqual(0);
  });

  it('includes write prediction in predictedChanges', async () => {
    const result = await simulator.simulate(
      {
        action: 'file.write',
        target: '/some/path/package.json',
        agent: 'test',
        destructive: false,
      },
      {}
    );

    expect(result.predictedChanges.some((c) => c.includes('Write:'))).toBe(true);
  });
});

describe('findTransitiveDependents', () => {
  const graph: WorkspaceNode[] = [
    { name: '@org/core', dir: 'packages/core', workspaceDeps: [] },
    { name: '@org/events', dir: 'packages/events', workspaceDeps: ['@org/core'] },
    { name: '@org/kernel', dir: 'packages/kernel', workspaceDeps: ['@org/core', '@org/events'] },
    { name: '@org/cli', dir: 'apps/cli', workspaceDeps: ['@org/kernel', '@org/events'] },
    { name: '@org/utils', dir: 'packages/utils', workspaceDeps: [] },
  ];

  it('finds direct dependents', () => {
    const { direct } = findTransitiveDependents(graph, '@org/core');
    expect(direct).toContain('@org/events');
    expect(direct).toContain('@org/kernel');
    expect(direct).not.toContain('@org/cli');
  });

  it('finds transitive dependents', () => {
    const { transitive } = findTransitiveDependents(graph, '@org/core');
    // @org/core -> @org/events -> @org/cli
    // @org/core -> @org/kernel -> @org/cli
    expect(transitive).toContain('@org/events');
    expect(transitive).toContain('@org/kernel');
    expect(transitive).toContain('@org/cli');
  });

  it('returns empty for package with no dependents', () => {
    const { direct, transitive } = findTransitiveDependents(graph, '@org/utils');
    expect(direct).toHaveLength(0);
    expect(transitive).toHaveLength(0);
  });

  it('returns empty for leaf package', () => {
    const { direct, transitive } = findTransitiveDependents(graph, '@org/cli');
    expect(direct).toHaveLength(0);
    expect(transitive).toHaveLength(0);
  });

  it('returns empty for unknown package', () => {
    const { direct, transitive } = findTransitiveDependents(graph, '@org/unknown');
    expect(direct).toHaveLength(0);
    expect(transitive).toHaveLength(0);
  });

  it('handles circular dependencies without infinite loop', () => {
    const circularGraph: WorkspaceNode[] = [
      { name: 'a', dir: 'a', workspaceDeps: ['b'] },
      { name: 'b', dir: 'b', workspaceDeps: ['a'] },
    ];
    const { transitive } = findTransitiveDependents(circularGraph, 'a');
    expect(transitive).toContain('b');
    // Should not hang or throw
  });

  it('finds all dependents in a deep chain', () => {
    const chainGraph: WorkspaceNode[] = [
      { name: 'a', dir: 'a', workspaceDeps: [] },
      { name: 'b', dir: 'b', workspaceDeps: ['a'] },
      { name: 'c', dir: 'c', workspaceDeps: ['b'] },
      { name: 'd', dir: 'd', workspaceDeps: ['c'] },
    ];
    const { transitive } = findTransitiveDependents(chainGraph, 'a');
    expect(transitive).toEqual(expect.arrayContaining(['b', 'c', 'd']));
    expect(transitive).toHaveLength(3);
  });
});

describe('buildWorkspaceGraph', () => {
  it('returns empty array for non-existent root', () => {
    const graph = buildWorkspaceGraph('/nonexistent/root');
    expect(graph).toEqual([]);
  });
});

describe('analyzeDependencyGraph', () => {
  it('returns basic analysis for non-monorepo target', () => {
    const result = analyzeDependencyGraph('/nonexistent/package.json', null);
    expect(result).not.toBeNull();
    expect(result!.targetPackage).toBeTruthy();
    expect(result!.directDependents).toEqual([]);
    expect(result!.transitiveDependents).toEqual([]);
    expect(result!.isRoot).toBe(true);
  });
});

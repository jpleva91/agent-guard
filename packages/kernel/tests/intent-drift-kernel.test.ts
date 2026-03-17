import { describe, it, expect } from 'vitest';
import { createKernel } from '@red-codes/kernel';
import type { IntentSpec } from '@red-codes/kernel';
import type { DomainEvent } from '@red-codes/core';

// Use defaultDeny: false so actions reach the allowed path where intent checking runs.
// Intent drift is advisory and only applies to actions that pass governance evaluation.
const FAIL_OPEN = { evaluateOptions: { defaultDeny: false } };

describe('kernel intent drift integration', () => {
  it('emits IntentDriftDetected events when action drifts from intent spec', async () => {
    const events: DomainEvent[] = [];
    const spec: IntentSpec = {
      allowedActions: ['file.read'],
      allowedPaths: ['src/**'],
      description: 'Read-only task in src/',
    };

    const kernel = createKernel({
      dryRun: true,
      intentSpec: spec,
      sinks: [{ write: (e: DomainEvent) => events.push(e) }],
      ...FAIL_OPEN,
    });

    await kernel.propose({
      tool: 'Write',
      file: 'packages/kernel/src/kernel.ts',
      agent: 'test-agent',
    });

    const driftEvents = events.filter(
      (e) => (e as Record<string, unknown>).kind === 'IntentDriftDetected'
    );
    expect(driftEvents.length).toBeGreaterThanOrEqual(1);

    const driftData = driftEvents.map((e) => (e as Record<string, unknown>).driftType);
    // file.write is not in allowedActions, and target is outside src/**
    expect(driftData).toContain('action-not-allowed');
    expect(driftData).toContain('path-outside-scope');
  });

  it('does not emit drift events when action aligns with intent', async () => {
    const events: DomainEvent[] = [];
    const spec: IntentSpec = {
      allowedActions: ['file.read', 'file.write'],
      allowedPaths: ['src/**'],
    };

    const kernel = createKernel({
      dryRun: true,
      intentSpec: spec,
      sinks: [{ write: (e: DomainEvent) => events.push(e) }],
      ...FAIL_OPEN,
    });

    await kernel.propose({
      tool: 'Read',
      file: 'src/index.ts',
      agent: 'test-agent',
    });

    const driftEvents = events.filter(
      (e) => (e as Record<string, unknown>).kind === 'IntentDriftDetected'
    );
    expect(driftEvents).toHaveLength(0);
  });

  it('includes intentDrift in KernelResult when IntentSpec is configured', async () => {
    const spec: IntentSpec = {
      allowedActions: ['file.read'],
    };

    const kernel = createKernel({
      dryRun: true,
      intentSpec: spec,
      ...FAIL_OPEN,
    });

    const result = await kernel.propose({
      tool: 'Write',
      file: 'src/foo.ts',
      agent: 'test-agent',
    });

    // The kernel should still allow (advisory mode) but include drift info
    expect(result.intentDrift).toBeDefined();
    expect(result.intentDrift?.aligned).toBe(false);
    expect(result.intentDrift?.drifts.length).toBeGreaterThanOrEqual(1);
  });

  it('does not include intentDrift when no IntentSpec is configured', async () => {
    const kernel = createKernel({ dryRun: true, ...FAIL_OPEN });

    const result = await kernel.propose({
      tool: 'Write',
      file: 'src/foo.ts',
      agent: 'test-agent',
    });

    expect(result.intentDrift).toBeUndefined();
  });

  it('tracks file modifications for scope limit checking', async () => {
    const events: DomainEvent[] = [];
    const spec: IntentSpec = {
      maxFilesModified: 2,
    };

    const kernel = createKernel({
      dryRun: true,
      intentSpec: spec,
      sinks: [{ write: (e: DomainEvent) => events.push(e) }],
      ...FAIL_OPEN,
    });

    // First two writes are within limit
    await kernel.propose({ tool: 'Write', file: 'a.ts', agent: 'test' });
    await kernel.propose({ tool: 'Write', file: 'b.ts', agent: 'test' });

    // Third write exceeds limit
    const result = await kernel.propose({ tool: 'Write', file: 'c.ts', agent: 'test' });

    const driftEvents = events.filter(
      (e) => (e as Record<string, unknown>).kind === 'IntentDriftDetected'
    );
    const scopeDrifts = driftEvents.filter(
      (e) => (e as Record<string, unknown>).driftType === 'scope-limit-exceeded'
    );
    expect(scopeDrifts.length).toBeGreaterThanOrEqual(1);
    expect(result.intentDrift?.aligned).toBe(false);
  });
});

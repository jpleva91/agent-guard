// Tests for PAUSE and ROLLBACK intervention types in the Governed Action Kernel
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createKernel } from '@red-codes/kernel';
import type { PauseHandler, SnapshotProvider } from '@red-codes/kernel';
import { INTERVENTION } from '@red-codes/kernel';
import { resetActionCounter } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';
import type { DomainEvent } from '@red-codes/core';

beforeEach(() => {
  resetActionCounter();
  resetEventCounter();
});

// Helper: create a policy that denies git.push with a specific intervention
function pushDenyPolicy(intervention?: 'pause' | 'rollback' | 'deny', severity = 4) {
  return {
    id: 'test-policy',
    name: 'Test Policy',
    rules: [
      {
        action: 'git.push',
        effect: 'deny' as const,
        reason: 'Push requires review',
        intervention,
      },
    ],
    severity,
  };
}

// Helper: create a policy that denies file.write with a specific intervention
function writePolicy(intervention?: 'pause' | 'rollback' | 'deny', severity = 3) {
  return {
    id: 'write-policy',
    name: 'Write Policy',
    rules: [
      {
        action: 'file.write',
        effect: 'deny' as const,
        reason: 'Write requires rollback safety',
        intervention,
      },
    ],
    severity,
  };
}

describe('PAUSE Intervention', () => {
  it('auto-denies when no pause handler is provided', async () => {
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [pushDenyPolicy('pause')],
    });

    const result = await kernel.propose({
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'test-agent',
    });

    expect(result.allowed).toBe(false);
    expect(result.paused).toBe(true);
    expect(result.intervention).toBe(INTERVENTION.PAUSE);
  });

  it('allows action when pause handler approves', async () => {
    const handler: PauseHandler = vi.fn().mockResolvedValue({
      approved: true,
      reason: 'Reviewed and approved',
    });

    const kernel = createKernel({
      dryRun: true,
      policyDefs: [pushDenyPolicy('pause')],
      pauseHandler: handler,
    });

    const result = await kernel.propose({
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'test-agent',
    });

    expect(result.allowed).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Push requires review',
        runId: expect.stringMatching(/^run_/),
      })
    );
  });

  it('denies action when pause handler rejects', async () => {
    const handler: PauseHandler = vi.fn().mockResolvedValue({
      approved: false,
      reason: 'Rejected by reviewer',
    });

    const kernel = createKernel({
      dryRun: true,
      policyDefs: [pushDenyPolicy('pause')],
      pauseHandler: handler,
    });

    const result = await kernel.propose({
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'test-agent',
    });

    expect(result.allowed).toBe(false);
    expect(result.paused).toBe(true);
    expect(result.intervention).toBe(INTERVENTION.PAUSE);
  });

  it('auto-denies when pause handler times out', async () => {
    const handler: PauseHandler = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ approved: true }), 5000))
      );

    const kernel = createKernel({
      dryRun: true,
      policyDefs: [pushDenyPolicy('pause')],
      pauseHandler: handler,
      pauseTimeoutMs: 50, // very short timeout
    });

    const result = await kernel.propose({
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'test-agent',
    });

    expect(result.allowed).toBe(false);
    expect(result.paused).toBe(true);
  });

  it('auto-denies when pause handler throws', async () => {
    const handler: PauseHandler = vi.fn().mockRejectedValue(new Error('handler crashed'));

    const kernel = createKernel({
      dryRun: true,
      policyDefs: [pushDenyPolicy('pause')],
      pauseHandler: handler,
    });

    const result = await kernel.propose({
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'test-agent',
    });

    expect(result.allowed).toBe(false);
    expect(result.paused).toBe(true);
  });

  it('emits ActionEscalated event for PAUSE', async () => {
    const events: DomainEvent[] = [];
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [pushDenyPolicy('pause')],
      sinks: [{ write: (e: DomainEvent) => events.push(e) }],
    });

    await kernel.propose({
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'test-agent',
    });

    const escalated = events.find((e) => e.kind === 'ActionEscalated');
    expect(escalated).toBeDefined();
    expect(escalated!.reason as string).toContain('PAUSE intervention');
  });

  it('selects PAUSE via severity when no explicit intervention', async () => {
    // Severity 4 → PAUSE by default (no intervention field on rule)
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [pushDenyPolicy(undefined, 4)],
    });

    const result = await kernel.propose({
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'test-agent',
    });

    expect(result.intervention).toBe(INTERVENTION.PAUSE);
    expect(result.paused).toBe(true);
  });
});

describe('ROLLBACK Intervention', () => {
  it('executes and returns result with rollback flag when no snapshot provider', async () => {
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [writePolicy('rollback')],
    });

    const result = await kernel.propose({
      tool: 'Write',
      file: 'src/index.ts',
      content: 'new content',
      agent: 'test-agent',
    });

    // In dry-run, no execution but ROLLBACK path should be taken
    expect(result.intervention).toBe(INTERVENTION.ROLLBACK);
    expect(result.allowed).toBe(true);
  });

  it('captures snapshot before execution and restores on failure', async () => {
    const snapshotProvider: SnapshotProvider = {
      capture: vi.fn().mockResolvedValue({ snapshotId: 'snap-001' }),
      restore: vi.fn().mockResolvedValue({ success: true }),
    };

    // Need a real adapter that fails
    const kernel = createKernel({
      dryRun: false,
      policyDefs: [writePolicy('rollback')],
      snapshotProvider,
      adapters: {
        has: () => true,
        execute: vi.fn().mockResolvedValue({ success: false, error: 'Write failed' }),
        register: vi.fn(),
      },
    });

    const result = await kernel.propose({
      tool: 'Write',
      file: 'src/index.ts',
      content: 'new content',
      agent: 'test-agent',
    });

    expect(snapshotProvider.capture).toHaveBeenCalledOnce();
    expect(snapshotProvider.restore).toHaveBeenCalledWith('snap-001');
    expect(result.rolledBack).toBe(true);
    expect(result.intervention).toBe(INTERVENTION.ROLLBACK);
  });

  it('does not rollback on successful execution', async () => {
    const snapshotProvider: SnapshotProvider = {
      capture: vi.fn().mockResolvedValue({ snapshotId: 'snap-002' }),
      restore: vi.fn().mockResolvedValue({ success: true }),
    };

    const kernel = createKernel({
      dryRun: false,
      policyDefs: [writePolicy('rollback')],
      snapshotProvider,
      adapters: {
        has: () => true,
        execute: vi.fn().mockResolvedValue({ success: true }),
        register: vi.fn(),
      },
    });

    const result = await kernel.propose({
      tool: 'Write',
      file: 'src/index.ts',
      content: 'new content',
      agent: 'test-agent',
    });

    expect(snapshotProvider.capture).toHaveBeenCalledOnce();
    expect(snapshotProvider.restore).not.toHaveBeenCalled();
    expect(result.rolledBack).toBe(false);
    expect(result.executed).toBe(true);
  });

  it('emits ActionEscalated event for ROLLBACK', async () => {
    const events: DomainEvent[] = [];
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [writePolicy('rollback')],
      sinks: [{ write: (e: DomainEvent) => events.push(e) }],
    });

    await kernel.propose({
      tool: 'Write',
      file: 'src/index.ts',
      content: 'new content',
      agent: 'test-agent',
    });

    const escalated = events.find((e) => e.kind === 'ActionEscalated');
    expect(escalated).toBeDefined();
    expect(escalated!.reason as string).toContain('ROLLBACK intervention');
  });

  it('selects ROLLBACK via severity when no explicit intervention', async () => {
    // Severity 3 → ROLLBACK by default
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [writePolicy(undefined, 3)],
    });

    const result = await kernel.propose({
      tool: 'Write',
      file: 'src/index.ts',
      content: 'new content',
      agent: 'test-agent',
    });

    expect(result.intervention).toBe(INTERVENTION.ROLLBACK);
  });

  it('handles snapshot capture failure gracefully', async () => {
    const snapshotProvider: SnapshotProvider = {
      capture: vi.fn().mockRejectedValue(new Error('disk full')),
      restore: vi.fn(),
    };

    const kernel = createKernel({
      dryRun: false,
      policyDefs: [writePolicy('rollback')],
      snapshotProvider,
      adapters: {
        has: () => true,
        execute: vi.fn().mockResolvedValue({ success: true }),
        register: vi.fn(),
      },
    });

    const result = await kernel.propose({
      tool: 'Write',
      file: 'src/index.ts',
      content: 'new content',
      agent: 'test-agent',
    });

    // Should still execute despite snapshot failure
    expect(result.executed).toBe(true);
    expect(result.rolledBack).toBe(false);
  });

  it('handles adapter exception with rollback', async () => {
    const snapshotProvider: SnapshotProvider = {
      capture: vi.fn().mockResolvedValue({ snapshotId: 'snap-003' }),
      restore: vi.fn().mockResolvedValue({ success: true }),
    };

    const kernel = createKernel({
      dryRun: false,
      policyDefs: [writePolicy('rollback')],
      snapshotProvider,
      adapters: {
        has: () => true,
        execute: vi.fn().mockRejectedValue(new Error('adapter crash')),
        register: vi.fn(),
      },
    });

    const result = await kernel.propose({
      tool: 'Write',
      file: 'src/index.ts',
      content: 'new content',
      agent: 'test-agent',
    });

    expect(snapshotProvider.restore).toHaveBeenCalledWith('snap-003');
    expect(result.rolledBack).toBe(true);
  });
});

describe('Policy intervention override', () => {
  it('policy intervention=pause overrides severity-based selection', async () => {
    // Severity 5 would normally → DENY, but policy says pause
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [pushDenyPolicy('pause', 5)],
    });

    const result = await kernel.propose({
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'test-agent',
    });

    expect(result.intervention).toBe(INTERVENTION.PAUSE);
    expect(result.paused).toBe(true);
  });

  it('policy intervention=rollback overrides severity-based selection', async () => {
    // Severity 5 would normally → DENY, but policy says rollback
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [writePolicy('rollback', 5)],
    });

    const result = await kernel.propose({
      tool: 'Write',
      file: 'src/index.ts',
      content: 'new content',
      agent: 'test-agent',
    });

    expect(result.intervention).toBe(INTERVENTION.ROLLBACK);
  });

  it('policy intervention=deny is respected', async () => {
    // Severity 3 would normally → ROLLBACK, but policy says deny
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [pushDenyPolicy('deny', 3)],
    });

    const result = await kernel.propose({
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'test-agent',
    });

    expect(result.intervention).toBe(INTERVENTION.DENY);
    expect(result.allowed).toBe(false);
    expect(result.paused).toBeUndefined();
  });
});

describe('Intervention decision records', () => {
  it('PAUSE denial creates a decision record with intervention', async () => {
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [pushDenyPolicy('pause')],
    });

    const result = await kernel.propose({
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'test-agent',
    });

    expect(result.decisionRecord).toBeDefined();
    expect(result.decisionRecord!.intervention).toBe(INTERVENTION.PAUSE);
  });

  it('ROLLBACK creates a decision record with intervention', async () => {
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [writePolicy('rollback')],
    });

    const result = await kernel.propose({
      tool: 'Write',
      file: 'src/index.ts',
      content: 'new content',
      agent: 'test-agent',
    });

    expect(result.decisionRecord).toBeDefined();
    expect(result.decisionRecord!.intervention).toBe(INTERVENTION.ROLLBACK);
  });
});

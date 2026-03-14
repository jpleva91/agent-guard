// Tests for the Governed Action Kernel
import { describe, it, expect, beforeEach } from 'vitest';
import { createKernel } from '@red-codes/kernel';
import type { KernelConfig, EventSink } from '@red-codes/kernel';
import { createDryRunRegistry } from '@red-codes/core';
import { resetActionCounter } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';
import type { DomainEvent } from '@red-codes/core';
import { createSeededRng } from '@red-codes/core';

beforeEach(() => {
  resetActionCounter();
  resetEventCounter();
});

describe('Kernel', () => {
  it('creates with a run ID', () => {
    const kernel = createKernel();
    expect(kernel.getRunId()).toMatch(/^run_/);
  });

  it('uses custom run ID', () => {
    const kernel = createKernel({ runId: 'test-run-123' });
    expect(kernel.getRunId()).toBe('test-run-123');
  });

  it('allows benign file read', async () => {
    const kernel = createKernel({ dryRun: true });
    const result = await kernel.propose({
      tool: 'Read',
      file: 'src/index.ts',
      agent: 'test-agent',
    });

    expect(result.allowed).toBe(true);
    expect(result.runId).toMatch(/^run_/);
    expect(result.decision.intent.action).toBe('file.read');
    expect(result.events.length).toBeGreaterThan(0);
  });

  it('denies destructive shell command', async () => {
    const kernel = createKernel({ dryRun: true });
    const result = await kernel.propose({
      tool: 'Bash',
      command: 'rm -rf /',
      agent: 'test-agent',
    });

    expect(result.allowed).toBe(false);
    expect(result.executed).toBe(false);
    expect(result.decision.intent.destructive).toBe(true);
  });

  it('denies actions matching deny policy', async () => {
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [
        {
          id: 'protect-main',
          name: 'Protect Main Branch',
          rules: [{ action: 'git.push', effect: 'deny', reason: 'Protected branch' }],
          severity: 4,
        },
      ],
    });

    const result = await kernel.propose({
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'test-agent',
    });

    expect(result.allowed).toBe(false);
    expect(result.decision.decision.reason).toContain('Protected branch');
  });

  it('executes allowed actions via adapters', async () => {
    const { registry, dryRun } = createDryRunRegistry();
    const kernel = createKernel({ adapters: registry });

    const result = await kernel.propose({
      tool: 'Read',
      file: 'test.txt',
      agent: 'test-agent',
    });

    expect(result.allowed).toBe(true);
    expect(result.executed).toBe(true);
    expect(dryRun.getLog().length).toBe(1);
    expect(dryRun.getLog()[0].type).toBe('file.read');
  });

  it('tracks action log', async () => {
    const kernel = createKernel({ dryRun: true });

    await kernel.propose({ tool: 'Read', file: 'a.ts', agent: 'test' });
    await kernel.propose({ tool: 'Write', file: 'b.ts', agent: 'test' });
    await kernel.propose({ tool: 'Bash', command: 'npm test', agent: 'test' });

    expect(kernel.getActionLog().length).toBe(3);
  });

  it('emits ACTION_REQUESTED event', async () => {
    const kernel = createKernel({ dryRun: true });
    const result = await kernel.propose({
      tool: 'Read',
      file: 'test.ts',
      agent: 'test',
    });

    const requestedEvents = result.events.filter((e) => e.kind === 'ActionRequested');
    expect(requestedEvents.length).toBe(1);
  });

  it('emits ACTION_ALLOWED event for allowed actions', async () => {
    const kernel = createKernel({ dryRun: true });
    const result = await kernel.propose({
      tool: 'Read',
      file: 'test.ts',
      agent: 'test',
    });

    const allowedEvents = result.events.filter((e) => e.kind === 'ActionAllowed');
    expect(allowedEvents.length).toBe(1);
  });

  it('emits ACTION_DENIED event for denied actions', async () => {
    const kernel = createKernel({ dryRun: true });
    const result = await kernel.propose({
      tool: 'Bash',
      command: 'rm -rf /',
      agent: 'test',
    });

    const deniedEvents = result.events.filter((e) => e.kind === 'ActionDenied');
    expect(deniedEvents.length).toBe(1);
  });

  it('sinks events to configured sinks', async () => {
    const sunkEvents: DomainEvent[] = [];
    const testSink: EventSink = {
      write(event) {
        sunkEvents.push(event);
      },
    };

    const kernel = createKernel({ dryRun: true, sinks: [testSink] });
    await kernel.propose({ tool: 'Read', file: 'test.ts', agent: 'test' });

    expect(sunkEvents.length).toBeGreaterThan(0);
  });

  it('shutdown flushes sinks', () => {
    let flushed = false;
    const testSink: EventSink = {
      write() {},
      flush() {
        flushed = true;
      },
    };

    const kernel = createKernel({ dryRun: true, sinks: [testSink] });
    kernel.shutdown();
    expect(flushed).toBe(true);
  });

  it('tracks event count', async () => {
    const kernel = createKernel({ dryRun: true });
    expect(kernel.getEventCount()).toBe(0);

    await kernel.propose({ tool: 'Read', file: 'test.ts', agent: 'test' });
    expect(kernel.getEventCount()).toBeGreaterThan(0);
  });
});

describe('Kernel with seeded RNG', () => {
  it('exposes the seed via getSeed()', () => {
    const rng = createSeededRng(42);
    const kernel = createKernel({ dryRun: true, rng });
    expect(kernel.getSeed()).toBe(42);
  });

  it('produces deterministic run IDs from the same seed', () => {
    // Two kernels with the same seed (and no explicit runId) should get the same run ID
    // since generateRunId uses the seeded RNG
    const rng1 = createSeededRng(12345);
    const rng2 = createSeededRng(12345);
    const kernel1 = createKernel({ dryRun: true, rng: rng1 });
    const kernel2 = createKernel({ dryRun: true, rng: rng2 });

    // Run IDs include Date.now() so they may differ by timestamp,
    // but the hash suffix should be identical
    const suffix1 = kernel1.getRunId().split('_').slice(2).join('_');
    const suffix2 = kernel2.getRunId().split('_').slice(2).join('_');
    expect(suffix1).toBe(suffix2);
  });

  it('generates different run IDs for different seeds', () => {
    const kernel1 = createKernel({ dryRun: true, rng: createSeededRng(1) });
    const kernel2 = createKernel({ dryRun: true, rng: createSeededRng(2) });

    const suffix1 = kernel1.getRunId().split('_').slice(2).join('_');
    const suffix2 = kernel2.getRunId().split('_').slice(2).join('_');
    expect(suffix1).not.toBe(suffix2);
  });
});

describe('Kernel denies actions with no registered adapter', () => {
  it('denies when no adapter is registered for the action class', async () => {
    // Use an empty adapter registry (no adapters registered at all)
    const { createAdapterRegistry } = await import('@red-codes/core');
    const emptyRegistry = createAdapterRegistry();

    const sunkEvents: DomainEvent[] = [];
    const testSink: EventSink = {
      write(event) {
        sunkEvents.push(event);
      },
    };

    const kernel = createKernel({
      adapters: emptyRegistry,
      sinks: [testSink],
    });

    // file.read is allowed by default policy, but 'file' class has no adapter
    const result = await kernel.propose({
      tool: 'Read',
      file: 'src/index.ts',
      agent: 'test-agent',
    });

    expect(result.allowed).toBe(false);
    expect(result.executed).toBe(false);
    expect(result.action).not.toBeNull();

    // Should have an ActionDenied event with no_registered_adapter reason
    const deniedEvents = result.events.filter((e) => e.kind === 'ActionDenied');
    expect(deniedEvents.length).toBe(1);
    expect((deniedEvents[0] as Record<string, unknown>).reason).toContain('no_registered_adapter');
  });

  it('sinks denial events to configured sinks', async () => {
    const { createAdapterRegistry } = await import('@red-codes/core');
    const emptyRegistry = createAdapterRegistry();

    const sunkEvents: DomainEvent[] = [];
    const testSink: EventSink = {
      write(event) {
        sunkEvents.push(event);
      },
    };

    const kernel = createKernel({
      adapters: emptyRegistry,
      sinks: [testSink],
    });

    await kernel.propose({
      tool: 'Read',
      file: 'src/index.ts',
      agent: 'test-agent',
    });

    // Should have sunk ActionDenied and DecisionRecorded events
    const deniedSunk = sunkEvents.filter((e) => e.kind === 'ActionDenied');
    const decisionSunk = sunkEvents.filter((e) => e.kind === 'DecisionRecorded');
    expect(deniedSunk.length).toBe(1);
    expect(decisionSunk.length).toBe(1);
    expect((decisionSunk[0] as Record<string, unknown>).outcome).toBe('deny');
    expect((decisionSunk[0] as Record<string, unknown>).reason).toBe('no_registered_adapter');
  });

  it('includes decision record in kernel result', async () => {
    const { createAdapterRegistry } = await import('@red-codes/core');
    const emptyRegistry = createAdapterRegistry();

    const kernel = createKernel({ adapters: emptyRegistry });

    const result = await kernel.propose({
      tool: 'Write',
      file: 'test.txt',
      agent: 'test-agent',
    });

    expect(result.allowed).toBe(false);
    expect(result.decisionRecord).toBeDefined();
    expect(result.decisionRecord?.outcome).toBe('deny');
  });

  it('records no-adapter denial in action log', async () => {
    const { createAdapterRegistry } = await import('@red-codes/core');
    const emptyRegistry = createAdapterRegistry();

    const kernel = createKernel({ adapters: emptyRegistry });

    await kernel.propose({
      tool: 'Read',
      file: 'a.ts',
      agent: 'test',
    });
    await kernel.propose({
      tool: 'Write',
      file: 'b.ts',
      agent: 'test',
    });

    const log = kernel.getActionLog();
    expect(log.length).toBe(2);
    expect(log[0].allowed).toBe(false);
    expect(log[1].allowed).toBe(false);
  });
});

describe('Kernel with policies', () => {
  const strictPolicy: KernelConfig = {
    dryRun: true,
    policyDefs: [
      {
        id: 'no-push',
        name: 'No Push',
        rules: [
          { action: 'git.push', effect: 'deny', reason: 'Pushing not allowed' },
          { action: 'git.force-push', effect: 'deny', reason: 'Force push not allowed' },
        ],
        severity: 4,
      },
      {
        id: 'safe-shell',
        name: 'Safe Shell',
        rules: [
          {
            action: 'shell.exec',
            effect: 'deny',
            conditions: { scope: ['*.env'] },
            reason: 'No env file access',
          },
        ],
        severity: 3,
      },
    ],
  };

  it('allows file reads under strict policy', async () => {
    const kernel = createKernel(strictPolicy);
    const result = await kernel.propose({
      tool: 'Read',
      file: 'src/index.ts',
      agent: 'test',
    });
    expect(result.allowed).toBe(true);
  });

  it('denies git push under strict policy', async () => {
    const kernel = createKernel(strictPolicy);
    const result = await kernel.propose({
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'test',
    });
    expect(result.allowed).toBe(false);
  });

  it('denies git force push under strict policy', async () => {
    const kernel = createKernel(strictPolicy);
    const result = await kernel.propose({
      tool: 'Bash',
      command: 'git push --force origin main',
      agent: 'test',
    });
    expect(result.allowed).toBe(false);
  });

  it('includes evidence pack on denial', async () => {
    const kernel = createKernel(strictPolicy);
    const result = await kernel.propose({
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'test',
    });
    expect(result.decision.evidencePack).not.toBeNull();
  });
});

describe('Kernel proposal timeout', () => {
  it('rejects when proposal exceeds timeout', async () => {
    // Create a slow adapter that takes longer than the timeout
    const { createAdapterRegistry } = await import('@red-codes/core');
    const slowRegistry = createAdapterRegistry();
    slowRegistry.register('file', async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    const kernel = createKernel({
      adapters: slowRegistry,
      proposalTimeoutMs: 50,
    });

    await expect(
      kernel.propose({ tool: 'Read', file: 'test.ts', agent: 'test' })
    ).rejects.toThrow('timed out');
  });

  it('does not timeout when proposal completes quickly', async () => {
    const kernel = createKernel({
      dryRun: true,
      proposalTimeoutMs: 5000,
    });

    const result = await kernel.propose({
      tool: 'Read',
      file: 'test.ts',
      agent: 'test',
    });
    expect(result.allowed).toBe(true);
  });
});

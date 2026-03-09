// Tests for the Governed Action Kernel
import { describe, it, expect, beforeEach } from 'vitest';
import { createKernel } from '../../src/kernel/kernel.js';
import type { KernelConfig, EventSink } from '../../src/kernel/kernel.js';
import { createDryRunRegistry } from '../../src/core/adapters.js';
import { resetActionCounter } from '../../src/core/actions.js';
import { resetEventCounter } from '../../src/events/schema.js';
import type { DomainEvent } from '../../src/core/types.js';

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
          rules: [
            { action: 'git.push', effect: 'deny', reason: 'Protected branch' },
          ],
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

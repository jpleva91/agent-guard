// Integration test — end-to-end kernel pipeline with policies, invariants, events, and escalation
import { describe, it, expect, beforeEach } from 'vitest';
import { createKernel } from '@red-codes/kernel';
import type { KernelConfig, KernelResult, EventSink } from '@red-codes/kernel';
import type { DomainEvent } from '@red-codes/core';
import type { GovernanceDecisionRecord, DecisionSink } from '@red-codes/core';
import { resetActionCounter } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';

beforeEach(() => {
  resetActionCounter();
  resetEventCounter();
});

// ---------------------------------------------------------------------------
// Full pipeline: policy + events + decisions
// ---------------------------------------------------------------------------

describe('Kernel integration — full pipeline', () => {
  it('processes multiple actions and tracks full event lifecycle', async () => {
    const collectedEvents: DomainEvent[] = [];
    const eventSink: EventSink = { write: (e) => collectedEvents.push(e) };

    const kernel = createKernel({
      dryRun: true,
      sinks: [eventSink],
      policyDefs: [
        {
          id: 'protect-main',
          name: 'Protect Main',
          rules: [{ action: 'git.push', effect: 'deny', reason: 'No pushing' }],
          severity: 4,
        },
      ],
    });

    // Action 1: allowed file read
    const r1 = await kernel.propose({ tool: 'Read', file: 'src/app.ts', agent: 'ci-agent' });
    expect(r1.allowed).toBe(true);

    // Action 2: allowed shell command
    const r2 = await kernel.propose({ tool: 'Bash', command: 'npm test', agent: 'ci-agent' });
    expect(r2.allowed).toBe(true);

    // Action 3: denied git push
    const r3 = await kernel.propose({
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'ci-agent',
    });
    expect(r3.allowed).toBe(false);
    expect(r3.decision.decision.reason).toContain('No pushing');

    // Verify event lifecycle
    expect(kernel.getActionLog()).toHaveLength(3);
    expect(kernel.getEventCount()).toBeGreaterThan(0);

    // All events should have been sunk
    expect(collectedEvents.length).toBe(kernel.getEventCount());

    // Should have ActionRequested events for each action
    const requested = collectedEvents.filter((e) => e.kind === 'ActionRequested');
    expect(requested.length).toBe(3);

    // Should have ActionAllowed for allowed actions
    const allowed = collectedEvents.filter((e) => e.kind === 'ActionAllowed');
    expect(allowed.length).toBe(2);

    // Should have ActionDenied for denied action
    const denied = collectedEvents.filter((e) => e.kind === 'ActionDenied');
    expect(denied.length).toBe(1);
  });

  it('generates decision records and sinks them', async () => {
    const records: GovernanceDecisionRecord[] = [];
    const decisionSink: DecisionSink = { write: (r) => records.push(r) };

    const kernel = createKernel({
      dryRun: true,
      decisionSinks: [decisionSink],
    });

    await kernel.propose({ tool: 'Read', file: 'a.ts', agent: 'test' });
    await kernel.propose({ tool: 'Bash', command: 'rm -rf /', agent: 'test' });

    expect(records).toHaveLength(2);
    expect(records[0].outcome).toBe('allow');
    expect(records[1].outcome).toBe('deny');
    expect(records[0].runId).toBe(kernel.getRunId());
    expect(records[1].runId).toBe(kernel.getRunId());
  });
});

// ---------------------------------------------------------------------------
// Escalation tracking
// ---------------------------------------------------------------------------

describe('Kernel integration — escalation', () => {
  it('escalation level increases after repeated denials', async () => {
    const kernel = createKernel({
      dryRun: true,
      denialThreshold: 3,
      policyDefs: [
        {
          id: 'deny-all-push',
          name: 'Deny Push',
          rules: [{ action: 'git.push', effect: 'deny', reason: 'blocked' }],
          severity: 4,
        },
      ],
    });

    // Generate multiple denials to trigger escalation
    const results: KernelResult[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await kernel.propose({
        tool: 'Bash',
        command: 'git push origin main',
        agent: 'test',
      });
      results.push(r);
    }

    // All should be denied
    expect(results.every((r) => !r.allowed)).toBe(true);

    // Escalation should have increased beyond NORMAL (0)
    const lastResult = results[results.length - 1];
    expect(lastResult.decision.monitor.escalationLevel).toBeGreaterThan(0);
    expect(lastResult.decision.monitor.totalDenials).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Policy + invariant interaction
// ---------------------------------------------------------------------------

describe('Kernel integration — policy and invariant interaction', () => {
  it('denies destructive command even without explicit policy', async () => {
    const kernel = createKernel({ dryRun: true });

    const result = await kernel.propose({
      tool: 'Bash',
      command: 'rm -rf /',
      agent: 'test',
    });

    expect(result.allowed).toBe(false);
    expect(result.decision.intent.destructive).toBe(true);
  });

  it('detects git force push as destructive', async () => {
    const kernel = createKernel({ dryRun: true });

    const result = await kernel.propose({
      tool: 'Bash',
      command: 'git push --force origin main',
      agent: 'test',
    });

    expect(result.allowed).toBe(false);
    expect(result.decision.intent.action).toBe('git.force-push');
  });

  it('allows benign commands through', async () => {
    const kernel = createKernel({ dryRun: true });

    const result = await kernel.propose({
      tool: 'Bash',
      command: 'echo hello',
      agent: 'test',
    });

    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Multiple policies
// ---------------------------------------------------------------------------

describe('Kernel integration — multiple policies', () => {
  it('evaluates actions against all loaded policies', async () => {
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [
        {
          id: 'no-push',
          name: 'No Push',
          rules: [{ action: 'git.push', effect: 'deny', reason: 'Push denied by policy 1' }],
          severity: 4,
        },
        {
          id: 'no-deploy',
          name: 'No Deploy',
          rules: [
            { action: 'deploy.trigger', effect: 'deny', reason: 'Deploy denied by policy 2' },
          ],
          severity: 5,
        },
      ],
    });

    const pushResult = await kernel.propose({
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'test',
    });
    expect(pushResult.allowed).toBe(false);
    expect(pushResult.decision.decision.reason).toContain('Push denied');

    // File reads should still be allowed
    const readResult = await kernel.propose({
      tool: 'Read',
      file: 'package.json',
      agent: 'test',
    });
    expect(readResult.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Event ordering
// ---------------------------------------------------------------------------

describe('Kernel integration — event ordering', () => {
  it('events are emitted in correct lifecycle order', async () => {
    const events: DomainEvent[] = [];
    const sink: EventSink = { write: (e) => events.push(e) };

    const kernel = createKernel({ dryRun: true, sinks: [sink] });

    await kernel.propose({ tool: 'Read', file: 'test.ts', agent: 'test' });

    // Filter to action lifecycle events only
    const lifecycleKinds = events
      .filter((e) =>
        ['ActionRequested', 'ActionAllowed', 'ActionDenied', 'ActionExecuted'].includes(e.kind)
      )
      .map((e) => e.kind);

    // For an allowed dry-run: ActionRequested → ActionAllowed
    expect(lifecycleKinds[0]).toBe('ActionRequested');
    expect(lifecycleKinds[1]).toBe('ActionAllowed');
  });

  it('denied actions emit ActionRequested → ActionDenied', async () => {
    const events: DomainEvent[] = [];
    const sink: EventSink = { write: (e) => events.push(e) };

    const kernel = createKernel({ dryRun: true, sinks: [sink] });

    await kernel.propose({ tool: 'Bash', command: 'rm -rf /', agent: 'test' });

    const lifecycleKinds = events
      .filter((e) => ['ActionRequested', 'ActionDenied'].includes(e.kind))
      .map((e) => e.kind);

    expect(lifecycleKinds[0]).toBe('ActionRequested');
    expect(lifecycleKinds[1]).toBe('ActionDenied');
  });
});

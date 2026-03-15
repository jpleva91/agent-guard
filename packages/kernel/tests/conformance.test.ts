// Kernel Conformance Test Suite
// Tests the kernel as a black box via createKernel() + kernel.propose().
// These tests define the acceptance criteria for a future Rust implementation.
// All inputs/outputs use JSON fixtures for cross-language portability.

import { describe, it, expect, beforeEach } from 'vitest';
import { createKernel } from '@red-codes/kernel';
import type { KernelResult, RawAgentAction, GovernanceDecisionRecord } from '@red-codes/kernel';
import type { DomainEvent } from '@red-codes/core';
import { resetActionCounter } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';

import allowFixtures from './fixtures/conformance-allow.json' with { type: 'json' };
import denyFixtures from './fixtures/conformance-deny.json' with { type: 'json' };
import escalationFixtures from './fixtures/conformance-escalation.json' with { type: 'json' };

interface AllowFixture {
  name: string;
  input: RawAgentAction;
  expected: { allowed: boolean; actionType: string };
}

interface DenyFixture {
  name: string;
  input: RawAgentAction;
  policy?: unknown[];
  expected: { allowed: boolean; destructive?: boolean };
}

interface EscalationFixture {
  name: string;
  denialThreshold: number;
  violationThreshold: number;
  actions: RawAgentAction[];
  expectedEscalation: number[];
}

beforeEach(() => {
  resetActionCounter();
  resetEventCounter();
});

describe('Conformance: Allow decisions', () => {
  for (const fixture of allowFixtures as AllowFixture[]) {
    it(fixture.name, async () => {
      const kernel = createKernel({ dryRun: true, evaluateOptions: { defaultDeny: false } });
      const result = await kernel.propose(fixture.input);

      expect(result.allowed).toBe(fixture.expected.allowed);
      expect(result.decision.intent.action).toBe(fixture.expected.actionType);
      expect(result.runId).toMatch(/^run_/);
      expect(result.events.length).toBeGreaterThan(0);
    });
  }
});

describe('Conformance: Deny decisions', () => {
  for (const fixture of denyFixtures as DenyFixture[]) {
    it(fixture.name, async () => {
      const kernel = createKernel({
        dryRun: true,
        policyDefs: fixture.policy,
      });
      const result = await kernel.propose(fixture.input);

      expect(result.allowed).toBe(fixture.expected.allowed);
      expect(result.executed).toBe(false);

      if (fixture.expected.destructive !== undefined) {
        expect(result.decision.intent.destructive).toBe(fixture.expected.destructive);
      }
    });
  }
});

describe('Conformance: Escalation progression', () => {
  for (const fixture of escalationFixtures as EscalationFixture[]) {
    it(fixture.name, async () => {
      const kernel = createKernel({
        dryRun: true,
        denialThreshold: fixture.denialThreshold,
        violationThreshold: fixture.violationThreshold,
      });

      for (let i = 0; i < fixture.actions.length; i++) {
        const result = await kernel.propose(fixture.actions[i]);
        expect(result.decision.monitor.escalationLevel).toBe(fixture.expectedEscalation[i]);
      }
    });
  }
});

describe('Conformance: KernelResult shape', () => {
  it('produces all required fields on allow', async () => {
    const kernel = createKernel({ dryRun: true, evaluateOptions: { defaultDeny: false } });
    const result = await kernel.propose({
      tool: 'Read',
      file: 'src/index.ts',
      agent: 'conformance-agent',
    });

    // Required fields
    expect(typeof result.allowed).toBe('boolean');
    expect(typeof result.executed).toBe('boolean');
    expect(result.decision).toBeDefined();
    expect(result.events).toBeInstanceOf(Array);
    expect(typeof result.runId).toBe('string');

    // Decision structure
    expect(result.decision.intent).toBeDefined();
    expect(typeof result.decision.intent.action).toBe('string');
    expect(typeof result.decision.intent.target).toBe('string');
    expect(typeof result.decision.intent.agent).toBe('string');
    expect(typeof result.decision.intent.destructive).toBe('boolean');

    // Monitor state
    expect(typeof result.decision.monitor.escalationLevel).toBe('number');
    expect(typeof result.decision.monitor.totalEvaluations).toBe('number');
    expect(typeof result.decision.monitor.totalDenials).toBe('number');
    expect(typeof result.decision.monitor.totalViolations).toBe('number');
  });

  it('produces all required fields on deny', async () => {
    const kernel = createKernel({ dryRun: true });
    const result = await kernel.propose({
      tool: 'Bash',
      command: 'rm -rf /',
      agent: 'conformance-agent',
    });

    expect(result.allowed).toBe(false);
    expect(result.executed).toBe(false);
    expect(result.decision).toBeDefined();
    expect(result.decision.intent.destructive).toBe(true);
    expect(result.events.length).toBeGreaterThan(0);
  });
});

describe('Conformance: Decision records', () => {
  it('produces a GovernanceDecisionRecord via decision sinks', async () => {
    const records: GovernanceDecisionRecord[] = [];
    const kernel = createKernel({
      dryRun: true,
      evaluateOptions: { defaultDeny: false },
      decisionSinks: [{ write: (r) => records.push(r) }],
    });

    await kernel.propose({
      tool: 'Read',
      file: 'src/index.ts',
      agent: 'conformance-agent',
    });

    expect(records.length).toBe(1);
    const record = records[0];
    expect(typeof record.recordId).toBe('string');
    expect(typeof record.runId).toBe('string');
    expect(typeof record.timestamp).toBe('number');
    expect(typeof record.outcome).toBe('string');
    expect(record.action).toBeDefined();
    expect(typeof record.action.type).toBe('string');
  });
});

describe('Conformance: Event emission ordering', () => {
  it('emits ACTION_REQUESTED then ACTION_ALLOWED for allowed actions', async () => {
    const events: DomainEvent[] = [];
    const kernel = createKernel({
      dryRun: true,
      evaluateOptions: { defaultDeny: false },
      sinks: [{ write: (e) => events.push(e) }],
    });

    await kernel.propose({
      tool: 'Read',
      file: 'src/index.ts',
      agent: 'conformance-agent',
    });

    const kinds = events.map((e) => e.kind);
    const requestedIdx = kinds.indexOf('ActionRequested');
    const allowedIdx = kinds.indexOf('ActionAllowed');

    expect(requestedIdx).toBeGreaterThanOrEqual(0);
    expect(allowedIdx).toBeGreaterThanOrEqual(0);
    expect(requestedIdx).toBeLessThan(allowedIdx);
  });

  it('emits ACTION_REQUESTED then ACTION_DENIED for denied actions', async () => {
    const events: DomainEvent[] = [];
    const kernel = createKernel({
      dryRun: true,
      sinks: [{ write: (e) => events.push(e) }],
    });

    await kernel.propose({
      tool: 'Bash',
      command: 'rm -rf /',
      agent: 'conformance-agent',
    });

    const kinds = events.map((e) => e.kind);
    const requestedIdx = kinds.indexOf('ActionRequested');
    const deniedIdx = kinds.indexOf('ActionDenied');

    expect(requestedIdx).toBeGreaterThanOrEqual(0);
    expect(deniedIdx).toBeGreaterThanOrEqual(0);
    expect(requestedIdx).toBeLessThan(deniedIdx);
  });
});

describe('Conformance: Dry-run mode', () => {
  it('never executes in dry-run mode', async () => {
    const kernel = createKernel({ dryRun: true, evaluateOptions: { defaultDeny: false } });

    const allowed = await kernel.propose({
      tool: 'Read',
      file: 'src/index.ts',
      agent: 'test-agent',
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.executed).toBe(false);
    expect(allowed.execution).toBeNull();

    const denied = await kernel.propose({
      tool: 'Bash',
      command: 'rm -rf /',
      agent: 'test-agent',
    });
    expect(denied.allowed).toBe(false);
    expect(denied.executed).toBe(false);
    expect(denied.execution).toBeNull();
  });
});

describe('Conformance: Evidence packs', () => {
  it('includes evidence pack on denied actions', async () => {
    const kernel = createKernel({ dryRun: true });
    const result = await kernel.propose({
      tool: 'Bash',
      command: 'rm -rf /',
      agent: 'conformance-agent',
    });

    expect(result.allowed).toBe(false);
    expect(result.decision.evidencePack).toBeDefined();
    expect(result.decision.evidencePack).not.toBeNull();
    if (result.decision.evidencePack) {
      expect(typeof result.decision.evidencePack.packId).toBe('string');
      expect(typeof result.decision.evidencePack.timestamp).toBe('number');
      expect(typeof result.decision.evidencePack.summary).toBe('string');
    }
  });
});

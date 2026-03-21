// Tests for capability grant tracking in kernel events and decision records.
// Verifies that ActionAllowed/ActionExecuted events and GovernanceDecisionRecords
// include the capabilityGrant field when a RunManifest is provided.

import { describe, it, expect, beforeEach } from 'vitest';
import { createKernel } from '@red-codes/kernel';
import type { DomainEvent, GovernanceDecisionRecord, RunManifest } from '@red-codes/core';
import { resetActionCounter } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';

beforeEach(() => {
  resetActionCounter();
  resetEventCounter();
});

function makeManifest(overrides: Partial<RunManifest> = {}): RunManifest {
  return {
    sessionId: 'session_test',
    role: 'builder',
    grants: [
      {
        permissions: ['read'],
        actions: ['file.read'],
        filePatterns: ['src/**'],
      },
      {
        permissions: ['read', 'write'],
        actions: ['file.*'],
      },
      {
        permissions: ['execute'],
        actions: ['shell.exec'],
      },
    ],
    scope: { allowedPaths: ['**'] },
    ...overrides,
  };
}

describe('Capability Grant Tracking', () => {
  it('includes capabilityGrant in ActionAllowed event when manifest is present', async () => {
    const manifest = makeManifest();
    const kernel = createKernel({
      dryRun: true,
      evaluateOptions: { defaultDeny: false },
      manifest,
    });

    const result = await kernel.propose({
      tool: 'Read',
      file: 'src/index.ts',
      agent: 'test-agent',
    });

    expect(result.allowed).toBe(true);

    const allowedEvent = result.events.find(
      (e: DomainEvent) => e.kind === 'ActionAllowed',
    );
    expect(allowedEvent).toBeDefined();
    expect(allowedEvent!.capabilityGrant).toBeDefined();
    expect(allowedEvent!.capabilityGrant).toEqual({
      grantIndex: 0,
      grant: manifest.grants[0],
    });
  });

  it('matches second grant when first does not cover the action', async () => {
    const manifest = makeManifest();
    const kernel = createKernel({
      dryRun: true,
      evaluateOptions: { defaultDeny: false },
      manifest,
    });

    const result = await kernel.propose({
      tool: 'Write',
      file: 'tests/foo.ts',
      agent: 'test-agent',
    });

    expect(result.allowed).toBe(true);

    const allowedEvent = result.events.find(
      (e: DomainEvent) => e.kind === 'ActionAllowed',
    );
    expect(allowedEvent).toBeDefined();
    // First grant requires filePatterns: ['src/**'], target is 'tests/foo.ts' — no match.
    // Second grant has actions: ['file.*'] with no filePatterns — matches.
    expect(allowedEvent!.capabilityGrant).toEqual({
      grantIndex: 1,
      grant: manifest.grants[1],
    });
  });

  it('omits capabilityGrant when no manifest is provided', async () => {
    const kernel = createKernel({
      dryRun: true,
      evaluateOptions: { defaultDeny: false },
    });

    const result = await kernel.propose({
      tool: 'Read',
      file: 'src/index.ts',
      agent: 'test-agent',
    });

    expect(result.allowed).toBe(true);

    const allowedEvent = result.events.find(
      (e: DomainEvent) => e.kind === 'ActionAllowed',
    );
    expect(allowedEvent).toBeDefined();
    // capabilityGrant should be null (not undefined) when no manifest
    expect(allowedEvent!.capabilityGrant).toBeNull();
  });

  it('includes capabilityGrant in decision record', async () => {
    const sinkRecords: GovernanceDecisionRecord[] = [];
    const manifest = makeManifest();
    const kernel = createKernel({
      dryRun: true,
      evaluateOptions: { defaultDeny: false },
      manifest,
      decisionSinks: [{ write: (r) => sinkRecords.push(r) }],
    });

    await kernel.propose({
      tool: 'Read',
      file: 'src/index.ts',
      agent: 'test-agent',
    });

    expect(sinkRecords).toHaveLength(1);
    expect(sinkRecords[0].capabilityGrant).toEqual({
      grantIndex: 0,
      grant: manifest.grants[0],
    });
  });

  it('decision record has null capabilityGrant when no manifest', async () => {
    const sinkRecords: GovernanceDecisionRecord[] = [];
    const kernel = createKernel({
      dryRun: true,
      evaluateOptions: { defaultDeny: false },
      decisionSinks: [{ write: (r) => sinkRecords.push(r) }],
    });

    await kernel.propose({
      tool: 'Read',
      file: 'src/index.ts',
      agent: 'test-agent',
    });

    expect(sinkRecords).toHaveLength(1);
    expect(sinkRecords[0].capabilityGrant).toBeNull();
  });

  it('decision record has null capabilityGrant when no grant matches', async () => {
    const sinkRecords: GovernanceDecisionRecord[] = [];
    const manifest = makeManifest({
      grants: [
        {
          permissions: ['read'],
          actions: ['deploy.*'],
        },
      ],
    });
    const kernel = createKernel({
      dryRun: true,
      evaluateOptions: { defaultDeny: false },
      manifest,
      decisionSinks: [{ write: (r) => sinkRecords.push(r) }],
    });

    await kernel.propose({
      tool: 'Read',
      file: 'src/index.ts',
      agent: 'test-agent',
    });

    expect(sinkRecords).toHaveLength(1);
    expect(sinkRecords[0].capabilityGrant).toBeNull();
  });

  it('denied actions have null capabilityGrant in decision record', async () => {
    const sinkRecords: GovernanceDecisionRecord[] = [];
    const manifest = makeManifest({
      grants: [
        {
          permissions: ['read', 'write'],
          actions: ['file.write'],
          filePatterns: ['src/**'],
        },
      ],
    });
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [
        {
          id: 'deny-all',
          name: 'Deny All',
          rules: [{ action: 'file.write', effect: 'deny' as const, reason: 'blocked' }],
          severity: 5,
        },
      ],
      manifest,
      decisionSinks: [{ write: (r) => sinkRecords.push(r) }],
    });

    const result = await kernel.propose({
      tool: 'Write',
      file: 'src/index.ts',
      content: 'hello',
    });

    expect(result.allowed).toBe(false);
    expect(sinkRecords).toHaveLength(1);
    expect(sinkRecords[0].capabilityGrant).toBeNull();
  });
});

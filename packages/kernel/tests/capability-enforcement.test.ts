// Tests for the capability validation gate (issue #183).
// Verifies that the kernel enforces session capability grants before adapter execution:
// - Actions are denied with reason 'capability_not_granted' when no matching grant exists
// - CapabilityValidated events are emitted on successful capability checks
// - No enforcement when no manifest is provided (backward compatible)

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

describe('Capability Enforcement Gate', () => {
  describe('denial when no matching grant', () => {
    it('denies action with capability_not_granted when manifest has no matching grant', async () => {
      const manifest = makeManifest({
        grants: [
          {
            permissions: ['execute'],
            actions: ['deploy.*'],
          },
        ],
      });
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

      expect(result.allowed).toBe(false);
      expect(result.executed).toBe(false);
    });

    it('emits ActionDenied with reason capability_not_granted', async () => {
      const manifest = makeManifest({
        grants: [
          {
            permissions: ['execute'],
            actions: ['deploy.*'],
          },
        ],
      });
      const kernel = createKernel({
        dryRun: true,
        evaluateOptions: { defaultDeny: false },
        manifest,
      });

      const result = await kernel.propose({
        tool: 'Write',
        file: 'src/index.ts',
        content: 'hello',
        agent: 'test-agent',
      });

      const deniedEvent = result.events.find(
        (e: DomainEvent) => e.kind === 'ActionDenied',
      );
      expect(deniedEvent).toBeDefined();
      expect(deniedEvent!.reason).toBe('capability_not_granted');
    });

    it('includes capabilityEnforcement metadata in ActionDenied event', async () => {
      const manifest = makeManifest({
        grants: [
          {
            permissions: ['read'],
            actions: ['git.*'],
          },
        ],
      });
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

      const deniedEvent = result.events.find(
        (e: DomainEvent) => e.kind === 'ActionDenied',
      );
      expect(deniedEvent).toBeDefined();
      expect((deniedEvent!.metadata as Record<string, unknown>).capabilityEnforcement).toBe(true);
    });

    it('decision record outcome is deny with capability_not_granted reason', async () => {
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
      expect(sinkRecords[0].outcome).toBe('deny');
      expect(sinkRecords[0].reason).toBe('capability_not_granted');
      expect(sinkRecords[0].capabilityGrant).toBeNull();
    });

    it('denies shell.exec when manifest only grants file actions', async () => {
      const manifest = makeManifest({
        grants: [
          {
            permissions: ['read', 'write'],
            actions: ['file.*'],
          },
        ],
      });
      const kernel = createKernel({
        dryRun: true,
        evaluateOptions: { defaultDeny: false },
        manifest,
      });

      const result = await kernel.propose({
        tool: 'Bash',
        command: 'ls -la',
        agent: 'test-agent',
      });

      expect(result.allowed).toBe(false);

      const deniedEvent = result.events.find(
        (e: DomainEvent) => e.kind === 'ActionDenied',
      );
      expect(deniedEvent).toBeDefined();
      expect(deniedEvent!.reason).toBe('capability_not_granted');
    });

    it('denies when grant file pattern does not match target', async () => {
      const manifest = makeManifest({
        grants: [
          {
            permissions: ['read'],
            actions: ['file.read'],
            filePatterns: ['tests/**'],
          },
        ],
      });
      const kernel = createKernel({
        dryRun: true,
        evaluateOptions: { defaultDeny: false },
        manifest,
      });

      const result = await kernel.propose({
        tool: 'Read',
        file: 'src/kernel.ts',
        agent: 'test-agent',
      });

      expect(result.allowed).toBe(false);

      const deniedEvent = result.events.find(
        (e: DomainEvent) => e.kind === 'ActionDenied',
      );
      expect(deniedEvent!.reason).toBe('capability_not_granted');
    });
  });

  describe('allowed when grant matches', () => {
    it('allows action when manifest grant covers the action type', async () => {
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
    });

    it('emits CapabilityValidated event on successful check', async () => {
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

      const validatedEvent = result.events.find(
        (e: DomainEvent) => e.kind === 'CapabilityValidated',
      );
      expect(validatedEvent).toBeDefined();
      expect(validatedEvent!.actionType).toBe('file.read');
      expect(validatedEvent!.target).toBe('src/index.ts');
      expect(validatedEvent!.grantIndex).toBe(0);
      expect(validatedEvent!.grant).toEqual(manifest.grants[0]);
    });

    it('matches wildcard grant for action type', async () => {
      const manifest = makeManifest({
        grants: [
          {
            permissions: ['read', 'write', 'execute'],
            actions: ['*'],
          },
        ],
      });
      const kernel = createKernel({
        dryRun: true,
        evaluateOptions: { defaultDeny: false },
        manifest,
      });

      const result = await kernel.propose({
        tool: 'Bash',
        command: 'echo hello',
        agent: 'test-agent',
      });

      expect(result.allowed).toBe(true);

      const validatedEvent = result.events.find(
        (e: DomainEvent) => e.kind === 'CapabilityValidated',
      );
      expect(validatedEvent).toBeDefined();
      expect(validatedEvent!.grantIndex).toBe(0);
    });

    it('matches class wildcard grant (file.*)', async () => {
      const manifest = makeManifest({
        grants: [
          {
            permissions: ['read', 'write'],
            actions: ['file.*'],
          },
        ],
      });
      const kernel = createKernel({
        dryRun: true,
        evaluateOptions: { defaultDeny: false },
        manifest,
      });

      const result = await kernel.propose({
        tool: 'Write',
        file: 'src/index.ts',
        content: 'hello',
        agent: 'test-agent',
      });

      expect(result.allowed).toBe(true);

      const validatedEvent = result.events.find(
        (e: DomainEvent) => e.kind === 'CapabilityValidated',
      );
      expect(validatedEvent).toBeDefined();
    });
  });

  describe('backward compatibility', () => {
    it('allows action without enforcement when no manifest is provided', async () => {
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
    });

    it('does not emit CapabilityValidated when no manifest', async () => {
      const kernel = createKernel({
        dryRun: true,
        evaluateOptions: { defaultDeny: false },
      });

      const result = await kernel.propose({
        tool: 'Read',
        file: 'src/index.ts',
        agent: 'test-agent',
      });

      const validatedEvent = result.events.find(
        (e: DomainEvent) => e.kind === 'CapabilityValidated',
      );
      expect(validatedEvent).toBeUndefined();
    });
  });

  describe('two-layer authorization', () => {
    it('policy denial takes precedence over capability check', async () => {
      const manifest = makeManifest({
        grants: [
          {
            permissions: ['read', 'write'],
            actions: ['file.write'],
          },
        ],
      });
      const kernel = createKernel({
        dryRun: true,
        policyDefs: [
          {
            id: 'deny-writes',
            name: 'Deny All Writes',
            rules: [{ action: 'file.write', effect: 'deny' as const, reason: 'policy-blocked' }],
            severity: 5,
          },
        ],
        manifest,
      });

      const result = await kernel.propose({
        tool: 'Write',
        file: 'src/index.ts',
        content: 'hello',
      });

      // Policy denies before capability gate fires
      expect(result.allowed).toBe(false);

      const deniedEvent = result.events.find(
        (e: DomainEvent) => e.kind === 'ActionDenied',
      );
      expect(deniedEvent).toBeDefined();
      // The reason should be from policy, not capability_not_granted
      expect(deniedEvent!.reason).not.toBe('capability_not_granted');
    });

    it('capability denial blocks even when policy allows', async () => {
      const manifest = makeManifest({
        grants: [
          {
            permissions: ['execute'],
            actions: ['shell.exec'],
          },
        ],
      });
      const kernel = createKernel({
        dryRun: true,
        evaluateOptions: { defaultDeny: false },
        manifest,
      });

      // Policy allows file.read (defaultDeny: false), but manifest only grants shell.exec
      const result = await kernel.propose({
        tool: 'Read',
        file: 'src/index.ts',
        agent: 'test-agent',
      });

      expect(result.allowed).toBe(false);

      const deniedEvent = result.events.find(
        (e: DomainEvent) => e.kind === 'ActionDenied',
      );
      expect(deniedEvent!.reason).toBe('capability_not_granted');
    });
  });

  describe('event sink integration', () => {
    it('sinks CapabilityValidated event to event sinks', async () => {
      const sunkEvents: DomainEvent[] = [];
      const manifest = makeManifest();
      const kernel = createKernel({
        dryRun: true,
        evaluateOptions: { defaultDeny: false },
        manifest,
        sinks: [{ write: (e) => sunkEvents.push(e) }],
      });

      await kernel.propose({
        tool: 'Read',
        file: 'src/index.ts',
        agent: 'test-agent',
      });

      const validatedEvent = sunkEvents.find((e) => e.kind === 'CapabilityValidated');
      expect(validatedEvent).toBeDefined();
    });

    it('sinks ActionDenied for capability denial to event sinks', async () => {
      const sunkEvents: DomainEvent[] = [];
      const manifest = makeManifest({
        grants: [
          {
            permissions: ['execute'],
            actions: ['deploy.*'],
          },
        ],
      });
      const kernel = createKernel({
        dryRun: true,
        evaluateOptions: { defaultDeny: false },
        manifest,
        sinks: [{ write: (e) => sunkEvents.push(e) }],
      });

      await kernel.propose({
        tool: 'Read',
        file: 'src/index.ts',
        agent: 'test-agent',
      });

      const deniedEvent = sunkEvents.find(
        (e) => e.kind === 'ActionDenied' && e.reason === 'capability_not_granted',
      );
      expect(deniedEvent).toBeDefined();
    });
  });

  describe('manifest with empty grants', () => {
    it('denies all actions when manifest has empty grants array', async () => {
      const manifest = makeManifest({
        grants: [],
      });
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

      expect(result.allowed).toBe(false);

      const deniedEvent = result.events.find(
        (e: DomainEvent) => e.kind === 'ActionDenied',
      );
      expect(deniedEvent!.reason).toBe('capability_not_granted');
    });
  });
});

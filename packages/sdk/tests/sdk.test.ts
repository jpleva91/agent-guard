import { describe, it, expect, beforeEach } from 'vitest';
import { createGovernanceSDK, createSession } from '@red-codes/sdk';
import type { SDKConfig, GovernedSession } from '@red-codes/sdk';
import { resetActionCounter } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';
import type { DomainEvent } from '@red-codes/core';

beforeEach(() => {
  resetActionCounter();
  resetEventCounter();
});

describe('createGovernanceSDK', () => {
  it('creates an SDK instance with default config', () => {
    const sdk = createGovernanceSDK();
    expect(sdk).toBeDefined();
    expect(typeof sdk.createSession).toBe('function');
    expect(typeof sdk.evaluate).toBe('function');
  });

  it('creates sessions with unique run IDs', () => {
    const sdk = createGovernanceSDK({ dryRun: true });
    const s1 = sdk.createSession();
    const s2 = sdk.createSession();
    expect(s1.id).not.toBe(s2.id);
    s1.end();
    s2.end();
  });

  it('applies config overrides to sessions', () => {
    const sdk = createGovernanceSDK({ dryRun: true, defaultDeny: false });
    const session = sdk.createSession({
      policies: [
        {
          id: 'test-policy',
          name: 'Test Policy',
          rules: [{ action: 'git.push', effect: 'deny' as const, reason: 'Blocked' }],
          severity: 3,
        },
      ],
    });
    expect(session.id).toMatch(/^run_/);
    session.end();
  });
});

describe('GovernedSession', () => {
  let session: GovernedSession;

  beforeEach(() => {
    session = createSession({
      dryRun: true,
      defaultDeny: false,
    });
  });

  it('has a run ID', () => {
    expect(session.id).toMatch(/^run_/);
    session.end();
  });

  it('allows benign file read', async () => {
    const result = await session.propose({
      tool: 'Read',
      file: 'src/index.ts',
      agent: 'test-agent',
    });
    expect(result.allowed).toBe(true);
    expect(result.decision.intent.action).toBe('file.read');
    session.end();
  });

  it('denies destructive shell command via default invariants', async () => {
    const result = await session.propose({
      tool: 'Bash',
      command: 'rm -rf /',
      agent: 'test-agent',
    });
    expect(result.allowed).toBe(false);
    expect(result.executed).toBe(false);
    session.end();
  });

  it('denies actions matching policy rules', async () => {
    const s = createSession({
      dryRun: true,
      policies: [
        {
          id: 'protect-main',
          name: 'Protect Main',
          rules: [{ action: 'git.push', effect: 'deny' as const, reason: 'Protected branch' }],
          severity: 4,
        },
      ],
    });
    const result = await s.propose({
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'test-agent',
    });
    expect(result.allowed).toBe(false);
    s.end();
  });

  it('tracks action log', async () => {
    expect(session.getActionLog()).toHaveLength(0);
    await session.propose({ tool: 'Read', file: 'foo.ts', agent: 'test' });
    expect(session.getActionLog()).toHaveLength(1);
    await session.propose({ tool: 'Read', file: 'bar.ts', agent: 'test' });
    expect(session.getActionLog()).toHaveLength(2);
    session.end();
  });

  it('tracks event count', async () => {
    const initialCount = session.getEventCount();
    await session.propose({ tool: 'Read', file: 'foo.ts', agent: 'test' });
    expect(session.getEventCount()).toBeGreaterThan(initialCount);
    session.end();
  });

  it('returns null manifest when none configured', () => {
    expect(session.getManifest()).toBeNull();
    session.end();
  });

  it('returns manifest when configured', () => {
    const manifest = {
      sessionId: 'test-session',
      role: 'builder' as const,
      grants: [{ permissions: ['read' as const, 'write' as const], actions: ['file.read'] }],
      scope: { allowedPaths: ['src/'] },
    };
    const s = createSession({ dryRun: true, manifest });
    expect(s.getManifest()).toEqual(manifest);
    s.end();
  });

  it('throws after session ends', async () => {
    session.end();
    await expect(session.propose({ tool: 'Read', file: 'foo.ts', agent: 'test' })).rejects.toThrow(
      /has ended/
    );
  });

  it('end() is idempotent', () => {
    session.end();
    session.end(); // should not throw
  });
});

describe('Event subscription', () => {
  it('receives events by kind', async () => {
    const session = createSession({ dryRun: true, defaultDeny: false });
    const events: DomainEvent[] = [];
    session.on('ActionRequested', (e) => events.push(e));

    await session.propose({ tool: 'Read', file: 'foo.ts', agent: 'test' });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].kind).toBe('ActionRequested');
    session.end();
  });

  it('receives all events via onAny', async () => {
    const session = createSession({ dryRun: true, defaultDeny: false });
    const events: DomainEvent[] = [];
    session.onAny((e) => events.push(e));

    await session.propose({ tool: 'Read', file: 'foo.ts', agent: 'test' });
    expect(events.length).toBeGreaterThan(1);
    session.end();
  });

  it('unsubscribe stops event delivery', async () => {
    const session = createSession({ dryRun: true, defaultDeny: false });
    const events: DomainEvent[] = [];
    const unsub = session.on('ActionRequested', (e) => events.push(e));

    await session.propose({ tool: 'Read', file: 'foo.ts', agent: 'test' });
    const countAfterFirst = events.length;

    unsub();
    await session.propose({ tool: 'Read', file: 'bar.ts', agent: 'test' });
    expect(events.length).toBe(countAfterFirst);
    session.end();
  });
});

describe('SDK evaluate (one-shot)', () => {
  it('evaluates a single action without manual session management', async () => {
    const sdk = createGovernanceSDK({ dryRun: true, defaultDeny: false });
    const result = await sdk.evaluate({
      tool: 'Read',
      file: 'src/index.ts',
      agent: 'test',
    });
    expect(result.allowed).toBe(true);
    expect(result.runId).toMatch(/^run_/);
  });

  it('denies destructive actions in one-shot mode', async () => {
    const sdk = createGovernanceSDK({ dryRun: true });
    const result = await sdk.evaluate({
      tool: 'Bash',
      command: 'rm -rf /',
      agent: 'test',
    });
    expect(result.allowed).toBe(false);
  });
});

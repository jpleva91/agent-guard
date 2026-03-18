import { describe, it, expect } from 'vitest';
import { createKernel } from '@red-codes/kernel';
import type { KernelConfig } from '@red-codes/kernel';

function makeConfig(overrides: Partial<KernelConfig> = {}): KernelConfig {
  return {
    dryRun: true,
    policyDefs: [
      {
        id: 'test-policy',
        name: 'Test Policy',
        severity: 3,
        rules: [{ action: '*', effect: 'allow' }],
      },
    ],
    tierRouterConfig: {},
    ...overrides,
  };
}

describe('kernel tier routing integration', () => {
  it('sets tier=fast for file.read actions with tier router enabled', async () => {
    const kernel = createKernel(makeConfig());
    const result = await kernel.propose({ tool: 'Read', file: 'src/index.ts', agent: 'test' });

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('fast');
  });

  it('sets tier=standard for file.write actions', async () => {
    const kernel = createKernel(makeConfig());
    const result = await kernel.propose({ tool: 'Write', file: 'src/index.ts', agent: 'test' });

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('standard');
  });

  it('sets tier=deep for git push actions', async () => {
    const kernel = createKernel(makeConfig());
    const result = await kernel.propose({
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'test',
    });

    expect(result.tier).toBe('deep');
  });

  it('returns fast-path cached result on second identical file.read', async () => {
    const kernel = createKernel(makeConfig());

    // First call — cache miss, full evaluation
    const first = await kernel.propose({ tool: 'Read', file: 'src/index.ts', agent: 'test' });
    expect(first.allowed).toBe(true);
    expect(first.tier).toBe('fast');

    // Second call — cache hit
    const second = await kernel.propose({ tool: 'Read', file: 'src/index.ts', agent: 'test' });
    expect(second.allowed).toBe(true);
    expect(second.tier).toBe('fast');
    // The cached result should have 'fast-path-cache' as capability
    // Event data is spread directly on the DomainEvent object
    const allowedEvent = second.events.find(
      (e) =>
        e.kind === 'ActionAllowed' &&
        (e as Record<string, unknown>).capability === 'fast-path-cache'
    );
    expect(allowedEvent).toBeDefined();
  });

  it('does not set tier when tierRouterConfig is not provided', async () => {
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [
        {
          id: 'test-policy',
          name: 'Test Policy',
          severity: 3,
          rules: [{ action: '*', effect: 'allow' }],
        },
      ],
    });
    const result = await kernel.propose({ tool: 'Read', file: 'src/index.ts', agent: 'test' });

    expect(result.allowed).toBe(true);
    expect(result.tier).toBeUndefined();
  });

  it('returns tier metrics when tier router is configured', async () => {
    const kernel = createKernel(makeConfig());
    await kernel.propose({ tool: 'Read', file: 'src/a.ts', agent: 'test' });
    await kernel.propose({ tool: 'Write', file: 'src/b.ts', agent: 'test' });

    const metrics = kernel.getTierMetrics();
    expect(metrics).not.toBeNull();
    expect(metrics!.fast.count).toBe(1);
    expect(metrics!.standard.count).toBe(1);
  });

  it('returns null tier metrics when no tier router configured', () => {
    const kernel = createKernel({ dryRun: true });
    expect(kernel.getTierMetrics()).toBeNull();
  });

  it('assigns deep tier to sensitive paths even for file.read', async () => {
    const kernel = createKernel(makeConfig());
    const result = await kernel.propose({
      tool: 'Read',
      file: '.env.production',
      agent: 'test',
    });

    expect(result.tier).toBe('deep');
  });

  it('sets tier on denied actions', async () => {
    const kernel = createKernel(
      makeConfig({
        policyDefs: [
          {
            id: 'strict',
            name: 'Strict',
            severity: 5,
            rules: [{ action: 'file.write', effect: 'deny', reason: 'no writes allowed' }],
          },
        ],
      })
    );
    const result = await kernel.propose({ tool: 'Write', file: 'src/x.ts', agent: 'test' });

    expect(result.allowed).toBe(false);
    expect(result.tier).toBe('standard');
  });
});

import { describe, it, expect } from 'vitest';
import {
  normalizeToActionContext,
  isActionContext,
  authorizeContext,
  createKernel,
} from '@red-codes/kernel';
import type { RawAgentAction } from '@red-codes/kernel';
import type { ActionContext } from '@red-codes/core';

describe('normalizeToActionContext (KE-2)', () => {
  it('normalizes a file write action', () => {
    const raw: RawAgentAction = {
      tool: 'Write',
      file: 'src/index.ts',
      content: 'hello',
      agent: 'claude-code:abc',
    };

    const ctx = normalizeToActionContext(raw, 'claude-code');

    expect(ctx.action).toBe('file.write');
    expect(ctx.actionClass).toBe('file');
    expect(ctx.target).toBe('src/index.ts');
    expect(ctx.destructive).toBe(false);
    expect(ctx.source).toBe('claude-code');
    expect(ctx.actor.agentId).toBe('claude-code:abc');
    expect(ctx.args.filePath).toBe('src/index.ts');
    expect(ctx.args.content).toBe('hello');
    // NormalizedIntent compatibility
    expect(ctx.agent).toBe('claude-code:abc');
    expect(typeof ctx.normalizedAt).toBe('number');
  });

  it('normalizes a shell exec action', () => {
    const raw: RawAgentAction = {
      tool: 'Bash',
      command: 'npm test',
      agent: 'copilot-cli:xyz',
    };

    const ctx = normalizeToActionContext(raw, 'copilot-cli');

    expect(ctx.action).toBe('shell.exec');
    expect(ctx.actionClass).toBe('shell');
    expect(ctx.command).toBe('npm test');
    expect(ctx.args.command).toBe('npm test');
    expect(ctx.source).toBe('copilot-cli');
    expect(ctx.destructive).toBe(false);
  });

  it('normalizes a git push action from shell command', () => {
    const raw: RawAgentAction = {
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'claude-code',
    };

    const ctx = normalizeToActionContext(raw, 'claude-code');

    expect(ctx.action).toBe('git.push');
    expect(ctx.actionClass).toBe('git');
    expect(ctx.target).toBe('main');
    expect(ctx.branch).toBe('main');
    expect(ctx.args.branch).toBe('main');
  });

  it('marks destructive commands', () => {
    const raw: RawAgentAction = {
      tool: 'Bash',
      command: 'rm -rf /',
      agent: 'claude-code',
    };

    const ctx = normalizeToActionContext(raw);

    expect(ctx.destructive).toBe(true);
    expect(ctx.actionClass).toBe('shell');
  });

  it('normalizes an MCP tool call', () => {
    const raw: RawAgentAction = {
      tool: 'mcp__service-name__do_something',
      agent: 'claude-code',
    };

    const ctx = normalizeToActionContext(raw, 'claude-code');

    expect(ctx.action).toBe('mcp.call');
    expect(ctx.actionClass).toBe('mcp');
    expect(ctx.target).toBe('service-name');
  });

  it('handles null/undefined raw action gracefully', () => {
    const ctx = normalizeToActionContext(null);

    expect(ctx.action).toBe('unknown');
    expect(ctx.actionClass).toBe('unknown');
    expect(ctx.target).toBe('');
    expect(ctx.agent).toBe('unknown');
    expect(ctx.destructive).toBe(false);
    expect(ctx.source).toBe('unknown');
  });

  it('defaults source to unknown when not provided', () => {
    const raw: RawAgentAction = { tool: 'Read', file: 'README.md' };
    const ctx = normalizeToActionContext(raw);

    expect(ctx.source).toBe('unknown');
  });

  it('propagates session ID and worktree metadata to actor', () => {
    const raw: RawAgentAction = {
      tool: 'Write',
      file: 'src/test.ts',
      agent: 'claude-code:session1',
      metadata: { sessionId: 'sess-abc-123', inWorktree: true },
    };

    const ctx = normalizeToActionContext(raw, 'claude-code');

    expect(ctx.actor.sessionId).toBe('sess-abc-123');
    expect(ctx.actor.inWorktree).toBe(true);
  });

  it('propagates persona to actor', () => {
    const raw: RawAgentAction = {
      tool: 'Bash',
      command: 'npm test',
      agent: 'claude-code',
      persona: { trustTier: 'standard', role: 'developer' },
    };

    const ctx = normalizeToActionContext(raw, 'claude-code');

    expect(ctx.actor.persona).toEqual({ trustTier: 'standard', role: 'developer' });
    expect(ctx.persona).toEqual({ trustTier: 'standard', role: 'developer' });
  });

  it('is structurally compatible with NormalizedIntent', () => {
    const raw: RawAgentAction = {
      tool: 'Write',
      file: 'src/test.ts',
      agent: 'claude-code',
    };

    const ctx = normalizeToActionContext(raw, 'claude-code');

    // These are the required NormalizedIntent fields
    expect(typeof ctx.action).toBe('string');
    expect(typeof ctx.target).toBe('string');
    expect(typeof ctx.agent).toBe('string');
    expect(typeof ctx.destructive).toBe('boolean');
  });

  it('normalizes within performance budget', () => {
    const raw: RawAgentAction = {
      tool: 'Write',
      file: 'src/test.ts',
      content: 'hello world',
      agent: 'claude-code',
    };

    // Warm up
    for (let i = 0; i < 100; i++) {
      normalizeToActionContext(raw, 'claude-code');
    }

    // Benchmark
    const iterations = 1000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      normalizeToActionContext(raw, 'claude-code');
    }
    const elapsed = performance.now() - start;
    const avgUs = (elapsed / iterations) * 1000; // microseconds

    // Target: 50-100µs (p50). Allow generous margin for CI variability.
    expect(avgUs).toBeLessThan(500);
  });

  it('preserves raw tool name in args.metadata', () => {
    const raw: RawAgentAction = {
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'claude-code',
    };

    const ctx = normalizeToActionContext(raw, 'claude-code');

    expect(ctx.args.metadata?.rawTool).toBe('Bash');
  });
});

describe('isActionContext (KE-2)', () => {
  it('returns true for ActionContext objects', () => {
    const ctx = normalizeToActionContext(
      { tool: 'Write', file: 'test.ts', agent: 'test' },
      'claude-code'
    );
    expect(isActionContext(ctx)).toBe(true);
  });

  it('returns false for RawAgentAction objects', () => {
    const raw: RawAgentAction = { tool: 'Write', file: 'test.ts', agent: 'test' };
    expect(isActionContext(raw)).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isActionContext(null)).toBe(false);
    expect(isActionContext(undefined)).toBe(false);
  });

  it('returns false for plain objects', () => {
    expect(isActionContext({ action: 'file.write' })).toBe(false);
  });
});

describe('authorizeContext (KE-2)', () => {
  it('authorizes an ActionContext without re-normalization', () => {
    const ctx = normalizeToActionContext(
      { tool: 'Read', file: 'README.md', agent: 'test-agent' },
      'claude-code'
    );

    const result = authorizeContext(ctx, [], { defaultDeny: false });

    expect(result.intent.action).toBe('file.read');
    expect(result.intent.agent).toBe('test-agent');
    expect(result.result.allowed).toBe(true);
  });

  it('denies destructive ActionContext', () => {
    const ctx = normalizeToActionContext(
      { tool: 'Bash', command: 'rm -rf /', agent: 'test-agent' },
      'claude-code'
    );

    const result = authorizeContext(ctx, []);

    expect(result.result.allowed).toBe(false);
    expect(result.result.reason).toContain('Destructive command');
  });
});

describe('Kernel.propose with ActionContext (KE-2)', () => {
  it('accepts an ActionContext directly', async () => {
    const kernel = createKernel({
      policyDefs: [
        {
          id: 'test',
          name: 'test',
          rules: [{ action: 'file.read', effect: 'allow' }],
          severity: 1,
        },
      ],
      dryRun: true,
    });

    const ctx: ActionContext = normalizeToActionContext(
      { tool: 'Read', file: 'README.md', agent: 'test-agent' },
      'claude-code'
    );

    const result = await kernel.propose(ctx);

    expect(result.allowed).toBe(true);
    expect(result.decision.intent.action).toBe('file.read');
    expect(result.decision.intent.agent).toBe('test-agent');
  });

  it('accepts a RawAgentAction (backward compat)', async () => {
    const kernel = createKernel({
      policyDefs: [
        {
          id: 'test',
          name: 'test',
          rules: [{ action: 'file.read', effect: 'allow' }],
          severity: 1,
        },
      ],
      dryRun: true,
    });

    const raw: RawAgentAction = { tool: 'Read', file: 'README.md', agent: 'test-agent' };

    const result = await kernel.propose(raw);

    expect(result.allowed).toBe(true);
    expect(result.decision.intent.action).toBe('file.read');
  });

  it('produces identical decisions for equivalent RawAgentAction and ActionContext', async () => {
    const policyDefs = [
      {
        id: 'test-policy',
        name: 'test-policy',
        rules: [
          { action: 'file.*', effect: 'allow' as const },
          { action: 'shell.exec', effect: 'deny' as const, reason: 'No shell' },
        ],
        severity: 3,
      },
    ];

    const rawAction: RawAgentAction = {
      tool: 'Write',
      file: 'src/test.ts',
      content: 'console.log("hello")',
      agent: 'test-agent',
    };

    const kernelRaw = createKernel({ policyDefs, dryRun: true });
    const resultRaw = await kernelRaw.propose(rawAction);

    const ctx = normalizeToActionContext(rawAction, 'unknown');
    const kernelCtx = createKernel({ policyDefs, dryRun: true });
    const resultCtx = await kernelCtx.propose(ctx);

    expect(resultRaw.allowed).toBe(resultCtx.allowed);
    expect(resultRaw.decision.intent.action).toBe(resultCtx.decision.intent.action);
    expect(resultRaw.decision.decision.decision).toBe(resultCtx.decision.decision.decision);
  });
});

describe('ActionContext normalization benchmark (KE-2 SLO)', () => {
  it('p50 normalization under 100µs for file write', () => {
    const raw: RawAgentAction = {
      tool: 'Write',
      file: 'src/index.ts',
      content: 'const x = 1;',
      agent: 'claude-code:abc',
      metadata: { sessionId: 'sess-123', inWorktree: true },
    };

    // Warm up JIT
    for (let i = 0; i < 500; i++) {
      normalizeToActionContext(raw, 'claude-code');
    }

    // Collect individual timings
    const timings: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const start = performance.now();
      normalizeToActionContext(raw, 'claude-code');
      timings.push((performance.now() - start) * 1000); // µs
    }

    timings.sort((a, b) => a - b);
    const p50 = timings[Math.floor(timings.length * 0.5)]!;
    const p95 = timings[Math.floor(timings.length * 0.95)]!;
    const p99 = timings[Math.floor(timings.length * 0.99)]!;

    // SLO from ROADMAP: p50 < 50µs, p95 < 100µs, p99 < 200µs
    // Use generous margin for CI variability (2x)
    expect(p50).toBeLessThan(100);
    expect(p95).toBeLessThan(200);
    expect(p99).toBeLessThan(400);
  });

  it('p50 normalization under 100µs for git push command', () => {
    const raw: RawAgentAction = {
      tool: 'Bash',
      command: 'git push origin feature-branch',
      agent: 'claude-code',
    };

    // Warm up
    for (let i = 0; i < 500; i++) {
      normalizeToActionContext(raw, 'claude-code');
    }

    const timings: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const start = performance.now();
      normalizeToActionContext(raw, 'claude-code');
      timings.push((performance.now() - start) * 1000);
    }

    timings.sort((a, b) => a - b);
    const p50 = timings[Math.floor(timings.length * 0.5)]!;

    // Git commands may be slightly slower due to pattern scanning
    expect(p50).toBeLessThan(200);
  });
});

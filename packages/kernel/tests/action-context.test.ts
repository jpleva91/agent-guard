import { describe, it, expect } from 'vitest';
import { normalizeToActionContext } from '@red-codes/kernel';
import type { RawAgentAction } from '@red-codes/kernel';

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
});

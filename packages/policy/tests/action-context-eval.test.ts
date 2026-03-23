import { describe, it, expect } from 'vitest';
import { evaluate } from '@red-codes/policy';
import type { LoadedPolicy } from '@red-codes/policy';
import type { ActionContext } from '@red-codes/core';

describe('Policy evaluator with ActionContext (KE-2)', () => {
  const allowFilePolicy: LoadedPolicy = {
    id: 'test-allow-file',
    name: 'Allow file ops',
    rules: [{ action: 'file.*', effect: 'allow' }],
    severity: 3,
  };

  const denyGitPushPolicy: LoadedPolicy = {
    id: 'test-deny-push',
    name: 'Deny push to main',
    rules: [
      {
        action: 'git.push',
        effect: 'deny',
        conditions: { branches: ['main'] },
        reason: 'Push to main not allowed',
      },
    ],
    severity: 5,
  };

  it('accepts ActionContext and allows matching file write', () => {
    const ctx: ActionContext = {
      action: 'file.write',
      actionClass: 'file',
      target: 'src/index.ts',
      actor: { agentId: 'claude-code:abc' },
      args: { filePath: 'src/index.ts', content: 'hello' },
      destructive: false,
      source: 'claude-code',
      normalizedAt: Date.now(),
      agent: 'claude-code:abc',
    };

    const result = evaluate(ctx, [allowFilePolicy]);

    expect(result.allowed).toBe(true);
    expect(result.decision).toBe('allow');
  });

  it('accepts ActionContext and denies git push to main', () => {
    const ctx: ActionContext = {
      action: 'git.push',
      actionClass: 'git',
      target: 'main',
      actor: { agentId: 'claude-code:abc' },
      args: { branch: 'main' },
      destructive: false,
      source: 'claude-code',
      normalizedAt: Date.now(),
      agent: 'claude-code:abc',
      branch: 'main',
    };

    const result = evaluate(ctx, [denyGitPushPolicy, allowFilePolicy]);

    expect(result.allowed).toBe(false);
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('Push to main not allowed');
  });

  it('uses ActionContext persona for persona-based policy rules', () => {
    const personaPolicy: LoadedPolicy = {
      id: 'test-persona',
      name: 'Restrict untrusted agents',
      rules: [
        {
          action: 'file.write',
          effect: 'deny',
          conditions: { persona: { trustTier: ['untrusted'] } },
          reason: 'Untrusted agents cannot write files',
        },
      ],
      severity: 4,
    };

    const ctx: ActionContext = {
      action: 'file.write',
      actionClass: 'file',
      target: 'src/data.ts',
      actor: { agentId: 'test-agent', persona: { trustTier: 'untrusted' } },
      args: { filePath: 'src/data.ts' },
      destructive: false,
      source: 'test-runtime',
      normalizedAt: Date.now(),
      agent: 'test-agent',
      persona: { trustTier: 'untrusted' },
    };

    const result = evaluate(ctx, [personaPolicy, allowFilePolicy]);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Untrusted agents cannot write files');
  });
});

// Tests for DeepAgents adapter
import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeDeepAgentsAction,
  deepAgentsToActionContext,
  formatDeepAgentsHookResponse,
  resolveDeepAgentsIdentity,
} from '@red-codes/adapters';
import type { DeepAgentsHookPayload } from '@red-codes/adapters';
import { createKernel } from '@red-codes/kernel';
import { resetActionCounter } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';

beforeEach(() => {
  resetActionCounter();
  resetEventCounter();
});

describe('resolveDeepAgentsIdentity', () => {
  it('returns "deepagents" when no sessionId', () => {
    expect(resolveDeepAgentsIdentity()).toBe('deepagents');
    expect(resolveDeepAgentsIdentity('')).toBe('deepagents');
  });

  it('returns "deepagents:<hash>" with a sessionId', () => {
    const result = resolveDeepAgentsIdentity('sess-abc-123');
    expect(result).toMatch(/^deepagents:[a-z0-9]+$/);
    expect(result).not.toBe('deepagents');
  });

  it('produces consistent hashes for the same session ID', () => {
    const a = resolveDeepAgentsIdentity('my-session');
    const b = resolveDeepAgentsIdentity('my-session');
    expect(a).toBe(b);
  });
});

describe('normalizeDeepAgentsAction', () => {
  it('normalizes write_file tool (file.write)', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'write_file',
      input: { path: 'src/test.ts', content: 'hello' },
    };
    const action = normalizeDeepAgentsAction(payload);
    expect(action.tool).toBe('Write');
    expect(action.file).toBe('src/test.ts');
    expect(action.content).toBe('hello');
    expect(action.agent).toBe('deepagents');
    expect(action.metadata).toMatchObject({ source: 'deepagents', hook: 'before' });
  });

  it('normalizes edit_file tool', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'edit_file',
      input: { path: 'src/test.ts', old_content: 'a', new_content: 'b' },
    };
    const action = normalizeDeepAgentsAction(payload);
    expect(action.tool).toBe('Edit');
    expect(action.file).toBe('src/test.ts');
    expect(action.content).toBe('b');
  });

  it('normalizes read_file tool (file.read)', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'read_file',
      input: { path: 'README.md' },
    };
    const action = normalizeDeepAgentsAction(payload);
    expect(action.tool).toBe('Read');
    expect(action.file).toBe('README.md');
  });

  it('normalizes delete_file tool (file.delete)', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'delete_file',
      input: { path: 'tmp/artifact.txt' },
    };
    const action = normalizeDeepAgentsAction(payload);
    expect(action.tool).toBe('Delete');
    expect(action.file).toBe('tmp/artifact.txt');
  });

  it('normalizes run_shell tool (Bash)', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'run_shell',
      input: { command: 'npm test' },
    };
    const action = normalizeDeepAgentsAction(payload);
    expect(action.tool).toBe('Bash');
    expect(action.command).toBe('npm test');
    expect(action.target).toBe('npm test');
  });

  it('normalizes bash alias tool', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'bash',
      input: { command: 'ls -la' },
    };
    const action = normalizeDeepAgentsAction(payload);
    expect(action.tool).toBe('Bash');
    expect(action.command).toBe('ls -la');
  });

  it('normalizes execute_command tool', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'execute_command',
      input: { command: 'git status' },
    };
    const action = normalizeDeepAgentsAction(payload);
    expect(action.tool).toBe('Bash');
    expect(action.command).toBe('git status');
  });

  it('normalizes list_directory tool (Glob)', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'list_directory',
      input: { path: 'src' },
    };
    const action = normalizeDeepAgentsAction(payload);
    expect(action.tool).toBe('Glob');
    expect(action.metadata).toMatchObject({ source: 'deepagents' });
  });

  it('normalizes search_files tool (Grep)', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'search_files',
      input: { query: 'TODO', path: 'src' },
    };
    const action = normalizeDeepAgentsAction(payload);
    expect(action.tool).toBe('Grep');
    expect(action.target).toBe('TODO');
  });

  it('normalizes spawn_subagent tool (Agent)', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'spawn_subagent',
      input: { task: 'Write unit tests for auth module' },
    };
    const action = normalizeDeepAgentsAction(payload);
    expect(action.tool).toBe('Agent');
    expect(action.metadata).toMatchObject({ source: 'deepagents' });
  });

  it('normalizes delegate_task tool (Agent)', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'delegate_task',
      input: { prompt: 'Analyze codebase' },
    };
    const action = normalizeDeepAgentsAction(payload);
    expect(action.tool).toBe('Agent');
    expect(action.target).toBe('Analyze codebase');
  });

  it('normalizes summarize tool (Agent)', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'summarize',
      input: { content: 'Long text to summarize...' },
    };
    const action = normalizeDeepAgentsAction(payload);
    expect(action.tool).toBe('Agent');
  });

  it('normalizes memory_store tool (Write)', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'memory_store',
      input: { key: 'context', value: 'important info' },
    };
    const action = normalizeDeepAgentsAction(payload);
    expect(action.tool).toBe('Write');
    expect(action.metadata).toMatchObject({ source: 'deepagents' });
  });

  it('normalizes memory_retrieve tool (Read)', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'memory_retrieve',
      input: { key: 'context' },
    };
    const action = normalizeDeepAgentsAction(payload);
    expect(action.tool).toBe('Read');
  });

  it('normalizes web_fetch tool (WebFetch)', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'web_fetch',
      input: { url: 'https://example.com' },
    };
    const action = normalizeDeepAgentsAction(payload);
    expect(action.tool).toBe('WebFetch');
    expect(action.target).toBe('https://example.com');
  });

  it('passes through unknown tool names', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'unknown_middleware_tool',
      input: {},
    };
    const action = normalizeDeepAgentsAction(payload);
    expect(action.tool).toBe('unknown_middleware_tool');
    expect(action.agent).toBe('deepagents');
  });

  it('includes sessionId in agent identity when provided', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'run_shell',
      input: { command: 'ls' },
      sessionId: 'test-session-42',
    };
    const action = normalizeDeepAgentsAction(payload);
    expect(action.agent).toMatch(/^deepagents:[a-z0-9]+$/);
  });
});

describe('formatDeepAgentsHookResponse', () => {
  it('returns empty string for allowed actions', () => {
    const kernel = createKernel({ runId: 'test', policyDefs: [], dryRun: true });
    const result = { allowed: true, decision: null };
    expect(
      formatDeepAgentsHookResponse(result as Parameters<typeof formatDeepAgentsHookResponse>[0])
    ).toBe('');
    kernel.shutdown();
  });

  it('returns JSON deny response for blocked actions', () => {
    const result = {
      allowed: false,
      decision: {
        decision: { reason: 'Protected branch' },
        violations: [],
      },
    };
    const response = formatDeepAgentsHookResponse(
      result as Parameters<typeof formatDeepAgentsHookResponse>[0]
    );
    const parsed = JSON.parse(response) as { decision: string; reason: string };
    expect(parsed.decision).toBe('deny');
    expect(parsed.reason).toContain('Protected branch');
  });

  it('includes violation names in deny response', () => {
    const result = {
      allowed: false,
      decision: {
        decision: { reason: 'Invariant triggered' },
        violations: [{ name: 'No Force Push', invariantId: 'no-force-push' }],
      },
    };
    const response = formatDeepAgentsHookResponse(
      result as Parameters<typeof formatDeepAgentsHookResponse>[0]
    );
    const parsed = JSON.parse(response) as { decision: string; reason: string };
    expect(parsed.reason).toContain('No Force Push');
  });

  it('returns empty string in educate mode (allow with stderr)', () => {
    const result = { allowed: false, decision: null };
    const suggestion = { message: 'Use a feature branch instead' };
    const response = formatDeepAgentsHookResponse(
      result as Parameters<typeof formatDeepAgentsHookResponse>[0],
      suggestion as Parameters<typeof formatDeepAgentsHookResponse>[1],
      { mode: 'educate' }
    );
    expect(response).toBe('');
  });

  it('returns guide mode response with correction info', () => {
    const result = {
      allowed: false,
      decision: { decision: { reason: 'Blocked by policy' }, violations: [] },
    };
    const suggestion = { message: 'Use git push origin HEAD:feat/branch' };
    const response = formatDeepAgentsHookResponse(
      result as Parameters<typeof formatDeepAgentsHookResponse>[0],
      suggestion as Parameters<typeof formatDeepAgentsHookResponse>[1],
      { mode: 'guide', retryAttempt: 1, maxRetries: 3 }
    );
    const parsed = JSON.parse(response) as { decision: string; reason: string };
    expect(parsed.decision).toBe('deny');
    expect(parsed.reason).toContain('Suggestion:');
  });
});

describe('DeepAgents adapter integration', () => {
  it('processDeepAgentsHook allows safe actions', async () => {
    const { processDeepAgentsHook } = await import('@red-codes/adapters');
    const kernel = createKernel({
      runId: 'test-run',
      policyDefs: [],
      dryRun: true,
      evaluateOptions: { defaultDeny: false },
    });

    const payload: DeepAgentsHookPayload = {
      tool: 'read_file',
      input: { path: 'README.md' },
    };

    const result = await processDeepAgentsHook(kernel, payload);
    expect(result.allowed).toBe(true);
    kernel.shutdown();
  });

  it('processDeepAgentsHook denies force push', async () => {
    const { processDeepAgentsHook } = await import('@red-codes/adapters');
    const kernel = createKernel({
      runId: 'test-run',
      policyDefs: [],
      dryRun: false,
    });

    const payload: DeepAgentsHookPayload = {
      tool: 'run_shell',
      input: { command: 'git push --force origin main' },
    };

    const result = await processDeepAgentsHook(kernel, payload);
    expect(result.allowed).toBe(false);
    kernel.shutdown();
  });

  it('deepAgentsToEnvelope wraps event with deepagents source', async () => {
    const { deepAgentsToEnvelope } = await import('@red-codes/adapters');
    const { createEvent } = await import('@red-codes/events');
    const event = createEvent('RunStarted', { runId: 'test-123', agentId: 'deepagents' });
    const envelope = deepAgentsToEnvelope(event);
    expect(envelope.source).toBe('deepagents');
    expect(envelope.event).toBe(event);
  });
});

describe('deepAgentsToActionContext — KE-2 adapter mapping', () => {
  it('converts a write_file payload to ActionContext', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'write_file',
      input: { path: 'src/index.ts', content: 'hello' },
      sessionId: 'session-abc',
    };

    const ctx = deepAgentsToActionContext(payload);

    expect(ctx.action).toBe('file.write');
    expect(ctx.actionClass).toBe('file');
    expect(ctx.target).toBe('src/index.ts');
    expect(ctx.source).toBe('deepagents');
    expect(ctx.args.filePath).toBe('src/index.ts');
    expect(ctx.args.content).toBe('hello');
    expect(ctx.actor.agentId).toMatch(/^deepagents/);
    expect(ctx.destructive).toBe(false);
    expect(typeof ctx.normalizedAt).toBe('number');
  });

  it('converts a run_shell payload with git push to ActionContext', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'run_shell',
      input: { command: 'git push origin feature-branch' },
    };

    const ctx = deepAgentsToActionContext(payload);

    expect(ctx.action).toBe('git.push');
    expect(ctx.actionClass).toBe('git');
    expect(ctx.branch).toBe('feature-branch');
    expect(ctx.args.branch).toBe('feature-branch');
    expect(ctx.source).toBe('deepagents');
  });

  it('converts a destructive shell command to ActionContext', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'run_shell',
      input: { command: 'rm -rf /tmp/data' },
    };

    const ctx = deepAgentsToActionContext(payload);

    expect(ctx.destructive).toBe(true);
    expect(ctx.actionClass).toBe('shell');
    expect(ctx.source).toBe('deepagents');
  });

  it('converts a read_file payload (file.read)', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'read_file',
      input: { path: 'README.md' },
    };

    const ctx = deepAgentsToActionContext(payload);

    expect(ctx.action).toBe('file.read');
    expect(ctx.actionClass).toBe('file');
    expect(ctx.target).toBe('README.md');
    expect(ctx.source).toBe('deepagents');
  });

  it('passes persona through to ActionContext', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'run_shell',
      input: { command: 'npm test' },
    };

    const ctx = deepAgentsToActionContext(payload, { trustTier: 'standard', role: 'developer' });

    expect(ctx.persona).toEqual({ trustTier: 'standard', role: 'developer' });
    expect(ctx.actor.persona).toEqual({ trustTier: 'standard', role: 'developer' });
  });

  it('produces NormalizedIntent-compatible output', () => {
    const payload: DeepAgentsHookPayload = {
      tool: 'write_file',
      input: { path: 'test.ts', content: 'data' },
    };

    const ctx = deepAgentsToActionContext(payload);

    expect(ctx).toHaveProperty('action');
    expect(ctx).toHaveProperty('target');
    expect(ctx).toHaveProperty('agent');
    expect(ctx).toHaveProperty('destructive');
    expect(ctx).toHaveProperty('actionClass');
    expect(ctx).toHaveProperty('actor');
    expect(ctx).toHaveProperty('args');
    expect(ctx).toHaveProperty('source');
    expect(ctx).toHaveProperty('normalizedAt');
  });
});

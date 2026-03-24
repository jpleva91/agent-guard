// Tests for Claude Code adapter
import { describe, it, expect } from 'vitest';
import {
  normalizeClaudeCodeAction,
  formatHookResponse,
  resolveAgentIdentity,
} from '@red-codes/adapters';
import type { ClaudeCodeHookPayload } from '@red-codes/adapters';
import { createKernel } from '@red-codes/kernel';
import { resetActionCounter } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';
import { beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

beforeEach(() => {
  resetActionCounter();
  resetEventCounter();
});

describe('normalizeClaudeCodeAction', () => {
  it('normalizes Write tool', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: 'src/test.ts', content: 'hello' },
    };
    const action = normalizeClaudeCodeAction(payload);
    expect(action.tool).toBe('Write');
    expect(action.file).toBe('src/test.ts');
    expect(action.agent).toBe('claude-code');
  });

  it('normalizes Edit tool', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: 'src/test.ts', old_string: 'a', new_string: 'b' },
    };
    const action = normalizeClaudeCodeAction(payload);
    expect(action.tool).toBe('Edit');
    expect(action.file).toBe('src/test.ts');
  });

  it('normalizes Bash tool', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    };
    const action = normalizeClaudeCodeAction(payload);
    expect(action.tool).toBe('Bash');
    expect(action.command).toBe('npm test');
  });

  it('normalizes Bash with git push', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git push origin main' },
    };
    const action = normalizeClaudeCodeAction(payload);
    expect(action.tool).toBe('Bash');
    expect(action.command).toBe('git push origin main');
  });

  it('normalizes Read tool', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'README.md' },
    };
    const action = normalizeClaudeCodeAction(payload);
    expect(action.tool).toBe('Read');
    expect(action.file).toBe('README.md');
  });

  it('normalizes unknown tool gracefully', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'SomeUnknownTool',
      tool_input: { data: 'test' },
    };
    const action = normalizeClaudeCodeAction(payload);
    expect(action.tool).toBe('SomeUnknownTool');
    expect(action.agent).toBe('claude-code');
  });

  it('normalizes NotebookEdit tool', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'NotebookEdit',
      tool_input: { notebook_path: '/tmp/notebook.ipynb', cell_id: 'abc' },
    };
    const action = normalizeClaudeCodeAction(payload);
    expect(action.tool).toBe('NotebookEdit');
    expect(action.file).toBe('/tmp/notebook.ipynb');
    expect(action.metadata).toHaveProperty('cell_id', 'abc');
  });

  it('normalizes TodoWrite tool', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'TodoWrite',
      tool_input: { todos: [{ content: 'task', status: 'pending' }] },
    };
    const action = normalizeClaudeCodeAction(payload);
    expect(action.tool).toBe('TodoWrite');
    expect(action.metadata).toHaveProperty('todos');
  });

  it('normalizes WebFetch tool', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'WebFetch',
      tool_input: { url: 'https://example.com', prompt: 'summarize' },
    };
    const action = normalizeClaudeCodeAction(payload);
    expect(action.tool).toBe('WebFetch');
    expect(action.target).toBe('https://example.com');
  });

  it('normalizes WebSearch tool', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'WebSearch',
      tool_input: { query: 'typescript best practices' },
    };
    const action = normalizeClaudeCodeAction(payload);
    expect(action.tool).toBe('WebSearch');
    expect(action.target).toBe('typescript best practices');
  });

  it('normalizes Agent tool with truncated prompt', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Agent',
      tool_input: { prompt: 'a'.repeat(200) },
    };
    const action = normalizeClaudeCodeAction(payload);
    expect(action.tool).toBe('Agent');
    expect(action.target).toHaveLength(100);
  });

  it('normalizes Skill tool', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Skill',
      tool_input: { skill: 'commit', args: '-m "fix"' },
    };
    const action = normalizeClaudeCodeAction(payload);
    expect(action.tool).toBe('Skill');
    expect(action.target).toBe('commit');
    expect(action.metadata).toHaveProperty('skill', 'commit');
  });
});

describe('resolveAgentIdentity', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AGENTGUARD_AGENT_NAME;
    delete process.env.AGENTGUARD_WORKSPACE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('identity file takes precedence over env var', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'ag-test-'));
    writeFileSync(join(tmpDir, '.agentguard-identity'), 'file-identity');
    process.env.AGENTGUARD_WORKSPACE = tmpDir;
    process.env.AGENTGUARD_AGENT_NAME = 'env-identity';
    expect(resolveAgentIdentity('session-123')).toBe('file-identity');
    rmSync(tmpDir, { recursive: true });
  });

  it('returns env var AGENTGUARD_AGENT_NAME when set', () => {
    process.env.AGENTGUARD_AGENT_NAME = 'claude:opus:jared';
    expect(resolveAgentIdentity('some-session')).toBe('claude:opus:jared');
  });

  it('env var takes precedence over session hash', () => {
    process.env.AGENTGUARD_AGENT_NAME = 'swarm-agent';
    const result = resolveAgentIdentity('session-123');
    expect(result).toBe('swarm-agent');
    expect(result).not.toMatch(/^claude-code:/);
  });

  it('falls back to session hash when no identity configured', () => {
    const identity = resolveAgentIdentity('abc123');
    expect(identity).toMatch(/^claude-code:[a-z0-9]+$/);
    expect(identity).not.toBe('claude-code');
  });

  it('returns claude-code when no session_id and no identity', () => {
    expect(resolveAgentIdentity()).toBe('claude-code');
    expect(resolveAgentIdentity(undefined)).toBe('claude-code');
  });

  it('returns claude-code for empty or whitespace session_id', () => {
    expect(resolveAgentIdentity('')).toBe('claude-code');
    expect(resolveAgentIdentity('   ')).toBe('claude-code');
  });

  it('produces consistent hash for same session_id', () => {
    const a = resolveAgentIdentity('session-xyz');
    const b = resolveAgentIdentity('session-xyz');
    expect(a).toBe(b);
  });

  it('produces different hashes for different session_ids', () => {
    const a = resolveAgentIdentity('session-1');
    const b = resolveAgentIdentity('session-2');
    expect(a).not.toBe(b);
  });
});

describe('normalizeClaudeCodeAction — session_id propagation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AGENTGUARD_AGENT_NAME;
    delete process.env.AGENTGUARD_WORKSPACE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses session_id for agent identity when provided', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: 'test.ts', content: 'hello' },
      session_id: 'sess-abc123',
    };
    const action = normalizeClaudeCodeAction(payload);
    expect(action.agent).toMatch(/^claude-code:[a-z0-9]+$/);
    expect(action.agent).not.toBe('claude-code');
  });

  it('falls back to claude-code without session_id', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: 'test.ts', content: 'hello' },
    };
    const action = normalizeClaudeCodeAction(payload);
    expect(action.agent).toBe('claude-code');
  });

  it('propagates session_id in metadata', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      session_id: 'sess-xyz',
    };
    const action = normalizeClaudeCodeAction(payload);
    expect(action.metadata).toHaveProperty('sessionId', 'sess-xyz');
  });

  it('propagates session identity through all tool types', () => {
    const tools = [
      'Write',
      'Edit',
      'Read',
      'Bash',
      'Glob',
      'Grep',
      'NotebookEdit',
      'TodoWrite',
      'WebFetch',
      'WebSearch',
      'Agent',
      'Skill',
    ];
    for (const tool of tools) {
      const payload: ClaudeCodeHookPayload = {
        hook: 'PreToolUse',
        tool_name: tool,
        tool_input: {},
        session_id: 'consistent-session',
      };
      const action = normalizeClaudeCodeAction(payload);
      expect(action.agent).toMatch(/^claude-code:[a-z0-9]+$/);
    }
  });
});

describe('Integration: session_id through kernel pipeline', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AGENTGUARD_AGENT_NAME;
    delete process.env.AGENTGUARD_WORKSPACE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('decision record shows session-derived agent identity', async () => {
    const kernel = createKernel({ dryRun: true, evaluateOptions: { defaultDeny: false } });
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'src/index.ts' },
      session_id: 'session-42',
    };
    const rawAction = normalizeClaudeCodeAction(payload);
    const result = await kernel.propose(rawAction);
    expect(result.allowed).toBe(true);
    expect(result.decisionRecord?.action.agent).toMatch(/^claude-code:[a-z0-9]+$/);
    expect(result.decisionRecord?.action.agent).not.toBe('claude-code');
  });

  it('events include session-derived agentId', async () => {
    const kernel = createKernel({ dryRun: true });
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'src/index.ts' },
      session_id: 'session-99',
    };
    const rawAction = normalizeClaudeCodeAction(payload);
    const result = await kernel.propose(rawAction);
    const requestedEvent = result.events.find((e) => e.kind === 'ActionRequested');
    expect(requestedEvent).toBeDefined();
    expect((requestedEvent as Record<string, unknown>).agentId).toMatch(/^claude-code:[a-z0-9]+$/);
  });
});

describe('Integration: Claude Code → Kernel', () => {
  it('allows benign file read through kernel', async () => {
    const kernel = createKernel({ dryRun: true, evaluateOptions: { defaultDeny: false } });
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'src/index.ts' },
    };
    const rawAction = normalizeClaudeCodeAction(payload);
    const result = await kernel.propose(rawAction);
    expect(result.allowed).toBe(true);
  });

  it('denies destructive command through kernel', async () => {
    const kernel = createKernel({ dryRun: true });
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /' },
    };
    const rawAction = normalizeClaudeCodeAction(payload);
    const result = await kernel.propose(rawAction);
    expect(result.allowed).toBe(false);
  });

  it('denies git push to main with policy', async () => {
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [
        {
          id: 'protect-main',
          name: 'Protect Main',
          rules: [{ action: 'git.push', effect: 'deny', reason: 'Protected branch' }],
          severity: 4,
        },
      ],
    });
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git push origin main' },
    };
    const rawAction = normalizeClaudeCodeAction(payload);
    const result = await kernel.propose(rawAction);
    expect(result.allowed).toBe(false);
  });
});

describe('formatHookResponse', () => {
  it('returns empty string for allowed actions', async () => {
    const kernel = createKernel({ dryRun: true, evaluateOptions: { defaultDeny: false } });
    const result = await kernel.propose({
      tool: 'Read',
      file: 'test.ts',
      agent: 'test',
    });
    expect(formatHookResponse(result)).toBe('');
  });

  it('returns JSON error for denied actions', async () => {
    const kernel = createKernel({ dryRun: true });
    const result = await kernel.propose({
      tool: 'Bash',
      command: 'rm -rf /',
      agent: 'test',
    });
    const response = formatHookResponse(result);
    const parsed = JSON.parse(response);
    expect(parsed).toHaveProperty('hookSpecificOutput');
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('Destructive command');
  });
});

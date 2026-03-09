// Tests for Claude Code adapter
import { describe, it, expect } from 'vitest';
import {
  normalizeClaudeCodeAction,
  formatHookResponse,
  resolveAgentIdentity,
} from '../../src/adapters/claude-code.js';
import type { ClaudeCodeHookPayload } from '../../src/adapters/claude-code.js';
import { createKernel } from '../../src/kernel/kernel.js';
import { resetActionCounter } from '../../src/core/actions.js';
import { resetEventCounter } from '../../src/events/schema.js';
import { beforeEach } from 'vitest';

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
      tool_name: 'Agent',
      tool_input: { prompt: 'do something' },
    };
    const action = normalizeClaudeCodeAction(payload);
    expect(action.tool).toBe('Agent');
    expect(action.agent).toBe('claude-code');
  });
});

describe('resolveAgentIdentity', () => {
  it('returns claude-code when no session_id', () => {
    expect(resolveAgentIdentity()).toBe('claude-code');
    expect(resolveAgentIdentity(undefined)).toBe('claude-code');
  });

  it('returns claude-code for empty or whitespace session_id', () => {
    expect(resolveAgentIdentity('')).toBe('claude-code');
    expect(resolveAgentIdentity('   ')).toBe('claude-code');
  });

  it('returns claude-code:<hash> for valid session_id', () => {
    const identity = resolveAgentIdentity('abc123');
    expect(identity).toMatch(/^claude-code:[a-z0-9]+$/);
    expect(identity).not.toBe('claude-code');
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
    const tools = ['Write', 'Edit', 'Read', 'Bash', 'Glob', 'Grep', 'Agent'];
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
  it('decision record shows session-derived agent identity', async () => {
    const kernel = createKernel({ dryRun: true });
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
    const requestedEvent = result.events.find(
      (e) => e.kind === 'ActionRequested'
    );
    expect(requestedEvent).toBeDefined();
    expect((requestedEvent as Record<string, unknown>).agentId).toMatch(
      /^claude-code:[a-z0-9]+$/
    );
  });
});

describe('Integration: Claude Code → Kernel', () => {
  it('allows benign file read through kernel', async () => {
    const kernel = createKernel({ dryRun: true });
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
    const kernel = createKernel({ dryRun: true });
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
    expect(response).toContain('DENIED');
    expect(JSON.parse(response)).toHaveProperty('error');
  });
});

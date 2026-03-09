// Tests for Claude Code adapter
import { describe, it, expect } from 'vitest';
import {
  normalizeClaudeCodeAction,
  formatHookResponse,
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

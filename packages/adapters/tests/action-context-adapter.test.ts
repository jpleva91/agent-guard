import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { toActionContext } from '@red-codes/adapters';
import type { ClaudeCodeHookPayload } from '@red-codes/adapters';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('toActionContext — Claude Code adapter (KE-2)', () => {
  const originalEnv = process.env;
  let isolationDir: string;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AGENTGUARD_AGENT_NAME;
    isolationDir = mkdtempSync(join(tmpdir(), 'ag-test-'));
    process.env.AGENTGUARD_WORKSPACE = isolationDir;
  });

  afterEach(() => {
    process.env = originalEnv;
    try { rmSync(isolationDir, { recursive: true }); } catch { /* ok */ }
  });
  it('converts a Write tool payload to ActionContext', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: 'src/index.ts', content: 'hello' },
      session_id: 'session-abc-123',
    };

    const ctx = toActionContext(payload);

    expect(ctx.action).toBe('file.write');
    expect(ctx.actionClass).toBe('file');
    expect(ctx.target).toBe('src/index.ts');
    expect(ctx.source).toBe('claude-code');
    expect(ctx.args.filePath).toBe('src/index.ts');
    expect(ctx.args.content).toBe('hello');
    expect(ctx.actor.agentId).toMatch(/^claude-code/);
    expect(ctx.actor.sessionId).toBe('session-abc-123');
    expect(ctx.destructive).toBe(false);
  });

  it('converts a Bash tool payload with git push', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git push origin main' },
    };

    const ctx = toActionContext(payload);

    expect(ctx.action).toBe('git.push');
    expect(ctx.actionClass).toBe('git');
    expect(ctx.branch).toBe('main');
    expect(ctx.args.branch).toBe('main');
    expect(ctx.source).toBe('claude-code');
  });

  it('converts a destructive Bash command', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /tmp/data' },
    };

    const ctx = toActionContext(payload);

    expect(ctx.destructive).toBe(true);
    expect(ctx.actionClass).toBe('shell');
    expect(ctx.source).toBe('claude-code');
  });

  it('converts a Read tool payload', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'README.md' },
    };

    const ctx = toActionContext(payload);

    expect(ctx.action).toBe('file.read');
    expect(ctx.actionClass).toBe('file');
    expect(ctx.target).toBe('README.md');
  });

  it('converts an Edit tool payload', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: 'src/main.ts', old_string: 'a', new_string: 'b' },
    };

    const ctx = toActionContext(payload);

    expect(ctx.action).toBe('file.write');
    expect(ctx.actionClass).toBe('file');
    expect(ctx.target).toBe('src/main.ts');
    expect(ctx.args.content).toBe('b');
  });

  it('passes persona through to ActionContext', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    };

    const ctx = toActionContext(payload, { trustTier: 'elevated', role: 'ops' });

    expect(ctx.persona).toEqual({ trustTier: 'elevated', role: 'ops' });
    expect(ctx.actor.persona).toEqual({ trustTier: 'elevated', role: 'ops' });
  });

  it('produces NormalizedIntent-compatible output', () => {
    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: 'test.ts', content: 'data' },
    };

    const ctx = toActionContext(payload);

    // Verify all NormalizedIntent required fields are present
    expect(ctx).toHaveProperty('action');
    expect(ctx).toHaveProperty('target');
    expect(ctx).toHaveProperty('agent');
    expect(ctx).toHaveProperty('destructive');
    // Verify ActionContext-specific fields
    expect(ctx).toHaveProperty('actionClass');
    expect(ctx).toHaveProperty('actor');
    expect(ctx).toHaveProperty('args');
    expect(ctx).toHaveProperty('source');
    expect(ctx).toHaveProperty('normalizedAt');
  });
});

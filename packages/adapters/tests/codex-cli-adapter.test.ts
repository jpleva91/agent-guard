// Tests for Codex CLI adapter
import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeCodexCliAction,
  codexToActionContext,
  formatCodexHookResponse,
  resolveCodexAgentIdentity,
  codexCliToEnvelope,
} from '@red-codes/adapters';
import type { CodexCliHookPayload } from '@red-codes/adapters';
import { createKernel } from '@red-codes/kernel';
import { resetActionCounter } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';

beforeEach(() => {
  resetActionCounter();
  resetEventCounter();
});

// ─── resolveCodexAgentIdentity ────────────────────────────────────────────────

describe('resolveCodexAgentIdentity', () => {
  it('returns codex-cli when no session ID provided', () => {
    expect(resolveCodexAgentIdentity()).toBe('codex-cli');
    expect(resolveCodexAgentIdentity(undefined)).toBe('codex-cli');
  });

  it('returns codex-cli for empty or whitespace session ID', () => {
    expect(resolveCodexAgentIdentity('')).toBe('codex-cli');
    expect(resolveCodexAgentIdentity('   ')).toBe('codex-cli');
  });

  it('returns codex-cli:<hash> for a valid session ID', () => {
    const identity = resolveCodexAgentIdentity('abc123');
    expect(identity).toMatch(/^codex-cli:[a-z0-9]+$/);
    expect(identity).not.toBe('codex-cli');
  });

  it('produces consistent hashes for the same session ID', () => {
    const a = resolveCodexAgentIdentity('session-xyz');
    const b = resolveCodexAgentIdentity('session-xyz');
    expect(a).toBe(b);
  });

  it('produces different hashes for different session IDs', () => {
    const a = resolveCodexAgentIdentity('session-1');
    const b = resolveCodexAgentIdentity('session-2');
    expect(a).not.toBe(b);
  });

  it('trims whitespace before hashing', () => {
    const trimmed = resolveCodexAgentIdentity('session-abc');
    const padded = resolveCodexAgentIdentity('  session-abc  ');
    expect(trimmed).toBe(padded);
  });
});

// ─── normalizeCodexCliAction — tool mapping ───────────────────────────────────

describe('normalizeCodexCliAction', () => {
  it('normalizes Write tool (file.write)', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'Write',
      toolArgs: JSON.stringify({ file_path: 'src/test.ts', content: 'hello world' }),
    };
    const action = normalizeCodexCliAction(payload);
    expect(action.tool).toBe('Write');
    expect(action.file).toBe('src/test.ts');
    expect(action.content).toBe('hello world');
    expect(action.agent).toBe('codex-cli');
    expect(action.metadata).toHaveProperty('hook', 'PreToolUse');
    expect(action.metadata).toHaveProperty('source', 'codex-cli');
  });

  it('normalizes Edit tool (file.edit)', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'Edit',
      toolArgs: JSON.stringify({ file_path: 'src/test.ts', old_string: 'foo', new_string: 'bar' }),
    };
    const action = normalizeCodexCliAction(payload);
    expect(action.tool).toBe('Edit');
    expect(action.file).toBe('src/test.ts');
    expect(action.content).toBe('bar');
    expect(action.metadata).toHaveProperty('old_string', 'foo');
    expect(action.metadata).toHaveProperty('source', 'codex-cli');
  });

  it('normalizes Read tool (file.read)', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'Read',
      toolArgs: JSON.stringify({ file_path: 'README.md' }),
    };
    const action = normalizeCodexCliAction(payload);
    expect(action.tool).toBe('Read');
    expect(action.file).toBe('README.md');
    expect(action.agent).toBe('codex-cli');
  });

  it('normalizes Bash tool', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'Bash',
      toolArgs: JSON.stringify({ command: 'npm test', description: 'run tests' }),
    };
    const action = normalizeCodexCliAction(payload);
    expect(action.tool).toBe('Bash');
    expect(action.command).toBe('npm test');
    expect(action.target).toBe('npm test');
    expect(action.metadata).toHaveProperty('source', 'codex-cli');
    expect(action.metadata).toHaveProperty('description', 'run tests');
  });

  it('truncates long Bash commands for target field', () => {
    const longCommand = 'x'.repeat(200);
    const payload: CodexCliHookPayload = {
      toolName: 'Bash',
      toolArgs: JSON.stringify({ command: longCommand }),
    };
    const action = normalizeCodexCliAction(payload);
    expect(action.tool).toBe('Bash');
    expect(action.command).toBe(longCommand);
    expect((action.target as string).length).toBeLessThanOrEqual(100);
  });

  it('normalizes Glob tool', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'Glob',
      toolArgs: JSON.stringify({ pattern: '**/*.ts', path: 'src' }),
    };
    const action = normalizeCodexCliAction(payload);
    expect(action.tool).toBe('Glob');
    expect(action.target).toBe('**/*.ts');
    expect(action.metadata).toHaveProperty('path', 'src');
  });

  it('normalizes Grep tool', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'Grep',
      toolArgs: JSON.stringify({ pattern: 'TODO', path: 'src' }),
    };
    const action = normalizeCodexCliAction(payload);
    expect(action.tool).toBe('Grep');
    expect(action.target).toBe('TODO');
    expect(action.metadata).toHaveProperty('path', 'src');
  });

  it('normalizes WebFetch tool', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'WebFetch',
      toolArgs: JSON.stringify({ url: 'https://example.com', prompt: 'summarize' }),
    };
    const action = normalizeCodexCliAction(payload);
    expect(action.tool).toBe('WebFetch');
    expect(action.target).toBe('https://example.com');
    expect(action.metadata).toHaveProperty('prompt', 'summarize');
  });

  it('normalizes Agent tool', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'Agent',
      toolArgs: JSON.stringify({ prompt: 'Write a test for me' }),
    };
    const action = normalizeCodexCliAction(payload);
    expect(action.tool).toBe('Agent');
    expect(action.target).toBe('Write a test for me');
    expect(action.metadata).toHaveProperty('prompt', 'Write a test for me');
  });

  it('truncates long Agent prompt for target field', () => {
    const longPrompt = 'p'.repeat(200);
    const payload: CodexCliHookPayload = {
      toolName: 'Agent',
      toolArgs: JSON.stringify({ prompt: longPrompt }),
    };
    const action = normalizeCodexCliAction(payload);
    expect((action.target as string).length).toBeLessThanOrEqual(100);
  });

  it('normalizes unknown tool with passthrough', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'CustomTool',
      toolArgs: JSON.stringify({ someArg: 'value' }),
    };
    const action = normalizeCodexCliAction(payload);
    expect(action.tool).toBe('CustomTool');
    expect(action.agent).toBe('codex-cli');
    expect(action.metadata).toHaveProperty('source', 'codex-cli');
  });

  it('sets agent identity from sessionId field', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'Read',
      toolArgs: JSON.stringify({ file_path: 'foo.ts' }),
      sessionId: 'my-session-42',
    };
    const action = normalizeCodexCliAction(payload);
    expect(action.agent).toMatch(/^codex-cli:[a-z0-9]+$/);
    expect(action.metadata).toHaveProperty('sessionId', 'my-session-42');
  });

  it('attaches persona when provided', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'Read',
      toolArgs: JSON.stringify({ file_path: 'foo.ts' }),
    };
    const action = normalizeCodexCliAction(payload, { trustTier: 'elevated', role: 'ops' });
    expect((action as { persona?: unknown }).persona).toEqual({ trustTier: 'elevated', role: 'ops' });
  });

  it('handles missing toolArgs gracefully', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'Read',
    };
    const action = normalizeCodexCliAction(payload);
    expect(action.tool).toBe('Read');
    expect(action.file).toBeUndefined();
    expect(action.agent).toBe('codex-cli');
  });

  it('handles malformed toolArgs JSON gracefully', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'Bash',
      toolArgs: 'not-valid-json{{{',
    };
    const action = normalizeCodexCliAction(payload);
    expect(action.tool).toBe('Bash');
    expect(action.command).toBeUndefined();
    expect(action.agent).toBe('codex-cli');
  });

  it('handles toolArgs that is a JSON non-object (e.g. string) gracefully', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'Bash',
      toolArgs: JSON.stringify('just a string'),
    };
    const action = normalizeCodexCliAction(payload);
    expect(action.tool).toBe('Bash');
    expect(action.command).toBeUndefined();
  });
});

// ─── normalizeFilePath — path normalization (via normalizeCodexCliAction) ──────

describe('normalizeCodexCliAction — file path normalization', () => {
  it('passes through relative paths unchanged', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'Write',
      toolArgs: JSON.stringify({ file_path: 'src/foo.ts', content: '' }),
    };
    const action = normalizeCodexCliAction(payload);
    expect(action.file).toBe('src/foo.ts');
  });

  it('normalizes Windows-style backslashes to forward slashes', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'Write',
      toolArgs: JSON.stringify({ file_path: 'src\\foo\\bar.ts', content: '' }),
    };
    const action = normalizeCodexCliAction(payload);
    // Should not contain backslashes after normalization
    expect(action.file).not.toContain('\\');
  });

  it('strips cwd prefix from absolute paths', () => {
    const cwd = process.cwd().replace(/\\/g, '/');
    const payload: CodexCliHookPayload = {
      toolName: 'Write',
      toolArgs: JSON.stringify({ file_path: `${cwd}/src/foo.ts`, content: '' }),
    };
    const action = normalizeCodexCliAction(payload);
    expect(action.file).toBe('src/foo.ts');
  });

  it('falls back to basename for absolute paths outside cwd', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'Read',
      toolArgs: JSON.stringify({ file_path: '/etc/passwd' }),
    };
    const action = normalizeCodexCliAction(payload);
    // Should at least be a non-empty string (basename)
    expect(action.file).toBeTruthy();
    expect(action.file).not.toContain('/etc');
  });
});

// ─── codexToActionContext — KE-2 adapter mapping ──────────────────────────────

describe('codexToActionContext — KE-2 adapter mapping', () => {
  it('converts a Write tool payload to ActionContext', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'Write',
      toolArgs: JSON.stringify({ file_path: 'src/index.ts', content: 'hello' }),
      sessionId: 'session-abc',
    };

    const ctx = codexToActionContext(payload);

    expect(ctx.action).toBe('file.write');
    expect(ctx.actionClass).toBe('file');
    expect(ctx.target).toBe('src/index.ts');
    expect(ctx.source).toBe('codex-cli');
    expect(ctx.args.filePath).toBe('src/index.ts');
    expect(ctx.args.content).toBe('hello');
    expect(ctx.actor.agentId).toMatch(/^codex-cli/);
    expect(ctx.destructive).toBe(false);
    expect(typeof ctx.normalizedAt).toBe('number');
  });

  it('converts a Bash tool with git push to ActionContext', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'Bash',
      toolArgs: JSON.stringify({ command: 'git push origin feature-branch' }),
    };

    const ctx = codexToActionContext(payload);

    expect(ctx.action).toBe('git.push');
    expect(ctx.actionClass).toBe('git');
    expect(ctx.branch).toBe('feature-branch');
    expect(ctx.source).toBe('codex-cli');
  });

  it('converts a destructive Bash command to ActionContext', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'Bash',
      toolArgs: JSON.stringify({ command: 'rm -rf /tmp/data' }),
    };

    const ctx = codexToActionContext(payload);

    expect(ctx.destructive).toBe(true);
    expect(ctx.actionClass).toBe('shell');
    expect(ctx.source).toBe('codex-cli');
  });

  it('converts a Read tool payload (file.read)', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'Read',
      toolArgs: JSON.stringify({ file_path: 'README.md' }),
    };

    const ctx = codexToActionContext(payload);

    expect(ctx.action).toBe('file.read');
    expect(ctx.actionClass).toBe('file');
    expect(ctx.target).toBe('README.md');
    expect(ctx.source).toBe('codex-cli');
  });

  it('passes persona through to ActionContext', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'Bash',
      toolArgs: JSON.stringify({ command: 'npm test' }),
    };

    const ctx = codexToActionContext(payload, { trustTier: 'elevated', role: 'ops' });

    expect(ctx.persona).toEqual({ trustTier: 'elevated', role: 'ops' });
    expect(ctx.actor.persona).toEqual({ trustTier: 'elevated', role: 'ops' });
  });

  it('produces NormalizedIntent-compatible output shape', () => {
    const payload: CodexCliHookPayload = {
      toolName: 'Write',
      toolArgs: JSON.stringify({ file_path: 'test.ts', content: 'data' }),
    };

    const ctx = codexToActionContext(payload);

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

// ─── formatCodexHookResponse ──────────────────────────────────────────────────

describe('formatCodexHookResponse', () => {
  it('returns empty string for allowed actions', async () => {
    const kernel = createKernel({ dryRun: true, evaluateOptions: { defaultDeny: false } });
    const result = await kernel.propose({
      tool: 'Read',
      file: 'test.ts',
      agent: 'test',
    });
    expect(formatCodexHookResponse(result)).toBe('');
  });

  it('returns JSON with permissionDecision: deny for denied actions', async () => {
    const kernel = createKernel({ dryRun: true });
    const result = await kernel.propose({
      tool: 'Bash',
      command: 'rm -rf /',
      agent: 'test',
    });
    const response = formatCodexHookResponse(result);
    const parsed = JSON.parse(response);
    expect(parsed.permissionDecision).toBe('deny');
    expect(typeof parsed.permissionDecisionReason).toBe('string');
    expect(parsed.permissionDecisionReason.length).toBeGreaterThan(0);
  });

  it('includes violation names in deny reason', async () => {
    const kernel = createKernel({ dryRun: true });
    const result = await kernel.propose({
      tool: 'Bash',
      command: 'rm -rf /',
      agent: 'test',
    });
    const response = formatCodexHookResponse(result);
    const parsed = JSON.parse(response);
    // The reason should reference violations
    expect(parsed.permissionDecisionReason).toMatch(/Violations:|Destructive/i);
  });

  it('guide mode returns deny with suggestion when action is blocked', async () => {
    const kernel = createKernel({ dryRun: true });
    const result = await kernel.propose({
      tool: 'Bash',
      command: 'rm -rf /important',
      agent: 'test',
    });
    const response = formatCodexHookResponse(result, { message: 'Use a safer command' }, { mode: 'guide' });
    const parsed = JSON.parse(response);
    expect(parsed.permissionDecision).toBe('deny');
    expect(parsed.permissionDecisionReason).toContain('Use a safer command');
  });

  it('guide mode hard-blocks after retry exhaustion', async () => {
    const kernel = createKernel({ dryRun: true });
    const result = await kernel.propose({
      tool: 'Bash',
      command: 'rm -rf /',
      agent: 'test',
    });
    const response = formatCodexHookResponse(result, null, {
      mode: 'guide',
      retryAttempt: 5,
      maxRetries: 3,
    });
    const parsed = JSON.parse(response);
    expect(parsed.permissionDecision).toBe('deny');
    expect(parsed.permissionDecisionReason).toContain('ask the human for help');
  });

  it('educate mode returns empty string (allow) and writes to stderr', async () => {
    const kernel = createKernel({ dryRun: true, evaluateOptions: { defaultDeny: false } });
    const result = await kernel.propose({
      tool: 'Read',
      file: 'src/index.ts',
      agent: 'test',
    });
    // educate mode with a suggestion — should allow (return empty)
    const response = formatCodexHookResponse(
      result,
      { message: 'Consider using a read-only API', correctedCommand: 'cat src/index.ts' },
      { mode: 'educate' }
    );
    expect(response).toBe('');
  });
});

// ─── kernel integration via normalizeCodexCliAction ──────────────────────────

describe('normalizeCodexCliAction — kernel integration', () => {
  it('denied action has correct agent identity in decision record', async () => {
    const kernel = createKernel({
      dryRun: true,
      policy: {
        id: 'test-policy',
        name: 'Test',
        rules: [{ action: 'git.push', effect: 'deny', reason: 'Protected branch' }],
        severity: 4,
      },
    });
    const payload: CodexCliHookPayload = {
      toolName: 'Bash',
      toolArgs: JSON.stringify({ command: 'git push origin main' }),
    };
    const rawAction = normalizeCodexCliAction(payload);
    const result = await kernel.propose(rawAction);
    expect(result.allowed).toBe(false);
  });

  it('decision record shows codex-cli agent identity with session hash', async () => {
    const kernel = createKernel({ dryRun: true, evaluateOptions: { defaultDeny: false } });
    const payload: CodexCliHookPayload = {
      toolName: 'Read',
      toolArgs: JSON.stringify({ file_path: 'src/index.ts' }),
      sessionId: 'session-42',
    };
    const rawAction = normalizeCodexCliAction(payload);
    const result = await kernel.propose(rawAction);
    expect(result.allowed).toBe(true);
    expect(result.decisionRecord?.action.agent).toMatch(/^codex-cli:[a-z0-9]+$/);
  });
});

// ─── codexCliToEnvelope — KE-3 envelope production ───────────────────────────

describe('codexCliToEnvelope — KE-3 envelope production', () => {
  it('wraps a DomainEvent with source: codex-cli', () => {
    const fakeEvent = {
      kind: 'ActionRequested' as const,
      runId: 'r1',
      actionId: 'a1',
      ts: Date.now(),
      payload: {},
    };
    const envelope = codexCliToEnvelope(fakeEvent as Parameters<typeof codexCliToEnvelope>[0]);
    expect(envelope.source).toBe('codex-cli');
    expect(envelope.event).toBe(fakeEvent);
  });

  it('propagates policyVersion into envelope', () => {
    const fakeEvent = {
      kind: 'ActionAllowed' as const,
      runId: 'r1',
      actionId: 'a1',
      ts: Date.now(),
      payload: {},
    };
    const envelope = codexCliToEnvelope(fakeEvent as Parameters<typeof codexCliToEnvelope>[0], {
      policyVersion: '2.0.0',
    });
    expect(envelope.policyVersion).toBe('2.0.0');
  });

  it('propagates decisionCodes into envelope', () => {
    const fakeEvent = {
      kind: 'ActionDenied' as const,
      runId: 'r1',
      actionId: 'a1',
      ts: Date.now(),
      payload: {},
    };
    const envelope = codexCliToEnvelope(fakeEvent as Parameters<typeof codexCliToEnvelope>[0], {
      decisionCodes: ['RC_DESTRUCTIVE_FILESYSTEM', 'RC_BLAST_RADIUS'],
    });
    expect(envelope.decisionCodes).toContain('RC_DESTRUCTIVE_FILESYSTEM');
    expect(envelope.decisionCodes).toContain('RC_BLAST_RADIUS');
  });

  it('produces null policyVersion when not provided', () => {
    const fakeEvent = {
      kind: 'ActionRequested' as const,
      runId: 'r1',
      actionId: 'a1',
      ts: Date.now(),
      payload: {},
    };
    const envelope = codexCliToEnvelope(fakeEvent as Parameters<typeof codexCliToEnvelope>[0]);
    expect(envelope.policyVersion == null).toBe(true);
  });
});

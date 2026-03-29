// Tests for Copilot CLI adapter
import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeCopilotCliAction,
  copilotToActionContext,
  formatCopilotHookResponse,
  resolveCopilotAgentIdentity,
} from '@red-codes/adapters';
import type { CopilotCliHookPayload } from '@red-codes/adapters';
import { createKernel } from '@red-codes/kernel';
import { resetActionCounter } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';

beforeEach(() => {
  resetActionCounter();
  resetEventCounter();
});

describe('normalizeCopilotCliAction', () => {
  it('normalizes create tool (file.write)', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'create',
      toolArgs: JSON.stringify({ file_path: 'src/test.ts', content: 'hello' }),
    };
    const action = normalizeCopilotCliAction(payload);
    expect(action.tool).toBe('Write');
    expect(action.file).toBe('src/test.ts');
    expect(action.content).toBe('hello');
    expect(action.agent).toBe('copilot-cli');
  });

  it('normalizes edit tool', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'edit',
      toolArgs: JSON.stringify({ file_path: 'src/test.ts', old_string: 'a', new_string: 'b' }),
    };
    const action = normalizeCopilotCliAction(payload);
    expect(action.tool).toBe('Edit');
    expect(action.file).toBe('src/test.ts');
    expect(action.content).toBe('b');
  });

  it('normalizes view tool (file.read)', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'view',
      toolArgs: JSON.stringify({ file_path: 'README.md' }),
    };
    const action = normalizeCopilotCliAction(payload);
    expect(action.tool).toBe('Read');
    expect(action.file).toBe('README.md');
  });

  it('normalizes bash tool', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'bash',
      toolArgs: JSON.stringify({ command: 'npm test' }),
    };
    const action = normalizeCopilotCliAction(payload);
    expect(action.tool).toBe('Bash');
    expect(action.command).toBe('npm test');
  });

  it('normalizes powershell tool as Bash', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'powershell',
      toolArgs: JSON.stringify({ command: 'Get-Process' }),
    };
    const action = normalizeCopilotCliAction(payload);
    expect(action.tool).toBe('Bash');
    expect(action.command).toBe('Get-Process');
    expect(action.metadata).toHaveProperty('shell', 'powershell');
  });

  it('normalizes glob tool', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'glob',
      toolArgs: JSON.stringify({ pattern: '**/*.ts', path: 'src' }),
    };
    const action = normalizeCopilotCliAction(payload);
    expect(action.tool).toBe('Glob');
    expect(action.target).toBe('**/*.ts');
  });

  it('normalizes grep tool', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'grep',
      toolArgs: JSON.stringify({ pattern: 'TODO', path: 'src' }),
    };
    const action = normalizeCopilotCliAction(payload);
    expect(action.tool).toBe('Grep');
    expect(action.target).toBe('TODO');
  });

  it('normalizes web_fetch tool', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'web_fetch',
      toolArgs: JSON.stringify({ url: 'https://example.com', prompt: 'summarize' }),
    };
    const action = normalizeCopilotCliAction(payload);
    expect(action.tool).toBe('WebFetch');
    expect(action.target).toBe('https://example.com');
  });

  it('normalizes task tool as Agent', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'task',
      toolArgs: JSON.stringify({ prompt: 'run the tests' }),
    };
    const action = normalizeCopilotCliAction(payload);
    expect(action.tool).toBe('Agent');
    expect(action.target).toBe('run the tests');
  });

  it('normalizes report_intent as Read (read-only UI annotation)', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'report_intent',
      toolArgs: JSON.stringify({ intent: 'I will run the tests' }),
    };
    const action = normalizeCopilotCliAction(payload);
    expect(action.tool).toBe('Read');
    expect(action.metadata).toHaveProperty('intent', 'I will run the tests');
    expect(action.metadata).toHaveProperty('source', 'copilot-cli');
  });

  it('normalizes list_bash as Read (read-only session listing)', () => {
    const payload: CopilotCliHookPayload = { toolName: 'list_bash' };
    const action = normalizeCopilotCliAction(payload);
    expect(action.tool).toBe('Read');
    expect(action.agent).toBe('copilot-cli');
  });

  it('normalizes read_bash as Read with session id in target', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'read_bash',
      toolArgs: JSON.stringify({ id: 'session-42' }),
    };
    const action = normalizeCopilotCliAction(payload);
    expect(action.tool).toBe('Read');
    expect(action.target).toBe('session-42');
  });

  it('normalizes stop_bash as Bash with session id in target', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'stop_bash',
      toolArgs: JSON.stringify({ id: 'session-42' }),
    };
    const action = normalizeCopilotCliAction(payload);
    expect(action.tool).toBe('Bash');
    expect(action.target).toBe('session-42');
  });

  it('normalizes write_bash as Bash with input as command', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'write_bash',
      toolArgs: JSON.stringify({ id: 'session-42', input: 'echo hello' }),
    };
    const action = normalizeCopilotCliAction(payload);
    expect(action.tool).toBe('Bash');
    expect(action.command).toBe('echo hello');
    expect(action.target).toBe('session-42');
  });

  it('normalizes unknown tool gracefully', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'some_custom_tool',
      toolArgs: JSON.stringify({ data: 'test' }),
    };
    const action = normalizeCopilotCliAction(payload);
    expect(action.tool).toBe('some_custom_tool');
    expect(action.agent).toBe('copilot-cli');
  });

  it('handles invalid toolArgs JSON gracefully', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'bash',
      toolArgs: 'not valid json',
    };
    const action = normalizeCopilotCliAction(payload);
    expect(action.tool).toBe('Bash');
    expect(action.command).toBeUndefined();
  });

  it('handles missing toolArgs', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'view',
    };
    const action = normalizeCopilotCliAction(payload);
    expect(action.tool).toBe('Read');
    expect(action.file).toBeUndefined();
  });

  it('includes source: copilot-cli in metadata', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'bash',
      toolArgs: JSON.stringify({ command: 'ls' }),
    };
    const action = normalizeCopilotCliAction(payload);
    expect(action.metadata).toHaveProperty('source', 'copilot-cli');
  });
});

describe('resolveCopilotAgentIdentity', () => {
  it('returns copilot-cli when no session ID', () => {
    expect(resolveCopilotAgentIdentity()).toBe('copilot-cli');
    expect(resolveCopilotAgentIdentity(undefined)).toBe('copilot-cli');
  });

  it('returns copilot-cli for empty or whitespace session ID', () => {
    expect(resolveCopilotAgentIdentity('')).toBe('copilot-cli');
    expect(resolveCopilotAgentIdentity('   ')).toBe('copilot-cli');
  });

  it('returns copilot-cli:<hash> for valid session ID', () => {
    const identity = resolveCopilotAgentIdentity('abc123');
    expect(identity).toMatch(/^copilot-cli:[a-z0-9]+$/);
    expect(identity).not.toBe('copilot-cli');
  });

  it('produces consistent hash for same session ID', () => {
    const a = resolveCopilotAgentIdentity('session-xyz');
    const b = resolveCopilotAgentIdentity('session-xyz');
    expect(a).toBe(b);
  });

  it('produces different hashes for different session IDs', () => {
    const a = resolveCopilotAgentIdentity('session-1');
    const b = resolveCopilotAgentIdentity('session-2');
    expect(a).not.toBe(b);
  });
});

describe('normalizeCopilotCliAction — session ID propagation', () => {
  it('uses sessionId for agent identity when provided', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'create',
      toolArgs: JSON.stringify({ file_path: 'test.ts', content: 'hello' }),
      sessionId: 'sess-abc123',
    };
    const action = normalizeCopilotCliAction(payload);
    expect(action.agent).toMatch(/^copilot-cli:[a-z0-9]+$/);
  });

  it('falls back to copilot-cli without session ID', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'create',
      toolArgs: JSON.stringify({ file_path: 'test.ts', content: 'hello' }),
    };
    const action = normalizeCopilotCliAction(payload);
    expect(action.agent).toBe('copilot-cli');
  });

  it('propagates session ID in metadata', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'bash',
      toolArgs: JSON.stringify({ command: 'npm test' }),
      sessionId: 'sess-xyz',
    };
    const action = normalizeCopilotCliAction(payload);
    expect(action.metadata).toHaveProperty('sessionId', 'sess-xyz');
  });

  it('propagates session identity through all tool types', () => {
    const tools = [
      'create',
      'edit',
      'view',
      'bash',
      'powershell',
      'glob',
      'grep',
      'web_fetch',
      'task',
    ];
    for (const tool of tools) {
      const payload: CopilotCliHookPayload = {
        toolName: tool,
        toolArgs: JSON.stringify({}),
        sessionId: 'consistent-session',
      };
      const action = normalizeCopilotCliAction(payload);
      expect(action.agent).toMatch(/^copilot-cli:[a-z0-9]+$/);
    }
  });
});

describe('Integration: Copilot CLI → Kernel', () => {
  it('allows benign file read through kernel', async () => {
    const kernel = createKernel({ dryRun: true, evaluateOptions: { defaultDeny: false } });
    const payload: CopilotCliHookPayload = {
      toolName: 'view',
      toolArgs: JSON.stringify({ file_path: 'src/index.ts' }),
    };
    const rawAction = normalizeCopilotCliAction(payload);
    const result = await kernel.propose(rawAction);
    expect(result.allowed).toBe(true);
  });

  it('denies destructive command through kernel', async () => {
    const kernel = createKernel({ dryRun: true });
    const payload: CopilotCliHookPayload = {
      toolName: 'bash',
      toolArgs: JSON.stringify({ command: 'rm -rf /' }),
    };
    const rawAction = normalizeCopilotCliAction(payload);
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
    const payload: CopilotCliHookPayload = {
      toolName: 'bash',
      toolArgs: JSON.stringify({ command: 'git push origin main' }),
    };
    const rawAction = normalizeCopilotCliAction(payload);
    const result = await kernel.propose(rawAction);
    expect(result.allowed).toBe(false);
  });

  it('decision record shows copilot-cli agent identity', async () => {
    const kernel = createKernel({ dryRun: true, evaluateOptions: { defaultDeny: false } });
    const payload: CopilotCliHookPayload = {
      toolName: 'view',
      toolArgs: JSON.stringify({ file_path: 'src/index.ts' }),
      sessionId: 'session-42',
    };
    const rawAction = normalizeCopilotCliAction(payload);
    const result = await kernel.propose(rawAction);
    expect(result.allowed).toBe(true);
    expect(result.decisionRecord?.action.agent).toMatch(/^copilot-cli:[a-z0-9]+$/);
  });
});

describe('copilotToActionContext — KE-2 adapter mapping', () => {
  it('converts a create tool payload to ActionContext', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'create',
      toolArgs: JSON.stringify({ file_path: 'src/index.ts', content: 'hello' }),
      sessionId: 'session-abc',
    };

    const ctx = copilotToActionContext(payload);

    expect(ctx.action).toBe('file.write');
    expect(ctx.actionClass).toBe('file');
    expect(ctx.target).toBe('src/index.ts');
    expect(ctx.source).toBe('copilot-cli');
    expect(ctx.args.filePath).toBe('src/index.ts');
    expect(ctx.args.content).toBe('hello');
    expect(ctx.actor.agentId).toMatch(/^copilot-cli/);
    expect(ctx.destructive).toBe(false);
    expect(typeof ctx.normalizedAt).toBe('number');
  });

  it('converts a bash tool with git push to ActionContext', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'bash',
      toolArgs: JSON.stringify({ command: 'git push origin feature-branch' }),
    };

    const ctx = copilotToActionContext(payload);

    expect(ctx.action).toBe('git.push');
    expect(ctx.actionClass).toBe('git');
    expect(ctx.branch).toBe('feature-branch');
    expect(ctx.args.branch).toBe('feature-branch');
    expect(ctx.source).toBe('copilot-cli');
  });

  it('converts a destructive bash command to ActionContext', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'bash',
      toolArgs: JSON.stringify({ command: 'rm -rf /tmp/data' }),
    };

    const ctx = copilotToActionContext(payload);

    expect(ctx.destructive).toBe(true);
    expect(ctx.actionClass).toBe('shell');
    expect(ctx.source).toBe('copilot-cli');
  });

  it('converts a view tool payload (file.read)', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'view',
      toolArgs: JSON.stringify({ file_path: 'README.md' }),
    };

    const ctx = copilotToActionContext(payload);

    expect(ctx.action).toBe('file.read');
    expect(ctx.actionClass).toBe('file');
    expect(ctx.target).toBe('README.md');
    expect(ctx.source).toBe('copilot-cli');
  });

  it('passes persona through to ActionContext', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'bash',
      toolArgs: JSON.stringify({ command: 'npm test' }),
    };

    const ctx = copilotToActionContext(payload, { trustTier: 'elevated', role: 'ops' });

    expect(ctx.persona).toEqual({ trustTier: 'elevated', role: 'ops' });
    expect(ctx.actor.persona).toEqual({ trustTier: 'elevated', role: 'ops' });
  });

  it('produces NormalizedIntent-compatible output', () => {
    const payload: CopilotCliHookPayload = {
      toolName: 'create',
      toolArgs: JSON.stringify({ file_path: 'test.ts', content: 'data' }),
    };

    const ctx = copilotToActionContext(payload);

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

describe('formatCopilotHookResponse', () => {
  it('returns empty string for allowed actions', async () => {
    const kernel = createKernel({ dryRun: true, evaluateOptions: { defaultDeny: false } });
    const result = await kernel.propose({
      tool: 'Read',
      file: 'test.ts',
      agent: 'test',
    });
    expect(formatCopilotHookResponse(result)).toBe('');
  });

  it('returns JSON with permissionDecision: deny for denied actions', async () => {
    const kernel = createKernel({ dryRun: true });
    const result = await kernel.propose({
      tool: 'Bash',
      command: 'rm -rf /',
      agent: 'test',
    });
    const response = formatCopilotHookResponse(result);
    const parsed = JSON.parse(response);
    expect(parsed.permissionDecision).toBe('deny');
    expect(parsed.permissionDecisionReason).toContain('Destructive command');
  });
});

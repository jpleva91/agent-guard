// Tests for copilot-init CLI command
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/mock-home'),
}));

vi.mock('@red-codes/core', () => ({
  resolveMainRepoRoot: vi.fn(() => '/mock-repo-root'),
}));

import { copilotInit } from '../src/commands/copilot-init.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  // Default: no files exist
  vi.mocked(existsSync).mockReturnValue(false);
});

/** Helper: get all writeFileSync calls that wrote to hooks.json */
function hooksWriteCalls() {
  return vi
    .mocked(writeFileSync)
    .mock.calls.filter((call) => String(call[0]).endsWith('hooks.json'));
}

/** Helper: parse the written hooks.json content */
function writtenHooksConfig() {
  const calls = hooksWriteCalls();
  expect(calls.length).toBeGreaterThanOrEqual(1);
  return JSON.parse(calls[0][1] as string);
}

describe('copilotInit', () => {
  it('creates hooks.json with preToolUse and postToolUse on fresh install', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await copilotInit([]);

    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.github'),
      expect.objectContaining({ recursive: true })
    );

    const config = writtenHooksConfig();
    expect(config.version).toBe(1);
    expect(config.hooks).toBeDefined();
    expect(config.hooks.preToolUse).toHaveLength(1);
    expect(config.hooks.postToolUse).toHaveLength(1);
  });

  it('writes preToolUse hook with copilot-hook pre command', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await copilotInit([]);

    const config = writtenHooksConfig();
    const preHook = config.hooks.preToolUse[0];
    expect(preHook.type).toBe('command');
    expect(preHook.bash).toContain('copilot-hook pre');
    expect(preHook.timeoutSec).toBe(30);
  });

  it('writes postToolUse hook with copilot-hook post command', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await copilotInit([]);

    const config = writtenHooksConfig();
    const postHook = config.hooks.postToolUse[0];
    expect(postHook.type).toBe('command');
    expect(postHook.bash).toContain('copilot-hook post');
    expect(postHook.timeoutSec).toBe(10);
  });

  it('writes to ~/.copilot/hooks/hooks.json with --global flag', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await copilotInit(['--global']);

    const calls = vi.mocked(writeFileSync).mock.calls;
    const hooksCalls = calls.filter((call) => String(call[0]).includes('.copilot'));
    expect(hooksCalls.length).toBeGreaterThanOrEqual(1);
    expect(String(hooksCalls[0][0])).toContain('/mock-home/.copilot/hooks/hooks.json');
  });

  it('writes to .github/hooks/hooks.json by default (repo-level)', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await copilotInit([]);

    const calls = hooksWriteCalls();
    expect(String(calls[0][0])).toContain('.github/hooks/hooks.json');
  });

  it('reports already configured when AgentGuard hook exists', async () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) =>
      String(p).endsWith('hooks.json')
    );
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        version: 1,
        hooks: {
          preToolUse: [{ type: 'command', bash: 'agentguard copilot-hook pre', timeoutSec: 30 }],
        },
      })
    );

    await copilotInit([]);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Already configured')
    );
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('removes hooks when --remove flag is passed', async () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) =>
      String(p).endsWith('hooks.json')
    );
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        version: 1,
        hooks: {
          preToolUse: [{ type: 'command', bash: 'agentguard copilot-hook pre', timeoutSec: 30 }],
          postToolUse: [{ type: 'command', bash: 'agentguard copilot-hook post', timeoutSec: 10 }],
        },
      })
    );

    await copilotInit(['--remove']);

    // Should write the updated config without AgentGuard hooks
    const calls = hooksWriteCalls();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const updated = JSON.parse(calls[0][1] as string) as {
      hooks: {
        preToolUse?: Array<{ bash?: string }>;
        postToolUse?: Array<{ bash?: string }>;
      };
    };
    const preHooks = updated.hooks.preToolUse ?? [];
    const postHooks = updated.hooks.postToolUse ?? [];
    expect(preHooks.every((h) => !h.bash?.includes('copilot-hook'))).toBe(true);
    expect(postHooks.every((h) => !h.bash?.includes('copilot-hook'))).toBe(true);
  });

  it('reports nothing to remove when hooks.json missing with --remove', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await copilotInit(['--remove']);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Nothing to remove')
    );
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('includes --store flag in hook commands when specified', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await copilotInit(['--store', 'sqlite']);

    const config = writtenHooksConfig();
    const preHook = config.hooks.preToolUse[0];
    expect(preHook.bash).toContain('--store sqlite');
  });
});

// Tests for status command — agent identity and hook scripts checks (#849, #851)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/mock-home'),
}));

vi.mock('@red-codes/core', () => ({
  resolveMainRepoRoot: vi.fn(() => '/mock-repo-root'),
  detectRtk: vi.fn(() => ({ available: false })),
}));

vi.mock('../src/policy-resolver.js', () => ({
  findDefaultPolicy: vi.fn(() => null),
}));

vi.mock('@red-codes/adapters', () => ({
  verifyHookIntegrity: vi.fn(() => 'no_baseline'),
}));

vi.mock('@red-codes/policy', () => ({
  verifyPolicyTrust: vi.fn(async () => ({ status: 'untrusted' })),
}));

vi.mock('@red-codes/storage', () => ({
  resolveSqlitePath: vi.fn(() => '/mock-db-path'),
  queryEventsByKindAcrossRuns: vi.fn(() => []),
}));

import { checkAgentIdentity, checkHookScripts } from '../src/commands/status.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('checkAgentIdentity', () => {
  it('returns ok:false when .agentguard-identity file is missing', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = checkAgentIdentity();
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('missing');
    expect(result.detail).toContain('will be created on first Claude session');
  });

  it('returns ok:true with identity value when file exists and has content', () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('.agentguard-identity')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockReturnValue('claude-code:opus:developer');

    const result = checkAgentIdentity();
    expect(result.ok).toBe(true);
    expect(result.detail).toContain('claude-code:opus:developer');
  });

  it('returns ok:false when file exists but is empty', () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('.agentguard-identity')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockReturnValue('');

    const result = checkAgentIdentity();
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('empty');
  });

  it('returns ok:false when file exists but is unreadable', () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('.agentguard-identity')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const result = checkAgentIdentity();
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('unreadable');
  });
});

describe('checkHookScripts', () => {
  it('returns ok:true when all wrapper scripts exist', () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const result = checkHookScripts();
    expect(result.ok).toBe(true);
    expect(result.detail).toContain('all scripts present');
  });

  it('returns ok:false when wrapper scripts are missing', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = checkHookScripts();
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('missing');
    expect(result.detail).toContain('agentguard claude-init --refresh');
  });

  it('returns ok:false when some scripts are missing', () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      // Only claude-hook-wrapper.sh exists
      if (path.includes('claude-hook-wrapper.sh')) return true;
      return false;
    });

    const result = checkHookScripts();
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('missing');
  });

  it('checks scripts at the repo root path', () => {
    vi.mocked(existsSync).mockReturnValue(true);

    checkHookScripts();

    // Verify existsSync was called with repo root paths
    const calls = vi.mocked(existsSync).mock.calls;
    const scriptCalls = calls.filter(
      (call) => String(call[0]).includes('/mock-repo-root/scripts/')
    );
    expect(scriptCalls.length).toBe(4);
    expect(scriptCalls.some((c) => String(c[0]).includes('claude-hook-wrapper.sh'))).toBe(true);
    expect(scriptCalls.some((c) => String(c[0]).includes('session-persona-check.sh'))).toBe(true);
    expect(scriptCalls.some((c) => String(c[0]).includes('agent-identity-bridge.sh'))).toBe(true);
    expect(scriptCalls.some((c) => String(c[0]).includes('write-persona.sh'))).toBe(true);
  });
});

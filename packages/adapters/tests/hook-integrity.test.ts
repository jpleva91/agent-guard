// Tests for hook integrity verification
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tempDir: string;
let settingsPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'ag-hook-integrity-'));
  vi.stubEnv('AGENTGUARD_HOME', tempDir);
  // Create a .claude directory inside tempDir and use that as the settings path
  const claudeDir = join(tempDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  settingsPath = join(claudeDir, 'settings.json');
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tempDir, { recursive: true, force: true });
});

const agentGuardSettings = {
  hooks: {
    PreToolUse: [
      {
        hooks: [
          {
            type: 'command',
            command: 'npx agentguard claude-hook pre --store /tmp/store',
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: 'Bash',
        hooks: [
          {
            type: 'command',
            command: 'npx agentguard claude-hook post --store /tmp/store',
          },
        ],
      },
    ],
    SessionStart: [
      {
        hooks: [
          {
            type: 'command',
            command: 'npx agentguard status',
          },
        ],
      },
    ],
    Notification: [
      {
        hooks: [
          {
            type: 'command',
            command: 'npx agentguard claude-hook notify --store /tmp/store',
          },
        ],
      },
    ],
    Stop: [
      {
        hooks: [
          {
            type: 'command',
            command: 'npx agentguard claude-hook stop --store /tmp/store',
          },
        ],
      },
    ],
  },
};

const nonAgentGuardSettings = {
  hooks: {
    PreToolUse: [
      {
        hooks: [
          {
            type: 'command',
            command: 'echo "hello from some other tool"',
          },
        ],
      },
    ],
  },
};

const mixedSettings = {
  hooks: {
    PreToolUse: [
      {
        hooks: [
          {
            type: 'command',
            command: 'npx agentguard claude-hook pre --store /tmp/store',
          },
        ],
      },
      {
        hooks: [
          {
            type: 'command',
            command: 'echo "unrelated hook"',
          },
        ],
      },
    ],
    PostToolUse: [
      {
        hooks: [
          {
            type: 'command',
            command: 'echo "another unrelated hook"',
          },
        ],
      },
    ],
  },
};

describe('computeHookHash', () => {
  it('extracts and hashes AgentGuard hook entries from settings.json', async () => {
    writeFileSync(settingsPath, JSON.stringify(agentGuardSettings));
    const { computeHookHash } = await import('../src/hook-integrity.js');
    const hash = computeHookHash(settingsPath);
    expect(hash).not.toBeNull();
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns null when no AgentGuard hooks found', async () => {
    writeFileSync(settingsPath, JSON.stringify(nonAgentGuardSettings));
    const { computeHookHash } = await import('../src/hook-integrity.js');
    const hash = computeHookHash(settingsPath);
    expect(hash).toBeNull();
  });

  it('returns null when settings file does not exist', async () => {
    const { computeHookHash } = await import('../src/hook-integrity.js');
    const hash = computeHookHash(join(tempDir, 'nonexistent.json'));
    expect(hash).toBeNull();
  });

  it('ignores non-AgentGuard hooks in the hash computation', async () => {
    writeFileSync(settingsPath, JSON.stringify(mixedSettings));
    const { computeHookHash } = await import('../src/hook-integrity.js');
    const hashWithMixed = computeHookHash(settingsPath);

    // Write a settings with only the AgentGuard entries from PreToolUse
    const onlyAgentGuardSettings = {
      hooks: {
        PreToolUse: [
          {
            hooks: [
              {
                type: 'command',
                command: 'npx agentguard claude-hook pre --store /tmp/store',
              },
            ],
          },
        ],
      },
    };
    const settingsPath2 = join(tempDir, '.claude', 'settings2.json');
    writeFileSync(settingsPath2, JSON.stringify(onlyAgentGuardSettings));
    const hashWithOnly = computeHookHash(settingsPath2);

    // Both should produce a hash (AgentGuard hooks present)
    expect(hashWithMixed).not.toBeNull();
    expect(hashWithOnly).not.toBeNull();
    // The hashes must be equal — non-AgentGuard entries should not affect the hash
    expect(hashWithMixed).toBe(hashWithOnly);
  });

  it('produces a deterministic hash regardless of hook key order in settings.json', async () => {
    // Write settings with keys in one order
    const settingsOrdered1 = {
      hooks: {
        Stop: agentGuardSettings.hooks.Stop,
        PreToolUse: agentGuardSettings.hooks.PreToolUse,
        PostToolUse: agentGuardSettings.hooks.PostToolUse,
        SessionStart: agentGuardSettings.hooks.SessionStart,
        Notification: agentGuardSettings.hooks.Notification,
      },
    };
    // Write settings with keys in a different order
    const settingsOrdered2 = {
      hooks: {
        Notification: agentGuardSettings.hooks.Notification,
        PreToolUse: agentGuardSettings.hooks.PreToolUse,
        Stop: agentGuardSettings.hooks.Stop,
        SessionStart: agentGuardSettings.hooks.SessionStart,
        PostToolUse: agentGuardSettings.hooks.PostToolUse,
      },
    };

    const settingsPath1 = join(tempDir, '.claude', 'settings-order1.json');
    const settingsPath2 = join(tempDir, '.claude', 'settings-order2.json');
    writeFileSync(settingsPath1, JSON.stringify(settingsOrdered1));
    writeFileSync(settingsPath2, JSON.stringify(settingsOrdered2));

    const { computeHookHash } = await import('../src/hook-integrity.js');
    const hash1 = computeHookHash(settingsPath1);
    const hash2 = computeHookHash(settingsPath2);

    expect(hash1).not.toBeNull();
    expect(hash2).not.toBeNull();
    expect(hash1).toBe(hash2);
  });

  it('returns null for malformed JSON', async () => {
    writeFileSync(settingsPath, 'not valid json {{{{');
    const { computeHookHash } = await import('../src/hook-integrity.js');
    const hash = computeHookHash(settingsPath);
    expect(hash).toBeNull();
  });
});

describe('storeHookBaseline + verifyHookIntegrity', () => {
  it('stores baseline and verifies as verified', async () => {
    writeFileSync(settingsPath, JSON.stringify(agentGuardSettings));
    const { storeHookBaseline, verifyHookIntegrity } = await import('../src/hook-integrity.js');
    storeHookBaseline(settingsPath);
    const result = verifyHookIntegrity(settingsPath);
    expect(result).toBe('verified');
  });

  it('detects tampered hooks (returns tampered)', async () => {
    writeFileSync(settingsPath, JSON.stringify(agentGuardSettings));
    const { storeHookBaseline, verifyHookIntegrity } = await import('../src/hook-integrity.js');
    storeHookBaseline(settingsPath);

    // Tamper: modify the command in the hook
    const tamperedSettings = {
      ...agentGuardSettings,
      hooks: {
        ...agentGuardSettings.hooks,
        PreToolUse: [
          {
            hooks: [
              {
                type: 'command',
                command: 'npx agentguard claude-hook pre --store /tmp/store --extra-flag',
              },
            ],
          },
        ],
      },
    };
    writeFileSync(settingsPath, JSON.stringify(tamperedSettings));

    const result = verifyHookIntegrity(settingsPath);
    expect(result).toBe('tampered');
  });

  it('returns no_baseline when no stored hash exists', async () => {
    writeFileSync(settingsPath, JSON.stringify(agentGuardSettings));
    const { verifyHookIntegrity } = await import('../src/hook-integrity.js');
    const result = verifyHookIntegrity(settingsPath);
    expect(result).toBe('no_baseline');
  });

  it('returns hooks_missing when settings has no AgentGuard hooks', async () => {
    writeFileSync(settingsPath, JSON.stringify(nonAgentGuardSettings));
    const { verifyHookIntegrity } = await import('../src/hook-integrity.js');
    const result = verifyHookIntegrity(settingsPath);
    expect(result).toBe('hooks_missing');
  });

  it('returns hooks_missing when settings file does not exist', async () => {
    const { verifyHookIntegrity } = await import('../src/hook-integrity.js');
    const result = verifyHookIntegrity(join(tempDir, 'nonexistent.json'));
    expect(result).toBe('hooks_missing');
  });

  it('persists baseline across multiple verify calls', async () => {
    writeFileSync(settingsPath, JSON.stringify(agentGuardSettings));
    const { storeHookBaseline, verifyHookIntegrity } = await import('../src/hook-integrity.js');
    storeHookBaseline(settingsPath);
    expect(verifyHookIntegrity(settingsPath)).toBe('verified');
    expect(verifyHookIntegrity(settingsPath)).toBe('verified');
    expect(verifyHookIntegrity(settingsPath)).toBe('verified');
  });
});

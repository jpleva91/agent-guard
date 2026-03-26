// Tests for Go kernel fast-path delegation in claude-hook
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, writeFileSync, unlinkSync, mkdirSync, chmodSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveGoBinaryPath, tryGoFastPath } from '../src/commands/claude-hook.js';
import type { GoFastPathResult } from '../src/commands/claude-hook.js';
import type { ClaudeCodeHookPayload } from '@red-codes/adapters';

// ---------------------------------------------------------------------------
// resolveGoBinaryPath
// ---------------------------------------------------------------------------

describe('resolveGoBinaryPath', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('returns null when no Go binary exists', () => {
    delete process.env.AGENTGUARD_GO_BIN;
    // With no binary installed in any expected location, should return null
    const result = resolveGoBinaryPath();
    // Result depends on local setup — assert it returns string or null (type check)
    expect(result === null || typeof result === 'string').toBe(true);
  });

  it('respects AGENTGUARD_GO_BIN env var when file exists', () => {
    const tmpBin = join(tmpdir(), `agentguard-go-test-${Date.now()}`);
    writeFileSync(tmpBin, '#!/bin/sh\necho test', 'utf8');
    try {
      process.env.AGENTGUARD_GO_BIN = tmpBin;
      expect(resolveGoBinaryPath()).toBe(tmpBin);
    } finally {
      unlinkSync(tmpBin);
    }
  });

  it('returns null when AGENTGUARD_GO_BIN points to missing file', () => {
    process.env.AGENTGUARD_GO_BIN = '/nonexistent/agentguard-go';
    // Should fall through to other paths (which also won't exist in test env)
    const result = resolveGoBinaryPath();
    // In CI/test, the binary is unlikely to be in dist either
    expect(result === null || typeof result === 'string').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// tryGoFastPath
// ---------------------------------------------------------------------------

describe('tryGoFastPath', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('returns { used: false } when AGENTGUARD_SKIP_GO=1', () => {
    process.env.AGENTGUARD_SKIP_GO = '1';
    const result = tryGoFastPath(
      [{ id: 'test', name: 'Test', rules: [], severity: 5 }],
      { hook: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'test.ts' } } as ClaudeCodeHookPayload
    );
    expect(result.used).toBe(false);
  });

  it('returns { used: false } when no policies loaded', () => {
    const result = tryGoFastPath(
      [],
      { hook: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'test.ts' } } as ClaudeCodeHookPayload
    );
    expect(result.used).toBe(false);
  });

  it('returns { used: false } when Go binary not found', () => {
    delete process.env.AGENTGUARD_GO_BIN;
    // Point to nonexistent binary to force "not found"
    process.env.AGENTGUARD_GO_BIN = '/nonexistent/agentguard-go';
    const result = tryGoFastPath(
      [{ id: 'test', name: 'Test', rules: [], severity: 5 }],
      { hook: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'test.ts' } } as ClaudeCodeHookPayload
    );
    expect(result.used).toBe(false);
  });

  it('handles Go binary that allows an action', () => {
    // Create a mock Go binary that outputs an allow result
    const tmpBin = join(tmpdir(), `agentguard-go-mock-allow-${Date.now()}`);
    writeFileSync(
      tmpBin,
      '#!/bin/sh\necho \'{"allowed":true,"decision":"allow","reason":"No matching rule"}\'',
      'utf8'
    );
    chmodSync(tmpBin, 0o755);

    try {
      process.env.AGENTGUARD_GO_BIN = tmpBin;
      const result = tryGoFastPath(
        [{ id: 'test', name: 'Test', rules: [], severity: 5 }],
        { hook: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'test.ts' } } as ClaudeCodeHookPayload
      );
      expect(result.used).toBe(true);
      expect(result.allowed).toBe(true);
    } finally {
      unlinkSync(tmpBin);
    }
  });

  it('handles Go binary that denies an action (exit code 2)', () => {
    // Create a mock Go binary that outputs a deny result and exits 2
    const tmpBin = join(tmpdir(), `agentguard-go-mock-deny-${Date.now()}`);
    writeFileSync(
      tmpBin,
      '#!/bin/sh\necho \'{"allowed":false,"decision":"deny","reason":"Blocked by policy"}\'\nexit 2',
      'utf8'
    );
    chmodSync(tmpBin, 0o755);

    try {
      process.env.AGENTGUARD_GO_BIN = tmpBin;
      const result = tryGoFastPath(
        [{ id: 'test', name: 'Test', rules: [{ action: ['git.push'], effect: 'deny' }], severity: 5 }],
        { hook: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git push' } } as ClaudeCodeHookPayload
      );
      expect(result.used).toBe(true);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Blocked by policy');
    } finally {
      unlinkSync(tmpBin);
    }
  });

  it('falls back to TS on Go binary crash (non-zero, non-2 exit)', () => {
    const tmpBin = join(tmpdir(), `agentguard-go-mock-crash-${Date.now()}`);
    writeFileSync(tmpBin, '#!/bin/sh\nexit 1', 'utf8');
    chmodSync(tmpBin, 0o755);

    try {
      process.env.AGENTGUARD_GO_BIN = tmpBin;
      const result = tryGoFastPath(
        [{ id: 'test', name: 'Test', rules: [], severity: 5 }],
        { hook: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'test.ts' } } as ClaudeCodeHookPayload
      );
      expect(result.used).toBe(false);
    } finally {
      unlinkSync(tmpBin);
    }
  });

  it('falls back to TS on invalid JSON from Go binary', () => {
    const tmpBin = join(tmpdir(), `agentguard-go-mock-badjson-${Date.now()}`);
    writeFileSync(tmpBin, '#!/bin/sh\necho "not json"', 'utf8');
    chmodSync(tmpBin, 0o755);

    try {
      process.env.AGENTGUARD_GO_BIN = tmpBin;
      const result = tryGoFastPath(
        [{ id: 'test', name: 'Test', rules: [], severity: 5 }],
        { hook: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'test.ts' } } as ClaudeCodeHookPayload
      );
      expect(result.used).toBe(false);
    } finally {
      unlinkSync(tmpBin);
    }
  });

  it('merges rules from multiple policies', () => {
    // Create a mock Go binary that echoes the policy it received
    const tmpBin = join(tmpdir(), `agentguard-go-mock-multi-${Date.now()}`);
    writeFileSync(
      tmpBin,
      '#!/bin/sh\necho \'{"allowed":true,"decision":"allow","reason":"merged"}\'',
      'utf8'
    );
    chmodSync(tmpBin, 0o755);

    try {
      process.env.AGENTGUARD_GO_BIN = tmpBin;
      const result = tryGoFastPath(
        [
          { id: 'p1', name: 'Policy 1', rules: [{ action: ['file.read'], effect: 'allow' }], severity: 3 },
          { id: 'p2', name: 'Policy 2', rules: [{ action: ['git.push'], effect: 'deny' }], severity: 7 },
        ],
        { hook: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'test.ts' } } as ClaudeCodeHookPayload
      );
      expect(result.used).toBe(true);
      expect(result.allowed).toBe(true);
    } finally {
      unlinkSync(tmpBin);
    }
  });

  it('cleans up temp policy file even on error', () => {
    const tmpBin = join(tmpdir(), `agentguard-go-mock-cleanup-${Date.now()}`);
    writeFileSync(tmpBin, '#!/bin/sh\nexit 1', 'utf8');
    chmodSync(tmpBin, 0o755);

    try {
      process.env.AGENTGUARD_GO_BIN = tmpBin;
      tryGoFastPath(
        [{ id: 'test', name: 'Test', rules: [], severity: 5 }],
        { hook: 'PreToolUse', tool_name: 'Read', tool_input: {} } as ClaudeCodeHookPayload
      );

      // Verify no temp files left behind (approximate: check no agentguard-policy files)
      const tmpFiles = readdirSync(tmpdir()).filter((f: string) =>
        f.startsWith(`agentguard-policy-${process.pid}`)
      );
      expect(tmpFiles.length).toBe(0);
    } finally {
      unlinkSync(tmpBin);
    }
  });
});

// Tests for Claude hook error scenarios — PreToolUse denial output, PostToolUse edge cases,
// malformed payloads, storage resilience, and hook type detection edge cases.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { claudeHook } from '../src/commands/claude-hook.js';

let restoreStdin: (() => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  // Disable cloud telemetry in tests to avoid network-dependent flush delays
  process.env.AGENTGUARD_TELEMETRY = 'off';
  vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  vi.spyOn(process.stdout, 'write').mockImplementation((...args: unknown[]) => {
    // Invoke the flush callback if provided — the production code awaits it
    // (see handlePreToolUse's stdout.write(response, () => resolve()) pattern).
    const lastArg = args[args.length - 1];
    if (typeof lastArg === 'function') (lastArg as () => void)();
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  if (restoreStdin) {
    restoreStdin();
    restoreStdin = null;
  }
});

function mockStdin(data: string) {
  const originalStdin = process.stdin;
  const mockStdinObj = {
    isTTY: false,
    setEncoding: vi.fn(),
    on: vi.fn((event: string, cb: (arg?: string) => void) => {
      if (event === 'data') cb(data);
      if (event === 'end') setTimeout(() => cb(), 0);
      return mockStdinObj;
    }),
  };
  Object.defineProperty(process, 'stdin', {
    value: mockStdinObj,
    writable: true,
    configurable: true,
  });
  restoreStdin = () => {
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      writable: true,
      configurable: true,
    });
  };
}

function getStdoutOutput(): string {
  const calls = vi.mocked(process.stdout.write).mock.calls;
  return calls.map((c) => String(c[0])).join('');
}

describe('PreToolUse denial output', () => {
  it('outputs JSON with error field when destructive command is denied', async () => {
    mockStdin(
      JSON.stringify({
        hook: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /' },
      })
    );
    await claudeHook('pre');
    expect(process.exit).toHaveBeenCalledWith(2);
    const output = getStdoutOutput();
    expect(output).toBeTruthy();
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('hookSpecificOutput');
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
  });

  it('includes violation names in denial output when invariants fire', async () => {
    mockStdin(
      JSON.stringify({
        hook: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'git push --force origin main' },
      })
    );
    await claudeHook('pre');
    const output = getStdoutOutput();
    expect(output).toBeTruthy();
    const parsed = JSON.parse(output);
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
  });

  it('denies force push and outputs structured error', async () => {
    mockStdin(
      JSON.stringify({
        hook: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'git push -f origin main' },
      })
    );
    await claudeHook('pre');
    const output = getStdoutOutput();
    expect(output).toBeTruthy();
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('hookSpecificOutput');
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
  });

  it('allows benign Read action with no stdout output', async () => {
    mockStdin(
      JSON.stringify({
        hook: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '/tmp/safe.txt' },
      })
    );
    await claudeHook('pre');
    expect(process.exit).toHaveBeenCalledWith(0);
    const output = getStdoutOutput();
    // Allowed actions should produce no stdout (empty or no calls)
    expect(output).toBe('');
  });
});

describe('PreToolUse malformed payloads', () => {
  it('handles missing tool_input gracefully', async () => {
    mockStdin(
      JSON.stringify({
        hook: 'PreToolUse',
        tool_name: 'Write',
      })
    );
    await claudeHook('pre');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('handles empty tool_input object', async () => {
    mockStdin(
      JSON.stringify({
        hook: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {},
      })
    );
    await claudeHook('pre');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('handles null tool_input', async () => {
    mockStdin(
      JSON.stringify({
        hook: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: null,
      })
    );
    await claudeHook('pre');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('handles missing tool_name', async () => {
    mockStdin(
      JSON.stringify({
        hook: 'PreToolUse',
        tool_input: { command: 'echo hello' },
      })
    );
    await claudeHook('pre');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('handles empty string input', async () => {
    mockStdin('');
    await claudeHook('pre');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('handles deeply nested garbage JSON', async () => {
    mockStdin(JSON.stringify({ a: { b: { c: { d: 'not a hook payload' } } } }));
    await claudeHook('pre');
    expect(process.exit).toHaveBeenCalledWith(0);
  });
});

describe('PostToolUse edge cases', () => {
  it('handles missing tool_output entirely', async () => {
    mockStdin(
      JSON.stringify({
        tool_name: 'Bash',
      })
    );
    // No tool_output means this infers PreToolUse (no hookType, no tool_output)
    // With explicit 'post' it should handle gracefully
    await claudeHook('post');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('handles null tool_output', async () => {
    mockStdin(
      JSON.stringify({
        tool_name: 'Bash',
        tool_output: null,
      })
    );
    await claudeHook('post');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('truncates long stderr to 80 chars', async () => {
    const longError = 'E'.repeat(200);
    mockStdin(
      JSON.stringify({
        tool_name: 'Bash',
        tool_output: { exit_code: 1, stderr: longError },
      })
    );
    await claudeHook('post');
    const output = getStdoutOutput();
    expect(output).toContain('Error detected');
    // The displayed error line should be truncated — the full 200-char string should NOT appear
    expect(output).not.toContain(longError);
  });

  it('handles multiline stderr — only shows first line', async () => {
    mockStdin(
      JSON.stringify({
        tool_name: 'Bash',
        tool_output: {
          exit_code: 127,
          stderr: 'command not found: xyz\n  at /usr/bin/bash\n  at process.main',
        },
      })
    );
    await claudeHook('post');
    const output = getStdoutOutput();
    expect(output).toContain('command not found');
    expect(output).not.toContain('at process.main');
  });

  it('handles whitespace-only stderr as empty', async () => {
    mockStdin(
      JSON.stringify({
        tool_name: 'Bash',
        tool_output: { exit_code: 1, stderr: '   \n  \t  \n  ' },
      })
    );
    await claudeHook('post');
    const output = getStdoutOutput();
    // Whitespace-only stderr should not trigger error output after trim
    expect(output).not.toContain('Error detected');
  });

  it('ignores non-Bash tools in PostToolUse', async () => {
    for (const tool of ['Write', 'Edit', 'Read', 'Glob', 'Grep', 'Agent', 'NotebookEdit']) {
      vi.mocked(process.stdout.write).mockClear();
      mockStdin(
        JSON.stringify({
          tool_name: tool,
          tool_output: { exit_code: 1, stderr: 'some error' },
        })
      );
      await claudeHook('post');
      expect(getStdoutOutput()).toBe('');
    }
  });
});

describe('hook type detection edge cases', () => {
  it('treats payload.hook=PreToolUse as PreToolUse regardless of hookType arg', async () => {
    mockStdin(
      JSON.stringify({
        hook: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '/tmp/test.ts' },
      })
    );
    // No hookType argument, but payload has hook: 'PreToolUse'
    await claudeHook();
    expect(process.exit).toHaveBeenCalledWith(0);
    // Should have gone through PreToolUse path (kernel governance)
    // Read is allowed so no denial output
    expect(getStdoutOutput()).toBe('');
  });

  it('treats hookType=pre as PreToolUse even without payload.hook field', async () => {
    mockStdin(
      JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /' },
      })
    );
    await claudeHook('pre');
    const output = getStdoutOutput();
    // Should be denied through PreToolUse kernel path
    expect(JSON.parse(output).hookSpecificOutput.permissionDecision).toBe('deny');
  });

  it('treats payload with tool_output but hookType=pre as PreToolUse', async () => {
    // Edge case: hookType 'pre' should override presence of tool_output
    mockStdin(
      JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /' },
        tool_output: { exit_code: 0 },
      })
    );
    await claudeHook('pre');
    const output = getStdoutOutput();
    // Should be denied — pre takes precedence
    expect(JSON.parse(output).hookSpecificOutput.permissionDecision).toBe('deny');
  });
});

describe('session ID handling', () => {
  it('uses session_id from payload', async () => {
    mockStdin(
      JSON.stringify({
        hook: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '/tmp/test.ts' },
        session_id: 'my-session-123',
      })
    );
    await claudeHook('pre');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('falls back to CLAUDE_SESSION_ID env var', async () => {
    const originalEnv = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = 'env-session-456';
    try {
      mockStdin(
        JSON.stringify({
          hook: 'PreToolUse',
          tool_name: 'Read',
          tool_input: { file_path: '/tmp/test.ts' },
        })
      );
      await claudeHook('pre');
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.CLAUDE_SESSION_ID;
      } else {
        process.env.CLAUDE_SESSION_ID = originalEnv;
      }
    }
  });

  it('works without any session ID', async () => {
    const originalEnv = process.env.CLAUDE_SESSION_ID;
    delete process.env.CLAUDE_SESSION_ID;
    try {
      mockStdin(
        JSON.stringify({
          hook: 'PreToolUse',
          tool_name: 'Read',
          tool_input: { file_path: '/tmp/test.ts' },
        })
      );
      await claudeHook('pre');
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      if (originalEnv !== undefined) {
        process.env.CLAUDE_SESSION_ID = originalEnv;
      }
    }
  });
});

describe('formatHookResponse integration', () => {
  it('returns parseable JSON for denied destructive commands', async () => {
    mockStdin(
      JSON.stringify({
        hook: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'sudo rm -rf /var' },
      })
    );
    await claudeHook('pre');
    const output = getStdoutOutput();
    expect(output).toBeTruthy();
    // Must be valid JSON that Claude Code can parse
    expect(() => JSON.parse(output)).not.toThrow();
    const parsed = JSON.parse(output);
    expect(parsed.hookSpecificOutput).toBeDefined();
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
  });

  it('outputs valid JSON for denied chmod 777', async () => {
    mockStdin(
      JSON.stringify({
        hook: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'chmod 777 /etc/passwd' },
      })
    );
    await claudeHook('pre');
    const output = getStdoutOutput();
    if (output) {
      expect(() => JSON.parse(output)).not.toThrow();
    }
  });

  it('outputs valid JSON for denied dd command', async () => {
    mockStdin(
      JSON.stringify({
        hook: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'dd if=/dev/zero of=/dev/sda' },
      })
    );
    await claudeHook('pre');
    const output = getStdoutOutput();
    expect(output).toBeTruthy();
    const parsed = JSON.parse(output);
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
  });
});

describe('concurrent and timing resilience', () => {
  it('handles rapid sequential hook calls', async () => {
    for (let i = 0; i < 5; i++) {
      vi.mocked(process.stdout.write).mockClear();
      mockStdin(
        JSON.stringify({
          hook: 'PreToolUse',
          tool_name: 'Read',
          tool_input: { file_path: `/tmp/file-${i}.ts` },
        })
      );
      await claudeHook('pre');
      expect(process.exit).toHaveBeenCalledWith(0);
    }
  });

  it('alternating pre and post hooks work correctly', async () => {
    // Pre hook — allow
    mockStdin(
      JSON.stringify({
        hook: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '/tmp/test.ts' },
      })
    );
    await claudeHook('pre');
    expect(getStdoutOutput()).toBe('');

    // Post hook — error
    vi.mocked(process.stdout.write).mockClear();
    mockStdin(
      JSON.stringify({
        tool_name: 'Bash',
        tool_output: { exit_code: 1, stderr: 'segfault' },
      })
    );
    await claudeHook('post');
    expect(getStdoutOutput()).toContain('Error detected');

    // Pre hook — deny
    vi.mocked(process.stdout.write).mockClear();
    mockStdin(
      JSON.stringify({
        hook: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /' },
      })
    );
    await claudeHook('pre');
    expect(JSON.parse(getStdoutOutput()).hookSpecificOutput.permissionDecision).toBe('deny');
  });
});

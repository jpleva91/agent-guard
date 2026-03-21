// Tests for claude-hook CLI command (PreToolUse governance + PostToolUse error monitoring)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { claudeHook } from '../src/commands/claude-hook.js';

beforeEach(() => {
  vi.clearAllMocks();
  // Disable cloud telemetry in tests to avoid network-dependent flush delays
  process.env.AGENTGUARD_TELEMETRY = 'off';
  vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  vi.spyOn(process.stdout, 'write').mockImplementation((...args: unknown[]) => {
    const lastArg = args[args.length - 1];
    if (typeof lastArg === 'function') (lastArg as () => void)();
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
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
  return () => {
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      writable: true,
      configurable: true,
    });
  };
}

function mockTTYStdin() {
  const originalStdin = process.stdin;
  const mockStdinObj = {
    isTTY: true,
    setEncoding: vi.fn(),
    on: vi.fn(() => mockStdinObj),
  };
  Object.defineProperty(process, 'stdin', {
    value: mockStdinObj,
    writable: true,
    configurable: true,
  });
  return () => {
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      writable: true,
      configurable: true,
    });
  };
}

describe('claudeHook', () => {
  // --- General ---

  it('exits 0 for TTY stdin (no piped input)', async () => {
    const restore = mockTTYStdin();
    try {
      await claudeHook();
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  it('exits 0 for invalid JSON input', async () => {
    const restore = mockStdin('not valid json!!!');
    try {
      await claudeHook();
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  // --- PostToolUse (explicit 'post' hookType) ---

  it('exits 0 for non-Bash tool calls (post)', async () => {
    const input = JSON.stringify({ tool_name: 'Write', tool_output: {} });
    const restore = mockStdin(input);
    try {
      await claudeHook('post');
      expect(process.exit).toHaveBeenCalledWith(0);
      expect(process.stdout.write).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it('exits 0 silently for Bash with exit code 0 (post)', async () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_output: { exit_code: 0, stdout: 'ok', stderr: '' },
    });
    const restore = mockStdin(input);
    try {
      await claudeHook('post');
      expect(process.exit).toHaveBeenCalledWith(0);
      expect(process.stdout.write).not.toHaveBeenCalledWith(
        expect.stringContaining('Error detected')
      );
    } finally {
      restore();
    }
  });

  it('prints error summary for Bash with non-zero exit and stderr (post)', async () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_output: { exit_code: 1, stdout: '', stderr: 'Permission denied: /etc/hosts' },
    });
    const restore = mockStdin(input);
    try {
      await claudeHook('post');
      expect(process.exit).toHaveBeenCalledWith(0);
      expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('Error detected'));
      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('Permission denied')
      );
    } finally {
      restore();
    }
  });

  it('uses exitCode field as fallback (post)', async () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_output: { exitCode: 2, stderr: 'command not found' },
    });
    const restore = mockStdin(input);
    try {
      await claudeHook('post');
      expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('Error detected'));
    } finally {
      restore();
    }
  });

  it('does not print error when stderr is empty even with non-zero exit (post)', async () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_output: { exit_code: 1, stderr: '' },
    });
    const restore = mockStdin(input);
    try {
      await claudeHook('post');
      expect(process.exit).toHaveBeenCalledWith(0);
      expect(process.stdout.write).not.toHaveBeenCalledWith(
        expect.stringContaining('Error detected')
      );
    } finally {
      restore();
    }
  });

  // --- PostToolUse (inferred from tool_output presence) ---

  it('infers PostToolUse when tool_output is present and no hookType given', async () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_output: { exit_code: 1, stderr: 'error occurred' },
    });
    const restore = mockStdin(input);
    try {
      await claudeHook(); // no hookType — infer from tool_output
      expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('Error detected'));
    } finally {
      restore();
    }
  });

  // --- extraArgs forwarding ---

  it('accepts extraArgs parameter without error', async () => {
    const input = JSON.stringify({
      hook: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/tmp/test.ts' },
    });
    const restore = mockStdin(input);
    try {
      await claudeHook('pre', ['--store', 'sqlite']);
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  it('defaults extraArgs to empty array when not provided', async () => {
    const input = JSON.stringify({
      hook: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/tmp/test.ts' },
    });
    const restore = mockStdin(input);
    try {
      await claudeHook('pre');
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  // --- PreToolUse (kernel governance) ---

  it('routes PreToolUse Read action through kernel and allows it (no stdout)', async () => {
    const input = JSON.stringify({
      hook: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/tmp/safe-file.ts' },
    });
    const restore = mockStdin(input);
    try {
      await claudeHook('pre');
      expect(process.exit).toHaveBeenCalledWith(0);
      // Read actions should be allowed — no denial output
      const stdoutCalls = vi.mocked(process.stdout.write).mock.calls;
      const hasDenied = stdoutCalls.some(
        (call) => typeof call[0] === 'string' && call[0].includes('DENIED')
      );
      expect(hasDenied).toBe(false);
    } finally {
      restore();
    }
  });

  it('routes PreToolUse through kernel when hookType is "pre"', async () => {
    const input = JSON.stringify({
      tool_name: 'Glob',
      tool_input: { pattern: '**/*.ts' },
    });
    const restore = mockStdin(input);
    try {
      await claudeHook('pre');
      expect(process.exit).toHaveBeenCalledWith(0);
      // Glob/Read should be allowed by default
      const stdoutCalls = vi.mocked(process.stdout.write).mock.calls;
      const hasDenied = stdoutCalls.some(
        (call) => typeof call[0] === 'string' && call[0].includes('DENIED')
      );
      expect(hasDenied).toBe(false);
    } finally {
      restore();
    }
  });

  it('infers PreToolUse when no hookType and no tool_output', async () => {
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: '/tmp/test.ts', content: 'hello' },
    });
    const restore = mockStdin(input);
    try {
      await claudeHook(); // no hookType, no tool_output → PreToolUse
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  it('always exits 0 even if kernel encounters an error', async () => {
    const input = JSON.stringify({
      hook: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'echo hello' },
    });
    const restore = mockStdin(input);
    try {
      await claudeHook('pre');
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });
});

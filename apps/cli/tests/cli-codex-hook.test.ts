// Tests for codex-hook CLI command (PreToolUse governance + PostToolUse error monitoring)
// Codex CLI uses PascalCase tool names (Bash, Edit, Write, Read, Glob, Grep)
// and toolArgs as a JSON string.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { codexHook } from '../src/commands/codex-hook.js';


beforeEach(() => {
  vi.clearAllMocks();
  // Disable cloud telemetry in tests to avoid network-dependent flush delays
  process.env.AGENTGUARD_TELEMETRY = 'off';
  // Set agent identity so PreToolUse tests pass the identity hard gate
  process.env.AGENTGUARD_AGENT_NAME = 'test-agent';
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

describe('codexHook', () => {
  // --- General ---

  it('exits 0 for TTY stdin (no piped input)', async () => {
    const restore = mockTTYStdin();
    try {
      await codexHook();
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  it('exits 0 for invalid JSON input', async () => {
    const restore = mockStdin('not valid json!!!');
    try {
      await codexHook();
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  // --- PostToolUse (explicit 'post' hookType) ---

  it('exits 0 for non-Bash tool calls (post)', async () => {
    const input = JSON.stringify({ toolName: 'Write', toolResult: {} });
    const restore = mockStdin(input);
    try {
      await codexHook('post');
      expect(process.exit).toHaveBeenCalledWith(0);
      expect(process.stdout.write).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it('exits 0 silently for Bash with success result (post)', async () => {
    const input = JSON.stringify({
      toolName: 'Bash',
      toolResult: { resultType: 'success', textResultForLlm: 'ok', exitCode: 0 },
    });
    const restore = mockStdin(input);
    try {
      await codexHook('post');
      expect(process.exit).toHaveBeenCalledWith(0);
      expect(process.stderr.write).not.toHaveBeenCalledWith(
        expect.stringContaining('Error detected')
      );
    } finally {
      restore();
    }
  });

  it('prints error summary for Bash with failure result and stderr (post)', async () => {
    const input = JSON.stringify({
      toolName: 'Bash',
      toolResult: { resultType: 'failure', textResultForLlm: 'Permission denied: /etc/hosts', exitCode: 1 },
    });
    const restore = mockStdin(input);
    try {
      await codexHook('post');
      expect(process.exit).toHaveBeenCalledWith(0);
      expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Error detected'));
      expect(process.stderr.write).toHaveBeenCalledWith(
        expect.stringContaining('Permission denied')
      );
    } finally {
      restore();
    }
  });

  it('does not print error when result is not failure (post)', async () => {
    const input = JSON.stringify({
      toolName: 'Bash',
      toolResult: { resultType: 'success', textResultForLlm: '' },
    });
    const restore = mockStdin(input);
    try {
      await codexHook('post');
      expect(process.exit).toHaveBeenCalledWith(0);
      expect(process.stderr.write).not.toHaveBeenCalledWith(
        expect.stringContaining('Error detected')
      );
    } finally {
      restore();
    }
  });

  // --- PostToolUse (inferred from toolResult presence) ---

  it('infers PostToolUse when toolResult is present and no hookType given', async () => {
    const input = JSON.stringify({
      toolName: 'Bash',
      toolResult: { resultType: 'failure', textResultForLlm: 'error occurred', exitCode: 1 },
    });
    const restore = mockStdin(input);
    try {
      await codexHook(); // no hookType — infer from toolResult
      expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Error detected'));
    } finally {
      restore();
    }
  });

  // --- extraArgs forwarding ---

  it('accepts extraArgs parameter without error', async () => {
    const input = JSON.stringify({
      toolName: 'Read',
      toolArgs: JSON.stringify({ file_path: '/safe-file.ts' }),
    });
    const restore = mockStdin(input);
    try {
      await codexHook('pre', ['--store', 'sqlite']);
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  it('defaults extraArgs to empty array when not provided', async () => {
    const input = JSON.stringify({
      toolName: 'Read',
      toolArgs: JSON.stringify({ file_path: '/safe-file.ts' }),
    });
    const restore = mockStdin(input);
    try {
      await codexHook('pre');
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  // --- PreToolUse (kernel governance) ---

  it('routes PreToolUse Read action through kernel and allows it (no stdout)', async () => {
    const input = JSON.stringify({
      toolName: 'Read',
      toolArgs: JSON.stringify({ file_path: '/safe-file.ts' }),
    });
    const restore = mockStdin(input);
    try {
      await codexHook('pre');
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
      toolName: 'Glob',
      toolArgs: JSON.stringify({ pattern: '**/*.ts' }),
    });
    const restore = mockStdin(input);
    try {
      await codexHook('pre');
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

  it('infers PreToolUse when no hookType and no toolResult', async () => {
    const input = JSON.stringify({
      toolName: 'Write',
      toolArgs: JSON.stringify({ file_path: '/safe-file.ts', content: 'hello' }),
    });
    const restore = mockStdin(input);
    try {
      await codexHook(); // no hookType, no toolResult → PreToolUse
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  it('always exits 0 even if kernel encounters an error', async () => {
    const input = JSON.stringify({
      toolName: 'Bash',
      toolArgs: JSON.stringify({ command: 'echo hello' }),
    });
    const restore = mockStdin(input);
    try {
      await codexHook('pre');
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  it('catches denied command (git push origin main) via PreToolUse governance', async () => {
    const input = JSON.stringify({
      toolName: 'Bash',
      toolArgs: JSON.stringify({ command: 'git push origin main' }),
    });
    const restore = mockStdin(input);
    try {
      await codexHook('pre');
      // Hook always exits 0 — deny is communicated via stdout JSON
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });
});

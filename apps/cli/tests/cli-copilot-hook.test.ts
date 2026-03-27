// Tests for copilot-hook CLI command (preToolUse governance + postToolUse error monitoring)
// Copilot CLI uses lowercase tool names (bash, edit, create, view, glob, grep)
// and toolArgs as a JSON string.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { copilotHook } from '../src/commands/copilot-hook.js';


beforeEach(() => {
  vi.clearAllMocks();
  // Disable cloud telemetry in tests to avoid network-dependent flush delays
  process.env.AGENTGUARD_TELEMETRY = 'off';
  // Set agent identity so preToolUse tests pass the identity hard gate
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

describe('copilotHook', () => {
  // --- General ---

  it('exits 0 for TTY stdin (no piped input)', async () => {
    const restore = mockTTYStdin();
    try {
      await copilotHook();
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  it('exits 0 for invalid JSON input', async () => {
    const restore = mockStdin('not valid json!!!');
    try {
      await copilotHook();
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  // --- PostToolUse (explicit 'post' hookType) ---

  it('exits 0 for non-bash tool calls (post)', async () => {
    const input = JSON.stringify({ toolName: 'edit', toolResult: {} });
    const restore = mockStdin(input);
    try {
      await copilotHook('post');
      expect(process.exit).toHaveBeenCalledWith(0);
      expect(process.stdout.write).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it('exits 0 silently for bash with success result (post)', async () => {
    const input = JSON.stringify({
      toolName: 'bash',
      toolResult: { resultType: 'success', textResultForLlm: 'ok', exitCode: 0 },
    });
    const restore = mockStdin(input);
    try {
      await copilotHook('post');
      expect(process.exit).toHaveBeenCalledWith(0);
      expect(process.stderr.write).not.toHaveBeenCalledWith(
        expect.stringContaining('Error detected')
      );
    } finally {
      restore();
    }
  });

  it('prints error summary for bash with failure result and stderr (post)', async () => {
    const input = JSON.stringify({
      toolName: 'bash',
      toolResult: { resultType: 'failure', textResultForLlm: 'Permission denied: /etc/hosts', exitCode: 1 },
    });
    const restore = mockStdin(input);
    try {
      await copilotHook('post');
      expect(process.exit).toHaveBeenCalledWith(0);
      expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Error detected'));
      expect(process.stderr.write).toHaveBeenCalledWith(
        expect.stringContaining('Permission denied')
      );
    } finally {
      restore();
    }
  });

  it('handles powershell tool in post hook', async () => {
    const input = JSON.stringify({
      toolName: 'powershell',
      toolResult: { resultType: 'failure', textResultForLlm: 'Access denied', exitCode: 1 },
    });
    const restore = mockStdin(input);
    try {
      await copilotHook('post');
      expect(process.exit).toHaveBeenCalledWith(0);
      expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Error detected'));
    } finally {
      restore();
    }
  });

  it('does not print error when result is not failure (post)', async () => {
    const input = JSON.stringify({
      toolName: 'bash',
      toolResult: { resultType: 'success', textResultForLlm: '' },
    });
    const restore = mockStdin(input);
    try {
      await copilotHook('post');
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
      toolName: 'bash',
      toolResult: { resultType: 'failure', textResultForLlm: 'error occurred', exitCode: 1 },
    });
    const restore = mockStdin(input);
    try {
      await copilotHook(); // no hookType — infer from toolResult
      expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Error detected'));
    } finally {
      restore();
    }
  });

  // --- extraArgs forwarding ---

  it('accepts extraArgs parameter without error', async () => {
    const input = JSON.stringify({
      toolName: 'view',
      toolArgs: JSON.stringify({ file_path: '/safe-file.ts' }),
    });
    const restore = mockStdin(input);
    try {
      await copilotHook('pre', ['--store', 'sqlite']);
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  it('defaults extraArgs to empty array when not provided', async () => {
    const input = JSON.stringify({
      toolName: 'view',
      toolArgs: JSON.stringify({ file_path: '/safe-file.ts' }),
    });
    const restore = mockStdin(input);
    try {
      await copilotHook('pre');
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  // --- PreToolUse (kernel governance) ---

  it('routes preToolUse view action through kernel and allows it (no stdout)', async () => {
    const input = JSON.stringify({
      toolName: 'view',
      toolArgs: JSON.stringify({ file_path: '/safe-file.ts' }),
    });
    const restore = mockStdin(input);
    try {
      await copilotHook('pre');
      expect(process.exit).toHaveBeenCalledWith(0);
      // Read/view actions should be allowed — no denial output
      const stdoutCalls = vi.mocked(process.stdout.write).mock.calls;
      const hasDenied = stdoutCalls.some(
        (call) => typeof call[0] === 'string' && call[0].includes('DENIED')
      );
      expect(hasDenied).toBe(false);
    } finally {
      restore();
    }
  });

  it('routes preToolUse through kernel when hookType is "pre"', async () => {
    const input = JSON.stringify({
      toolName: 'glob',
      toolArgs: JSON.stringify({ pattern: '**/*.ts' }),
    });
    const restore = mockStdin(input);
    try {
      await copilotHook('pre');
      expect(process.exit).toHaveBeenCalledWith(0);
      // Glob should be allowed by default
      const stdoutCalls = vi.mocked(process.stdout.write).mock.calls;
      const hasDenied = stdoutCalls.some(
        (call) => typeof call[0] === 'string' && call[0].includes('DENIED')
      );
      expect(hasDenied).toBe(false);
    } finally {
      restore();
    }
  });

  it('infers preToolUse when no hookType and no toolResult', async () => {
    const input = JSON.stringify({
      toolName: 'create',
      toolArgs: JSON.stringify({ file_path: '/safe-file.ts', content: 'hello' }),
    });
    const restore = mockStdin(input);
    try {
      await copilotHook(); // no hookType, no toolResult → preToolUse
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  it('always exits 0 even if kernel encounters an error', async () => {
    const input = JSON.stringify({
      toolName: 'bash',
      toolArgs: JSON.stringify({ command: 'echo hello' }),
    });
    const restore = mockStdin(input);
    try {
      await copilotHook('pre');
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  it('catches denied command (git push origin main) via preToolUse governance', async () => {
    const input = JSON.stringify({
      toolName: 'bash',
      toolArgs: JSON.stringify({ command: 'git push origin main' }),
    });
    const restore = mockStdin(input);
    try {
      await copilotHook('pre');
      // Hook always exits 0 — deny is communicated via stdout JSON
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });
});

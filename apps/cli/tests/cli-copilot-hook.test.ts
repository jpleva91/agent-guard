// Tests for copilot-hook CLI command (PreToolUse governance + PostToolUse error monitoring)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copilotHook } from '../src/commands/copilot-hook.js';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AGENTGUARD_TELEMETRY = 'off';
  process.env.AGENTGUARD_AGENT_NAME = 'test-agent';
  vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  vi.spyOn(process.stdout, 'write').mockImplementation((...args: unknown[]) => {
    const lastArg = args[args.length - 1];
    if (typeof lastArg === 'function') (lastArg as () => void)();
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AGENTGUARD_TELEMETRY;
  delete process.env.AGENTGUARD_AGENT_NAME;
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

  it('exits 0 for empty string input', async () => {
    const restore = mockStdin('');
    try {
      await copilotHook();
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  // --- PostToolUse ---

  it('exits 0 for non-bash tool post-hook silently', async () => {
    const input = JSON.stringify({
      toolName: 'WriteFile',
      toolResult: { resultType: 'success', textResultForLlm: 'wrote file' },
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

  it('writes error to stderr when bash tool fails (post)', async () => {
    const input = JSON.stringify({
      toolName: 'bash',
      toolResult: {
        resultType: 'failure',
        textResultForLlm: 'Command not found: foo',
        exitCode: 1,
      },
    });
    const restore = mockStdin(input);
    try {
      await copilotHook('post');
      expect(process.exit).toHaveBeenCalledWith(0);
      expect(process.stderr.write).toHaveBeenCalledWith(
        expect.stringContaining('Error detected')
      );
    } finally {
      restore();
    }
  });

  it('does not write error for successful bash tool (post)', async () => {
    const input = JSON.stringify({
      toolName: 'bash',
      toolResult: {
        resultType: 'success',
        textResultForLlm: 'output',
        exitCode: 0,
      },
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

  it('infers post-hook from toolResult presence when no explicit hookType', async () => {
    const input = JSON.stringify({
      toolName: 'bash',
      toolResult: { resultType: 'success', textResultForLlm: '', exitCode: 0 },
    });
    const restore = mockStdin(input);
    try {
      await copilotHook();
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  it('infers pre-hook when toolResult is absent', async () => {
    const input = JSON.stringify({
      toolName: 'ReadFile',
      toolArgs: JSON.stringify({ path: 'src/index.ts' }),
    });
    const restore = mockStdin(input);
    try {
      await copilotHook();
      // Always exits 0 — result (allow/deny) is in stdout JSON
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });
});

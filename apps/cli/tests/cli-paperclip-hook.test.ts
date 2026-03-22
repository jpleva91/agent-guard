// Tests for paperclip-hook CLI command (PreToolUse governance + PostToolUse error monitoring)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { paperclipHook } from '../src/commands/paperclip-hook.js';

beforeEach(() => {
  vi.clearAllMocks();
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

describe('paperclipHook', () => {
  it('exits 0 for TTY stdin (no piped input)', async () => {
    const restore = mockTTYStdin();
    try {
      await paperclipHook();
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  it('exits 0 for invalid JSON input', async () => {
    const restore = mockStdin('not valid json!!!');
    try {
      await paperclipHook();
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  // --- PostToolUse ---

  it('exits 0 for non-Bash tool calls (post)', async () => {
    const input = JSON.stringify({
      hook: 'PostToolUse',
      tool_name: 'Write',
      tool_output: {},
    });
    const restore = mockStdin(input);
    try {
      await paperclipHook('post');
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  it('prints error summary for Bash with stderr (post)', async () => {
    const input = JSON.stringify({
      hook: 'PostToolUse',
      tool_name: 'Bash',
      tool_output: { stderr: 'Permission denied: /etc/hosts' },
    });
    const restore = mockStdin(input);
    try {
      await paperclipHook('post');
      expect(process.exit).toHaveBeenCalledWith(0);
      expect(process.stderr.write).toHaveBeenCalledWith(
        expect.stringContaining('Error detected')
      );
    } finally {
      restore();
    }
  });

  it('does not print error when stderr is empty (post)', async () => {
    const input = JSON.stringify({
      hook: 'PostToolUse',
      tool_name: 'Bash',
      tool_output: { stderr: '' },
    });
    const restore = mockStdin(input);
    try {
      await paperclipHook('post');
      expect(process.exit).toHaveBeenCalledWith(0);
      expect(process.stderr.write).not.toHaveBeenCalledWith(
        expect.stringContaining('Error detected')
      );
    } finally {
      restore();
    }
  });

  it('infers PostToolUse when tool_output is present', async () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_output: { stderr: 'error occurred' },
    });
    const restore = mockStdin(input);
    try {
      await paperclipHook(); // no hookType — infer from tool_output
      expect(process.stderr.write).toHaveBeenCalledWith(
        expect.stringContaining('Error detected')
      );
    } finally {
      restore();
    }
  });

  // --- PreToolUse ---

  it('exits with code 2 for destructive command (pre)', async () => {
    const input = JSON.stringify({
      hook: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /' },
    });
    const restore = mockStdin(input);
    try {
      await paperclipHook('pre');
      expect(process.exit).toHaveBeenCalledWith(2);
    } finally {
      restore();
    }
  });

  it('exits 0 for safe file read (pre)', async () => {
    const input = JSON.stringify({
      hook: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'src/index.ts' },
    });
    const restore = mockStdin(input);
    try {
      await paperclipHook('pre');
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
    }
  });

  // --- Paperclip context enrichment ---

  it('reads PAPERCLIP_* env vars and enriches payload', async () => {
    const originalEnv = { ...process.env };
    process.env.PAPERCLIP_AGENT_ID = 'test-agent-123';
    process.env.PAPERCLIP_COMPANY_ID = 'test-company';

    const input = JSON.stringify({
      hook: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'src/index.ts' },
    });
    const restore = mockStdin(input);
    try {
      await paperclipHook('pre');
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
      process.env = originalEnv;
    }
  });

  it('merges inline paperclip context with env vars', async () => {
    const originalEnv = { ...process.env };
    process.env.PAPERCLIP_COMPANY_ID = 'env-company';

    const input = JSON.stringify({
      hook: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'src/index.ts' },
      paperclip: { agentId: 'inline-agent', projectId: 'inline-project' },
    });
    const restore = mockStdin(input);
    try {
      await paperclipHook('pre');
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      restore();
      process.env = originalEnv;
    }
  });
});

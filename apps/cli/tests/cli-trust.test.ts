// Tests for agentguard trust CLI command
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((_q: string, cb: (answer: string) => void) => cb('y')),
    close: vi.fn(),
  })),
}));

vi.mock('@red-codes/policy', () => ({
  analyzePolicyRisk: vi.fn(() => []),
}));

vi.mock('@red-codes/core', () => ({
  trustFile: vi.fn(async () => ({
    path: '/mock/policy.yaml',
    hash: 'abc123',
    trustedAt: '2026-01-01T00:00:00.000Z',
    trustedBy: 'user',
  })),
}));

import { trust } from '../src/commands/trust.js';
import { readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { analyzePolicyRisk } from '@red-codes/policy';
import { trustFile } from '@red-codes/core';

function setTTY(isTTY: boolean): () => void {
  const original = process.stdin.isTTY;
  Object.defineProperty(process.stdin, 'isTTY', { value: isTTY, configurable: true });
  return () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: original, configurable: true });
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readFileSync).mockReturnValue('policy: content\n');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('trust command', () => {
  describe('argument validation', () => {
    it('returns 1 when no policy file is specified', async () => {
      const code = await trust([]);
      expect(code).toBe(1);
    });

    it('returns 1 when only flags are provided (no file path)', async () => {
      const code = await trust(['--yes']);
      expect(code).toBe(1);
    });

    it('returns 1 when file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const code = await trust(['policy.yaml']);
      expect(code).toBe(1);
    });

    it('returns 1 when file cannot be read', async () => {
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });
      const code = await trust(['policy.yaml']);
      expect(code).toBe(1);
    });
  });

  describe('non-TTY behavior', () => {
    it('returns 1 in non-TTY without --yes flag', async () => {
      const restore = setTTY(false);
      try {
        const code = await trust(['policy.yaml']);
        expect(code).toBe(1);
      } finally {
        restore();
      }
    });

    it('succeeds in non-TTY with --yes flag', async () => {
      const restore = setTTY(false);
      try {
        const code = await trust(['policy.yaml', '--yes']);
        expect(code).toBe(0);
      } finally {
        restore();
      }
    });

    it('accepts -y shorthand in non-TTY', async () => {
      const restore = setTTY(false);
      try {
        const code = await trust(['policy.yaml', '-y']);
        expect(code).toBe(0);
      } finally {
        restore();
      }
    });
  });

  describe('risk analysis output', () => {
    it('calls analyzePolicyRisk with file content', async () => {
      const restore = setTTY(false);
      try {
        vi.mocked(readFileSync).mockReturnValue('allow: "*"\n');
        await trust(['policy.yaml', '--yes']);
        expect(analyzePolicyRisk).toHaveBeenCalledWith('allow: "*"\n');
      } finally {
        restore();
      }
    });

    it('returns 0 with --yes when no risk flags', async () => {
      const restore = setTTY(false);
      try {
        vi.mocked(analyzePolicyRisk).mockReturnValue([]);
        const code = await trust(['policy.yaml', '--yes']);
        expect(code).toBe(0);
      } finally {
        restore();
      }
    });

    it('returns 0 with --yes when warning risk flags present', async () => {
      const restore = setTTY(false);
      try {
        vi.mocked(analyzePolicyRisk).mockReturnValue([
          { level: 'warning', message: 'Broad scope detected', pattern: 'scope: "**"' },
        ]);
        const code = await trust(['policy.yaml', '--yes']);
        expect(code).toBe(0);
      } finally {
        restore();
      }
    });

    it('returns 0 with --yes even when danger risk flags present', async () => {
      const restore = setTTY(false);
      try {
        vi.mocked(analyzePolicyRisk).mockReturnValue([
          {
            level: 'danger',
            message: 'Wildcard allow detected',
            pattern: 'allow: "*"',
          },
        ]);
        const code = await trust(['policy.yaml', '--yes']);
        expect(code).toBe(0);
      } finally {
        restore();
      }
    });
  });

  describe('interactive confirmation (TTY)', () => {
    it('returns 0 when user confirms with y', async () => {
      const restore = setTTY(true);
      try {
        vi.mocked(createInterface).mockReturnValue({
          question: vi.fn((_q: string, cb: (answer: string) => void) => cb('y')),
          close: vi.fn(),
        } as never);
        const code = await trust(['policy.yaml']);
        expect(code).toBe(0);
      } finally {
        restore();
      }
    });

    it('returns 1 when user declines with n', async () => {
      const restore = setTTY(true);
      try {
        vi.mocked(createInterface).mockReturnValue({
          question: vi.fn((_q: string, cb: (answer: string) => void) => cb('n')),
          close: vi.fn(),
        } as never);
        const code = await trust(['policy.yaml']);
        expect(code).toBe(1);
      } finally {
        restore();
      }
    });

    it('returns 1 when user presses enter (empty answer = no)', async () => {
      const restore = setTTY(true);
      try {
        vi.mocked(createInterface).mockReturnValue({
          question: vi.fn((_q: string, cb: (answer: string) => void) => cb('')),
          close: vi.fn(),
        } as never);
        const code = await trust(['policy.yaml']);
        expect(code).toBe(1);
      } finally {
        restore();
      }
    });

    it('returns 0 with --yes skipping prompt entirely (TTY)', async () => {
      const restore = setTTY(true);
      try {
        const code = await trust(['policy.yaml', '--yes']);
        expect(code).toBe(0);
        expect(createInterface).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });
  });

  describe('trust recording', () => {
    it('calls trustFile with resolved absolute path on success', async () => {
      const restore = setTTY(false);
      try {
        await trust(['/abs/path/policy.yaml', '--yes']);
        expect(trustFile).toHaveBeenCalledWith('/abs/path/policy.yaml');
      } finally {
        restore();
      }
    });

    it('returns 0 after successful trust recording', async () => {
      const restore = setTTY(false);
      try {
        vi.mocked(trustFile).mockResolvedValue({
          path: '/abs/policy.yaml',
          hash: 'deadbeef',
          trustedAt: '2026-03-28T00:00:00.000Z',
          trustedBy: 'user',
        });
        const code = await trust(['/abs/policy.yaml', '--yes']);
        expect(code).toBe(0);
      } finally {
        restore();
      }
    });
  });
});

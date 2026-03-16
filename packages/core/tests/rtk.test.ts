// Tests for packages/core/src/rtk.ts — RTK detection and command rewrite utility
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';
import { detectRtk, rtkRewrite, resetRtkCache } from '../src/rtk.js';

beforeEach(() => {
  vi.clearAllMocks();
  resetRtkCache();
});

describe('detectRtk', () => {
  it('returns available=true with version when rtk outputs "rtk X.Y.Z"', () => {
    vi.mocked(execSync).mockReturnValue('rtk 0.30.0');
    const result = detectRtk();
    expect(result.available).toBe(true);
    expect(result.version).toBe('0.30.0');
  });

  it('extracts version from bare "X.Y.Z" format', () => {
    vi.mocked(execSync).mockReturnValue('0.30.0');
    const result = detectRtk();
    expect(result.available).toBe(true);
    expect(result.version).toBe('0.30.0');
  });

  it('handles output with surrounding whitespace', () => {
    vi.mocked(execSync).mockReturnValue('  rtk 1.2.3  ');
    const result = detectRtk();
    expect(result.available).toBe(true);
    expect(result.version).toBe('1.2.3');
  });

  it('returns available=true without version when version cannot be parsed', () => {
    vi.mocked(execSync).mockReturnValue('rtk development build');
    const result = detectRtk();
    expect(result.available).toBe(true);
    expect(result.version).toBeUndefined();
  });

  it('returns available=false when execSync throws (rtk not found)', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('command not found: rtk');
    });
    const result = detectRtk();
    expect(result.available).toBe(false);
    expect(result.version).toBeUndefined();
  });

  it('caches the result — execSync called only once across multiple invocations', () => {
    vi.mocked(execSync).mockReturnValue('rtk 0.30.0');
    detectRtk();
    detectRtk();
    detectRtk();
    expect(vi.mocked(execSync)).toHaveBeenCalledTimes(1);
  });

  it('returns the same object reference from cache', () => {
    vi.mocked(execSync).mockReturnValue('rtk 0.30.0');
    const first = detectRtk();
    const second = detectRtk();
    expect(first).toBe(second);
  });

  it('caches a negative result (not available)', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not found');
    });
    detectRtk();
    detectRtk();
    expect(vi.mocked(execSync)).toHaveBeenCalledTimes(1);
  });
});

describe('rtkRewrite', () => {
  it('returns original command unchanged when rtk is not available', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not found');
    });
    const result = rtkRewrite('git log --oneline');
    expect(result.rewritten).toBe(false);
    expect(result.command).toBe('git log --oneline');
  });

  it('returns rewritten command when rtk provides an equivalent', () => {
    vi.mocked(execSync)
      .mockReturnValueOnce('rtk 0.30.0') // detectRtk → rtk --version
      .mockReturnValueOnce('git log --oneline --no-color'); // rtk rewrite ...

    const result = rtkRewrite('git log --oneline');
    expect(result.rewritten).toBe(true);
    expect(result.command).toBe('git log --oneline --no-color');
  });

  it('returns original command when rtk rewrite returns empty string (no equivalent)', () => {
    vi.mocked(execSync)
      .mockReturnValueOnce('rtk 0.30.0')
      .mockReturnValueOnce('');

    const result = rtkRewrite('git log --oneline');
    expect(result.rewritten).toBe(false);
    expect(result.command).toBe('git log --oneline');
  });

  it('returns original command when rtk rewrite throws (exit code 1)', () => {
    vi.mocked(execSync)
      .mockReturnValueOnce('rtk 0.30.0')
      .mockImplementationOnce(() => {
        const err = new Error('Command failed') as NodeJS.ErrnoException;
        (err as { status?: number }).status = 1;
        throw err;
      });

    const result = rtkRewrite('git log --oneline');
    expect(result.rewritten).toBe(false);
    expect(result.command).toBe('git log --oneline');
  });

  it('uses cached detection result on subsequent rtkRewrite calls', () => {
    vi.mocked(execSync)
      .mockReturnValueOnce('rtk 0.30.0') // detectRtk called once on first rtkRewrite
      .mockReturnValueOnce('git status --short') // rewrite for first call
      .mockReturnValueOnce('git status --short'); // rewrite for second call

    rtkRewrite('git status');
    rtkRewrite('git status');

    // execSync: once for --version + twice for rewrite = 3 total
    expect(vi.mocked(execSync)).toHaveBeenCalledTimes(3);
  });

  it('preserves the exact original command string in the result', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not found');
    });
    const cmd = 'npm run build -- --filter=@red-codes/kernel';
    const result = rtkRewrite(cmd);
    expect(result.command).toBe(cmd);
  });
});

describe('resetRtkCache', () => {
  it('allows re-detection after cache reset', () => {
    // First detection: rtk not available
    vi.mocked(execSync).mockImplementationOnce(() => {
      throw new Error('not found');
    });
    const first = detectRtk();
    expect(first.available).toBe(false);

    resetRtkCache();

    // Second detection after reset: rtk now available
    vi.mocked(execSync).mockReturnValueOnce('rtk 1.0.0');
    const second = detectRtk();
    expect(second.available).toBe(true);
    expect(second.version).toBe('1.0.0');
  });

  it('forces a fresh execSync call after reset', () => {
    vi.mocked(execSync).mockReturnValue('rtk 0.30.0');
    detectRtk(); // populate cache

    resetRtkCache();

    detectRtk(); // fresh call
    expect(vi.mocked(execSync)).toHaveBeenCalledTimes(2);
  });
});

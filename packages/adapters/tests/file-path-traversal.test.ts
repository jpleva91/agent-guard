// Tests for path traversal prevention in the file adapter (issue #636)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileAdapter } from '../src/file.js';
import { mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Detect whether the current process can create symlinks (fails on Windows without privileges). */
const canSymlink = (() => {
  const probe = join(tmpdir(), `ag-symlink-probe-${Date.now()}`);
  const probeTarget = join(tmpdir(), `ag-symlink-probe-target-${Date.now()}.txt`);
  try {
    writeFileSync(probeTarget, '');
    symlinkSync(probeTarget, probe);
    rmSync(probe);
    rmSync(probeTarget);
    return true;
  } catch {
    return false;
  }
})();

function makeAction(overrides: { type: string; target: string; [key: string]: unknown }) {
  return {
    id: 'act_traversal',
    class: 'file',
    justification: 'test',
    timestamp: Date.now(),
    fingerprint: 'fp_traversal',
    ...overrides,
  } as never;
}

const TRAVERSAL_PATTERN = /path traversal|outside.*boundary/i;

describe('file adapter path traversal protection', () => {
  // ── Relative traversal ──────────────────────────────────────────────
  describe('relative path traversal', () => {
    it('rejects ../../../etc/passwd', async () => {
      await expect(
        fileAdapter(makeAction({ type: 'file.read', target: '../../../etc/passwd' }))
      ).rejects.toThrow(TRAVERSAL_PATTERN);
    });

    it('rejects ../../etc/shadow', async () => {
      await expect(
        fileAdapter(makeAction({ type: 'file.read', target: '../../etc/shadow' }))
      ).rejects.toThrow(TRAVERSAL_PATTERN);
    });

    it('rejects mixed slashes ..\\..\\etc\\passwd', async () => {
      await expect(
        fileAdapter(makeAction({ type: 'file.read', target: '..\\..\\..\\etc\\passwd' }))
      ).rejects.toThrow(TRAVERSAL_PATTERN);
    });
  });

  // ── Absolute path ───────────────────────────────────────────────────
  describe('absolute path traversal', () => {
    it('rejects /etc/passwd', async () => {
      await expect(
        fileAdapter(makeAction({ type: 'file.read', target: '/etc/passwd' }))
      ).rejects.toThrow(TRAVERSAL_PATTERN);
    });

    it('rejects C:\\Windows\\System32\\config\\SAM on Windows', async () => {
      await expect(
        fileAdapter(makeAction({ type: 'file.read', target: 'C:\\Windows\\System32\\config\\SAM' }))
      ).rejects.toThrow(TRAVERSAL_PATTERN);
    });
  });

  // ── URL-encoded traversal ───────────────────────────────────────────
  describe('URL-encoded traversal', () => {
    it('rejects %2e%2e/%2e%2e/etc/passwd', async () => {
      await expect(
        fileAdapter(makeAction({ type: 'file.read', target: '%2e%2e/%2e%2e/etc/passwd' }))
      ).rejects.toThrow(TRAVERSAL_PATTERN);
    });

    it('rejects double-encoded %252e%252e/', async () => {
      await expect(
        fileAdapter(makeAction({ type: 'file.read', target: '%252e%252e/%252e%252e/etc/passwd' }))
      ).rejects.toThrow(TRAVERSAL_PATTERN);
    });
  });

  // ── Null byte injection ─────────────────────────────────────────────
  describe('null byte injection', () => {
    it('rejects paths containing null bytes', async () => {
      await expect(
        fileAdapter(makeAction({ type: 'file.read', target: 'file.txt\0/etc/passwd' }))
      ).rejects.toThrow(/null byte|path traversal|outside.*boundary/i);
    });

    it('rejects null byte in middle of path', async () => {
      await expect(
        fileAdapter(makeAction({ type: 'file.read', target: 'src\0.js' }))
      ).rejects.toThrow(/null byte|path traversal|outside.*boundary/i);
    });
  });

  // ── All operations protected ────────────────────────────────────────
  describe('all file operations are protected', () => {
    it('rejects file.write with traversal', async () => {
      await expect(
        fileAdapter(
          makeAction({ type: 'file.write', target: '../../../tmp/evil.txt', content: 'bad' })
        )
      ).rejects.toThrow(TRAVERSAL_PATTERN);
    });

    it('rejects file.delete with traversal', async () => {
      await expect(
        fileAdapter(makeAction({ type: 'file.delete', target: '../../../tmp/evil.txt' }))
      ).rejects.toThrow(TRAVERSAL_PATTERN);
    });

    it('rejects file.move source with traversal', async () => {
      await expect(
        fileAdapter(
          makeAction({
            type: 'file.move',
            target: '../../../etc/passwd',
            destination: 'stolen.txt',
          })
        )
      ).rejects.toThrow(TRAVERSAL_PATTERN);
    });

    it('rejects file.move destination with traversal', async () => {
      await expect(
        fileAdapter(
          makeAction({
            type: 'file.move',
            target: './package.json',
            destination: '../../../tmp/evil.txt',
          })
        )
      ).rejects.toThrow(TRAVERSAL_PATTERN);
    });
  });

  // ── Symlink escape ──────────────────────────────────────────────────
  describe('symlink escape', () => {
    const testDir = join(tmpdir(), `ag-symlink-test-${Date.now()}`);
    const linkPath = join(testDir, 'evil-link');

    beforeAll(() => {
      if (!canSymlink) return;
      mkdirSync(testDir, { recursive: true });
      // Create a file outside testDir to link to
      const outsideFile = join(tmpdir(), `ag-outside-${Date.now()}.txt`);
      writeFileSync(outsideFile, 'secret data');
      symlinkSync(outsideFile, linkPath);
    });

    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it.skipIf(!canSymlink)('rejects symlinks that resolve outside project root', async () => {
      // The adapter should detect that the symlink resolves outside boundary
      await expect(
        fileAdapter(makeAction({ type: 'file.read', target: linkPath }))
      ).rejects.toThrow(TRAVERSAL_PATTERN);
    });
  });

  // ── Valid paths allowed ─────────────────────────────────────────────
  describe('valid paths allowed', () => {
    it('does not throw traversal error for relative path within project', async () => {
      try {
        await fileAdapter(makeAction({ type: 'file.read', target: './package.json' }));
      } catch (e: unknown) {
        const err = e as Error;
        // ENOENT is acceptable — traversal error is not
        expect(err.message).not.toMatch(TRAVERSAL_PATTERN);
      }
    });

    it('does not throw traversal error for simple filename', async () => {
      try {
        await fileAdapter(makeAction({ type: 'file.read', target: 'README.md' }));
      } catch (e: unknown) {
        const err = e as Error;
        expect(err.message).not.toMatch(TRAVERSAL_PATTERN);
      }
    });

    it('does not throw traversal error for nested path', async () => {
      try {
        await fileAdapter(makeAction({ type: 'file.read', target: 'src/index.ts' }));
      } catch (e: unknown) {
        const err = e as Error;
        expect(err.message).not.toMatch(TRAVERSAL_PATTERN);
      }
    });
  });
});

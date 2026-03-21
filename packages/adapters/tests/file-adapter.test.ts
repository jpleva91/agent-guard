// Tests for path traversal prevention in the file adapter
import { describe, it, expect } from 'vitest';
import { fileAdapter } from '../src/file.js';

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

describe('file adapter path traversal', () => {
  it('rejects ../etc/passwd traversal', async () => {
    await expect(
      fileAdapter(makeAction({ type: 'file.read', target: '../../../etc/passwd' }))
    ).rejects.toThrow(/outside.*boundary|path traversal/i);
  });

  it('rejects encoded traversal %2e%2e/', async () => {
    await expect(
      fileAdapter(makeAction({ type: 'file.read', target: '%2e%2e/%2e%2e/etc/passwd' }))
    ).rejects.toThrow(/outside.*boundary|path traversal/i);
  });

  it('rejects absolute path outside project', async () => {
    await expect(
      fileAdapter(makeAction({ type: 'file.read', target: '/etc/passwd' }))
    ).rejects.toThrow(/outside.*boundary|path traversal/i);
  });

  it('rejects write to path outside project', async () => {
    await expect(
      fileAdapter(
        makeAction({ type: 'file.write', target: '../../../tmp/evil.txt', content: 'bad' })
      )
    ).rejects.toThrow(/outside.*boundary|path traversal/i);
  });

  it('rejects delete of path outside project', async () => {
    await expect(
      fileAdapter(makeAction({ type: 'file.delete', target: '../../../tmp/evil.txt' }))
    ).rejects.toThrow(/outside.*boundary|path traversal/i);
  });

  it('rejects move with destination outside project', async () => {
    await expect(
      fileAdapter(
        makeAction({
          type: 'file.move',
          target: './package.json',
          destination: '../../../tmp/evil.txt',
        })
      )
    ).rejects.toThrow(/outside.*boundary|path traversal/i);
  });

  it('allows normal paths within project', async () => {
    // Should not throw traversal error for valid relative path
    // (may throw ENOENT if file doesn't exist, but should NOT throw traversal error)
    try {
      await fileAdapter(makeAction({ type: 'file.read', target: './package.json' }));
    } catch (e: unknown) {
      const err = e as Error;
      expect(err.message).not.toMatch(/path traversal/i);
      expect(err.message).not.toMatch(/outside.*boundary/i);
    }
  });
});

// Tests for file operation adapter
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
  rename: vi.fn(),
}));

import { fileAdapter } from '@red-codes/adapters';
import { readFile, writeFile, unlink, rename } from 'node:fs/promises';
import type { CanonicalAction } from '@red-codes/core';

function makeAction(overrides: Partial<CanonicalAction> & { type: string; target: string }): CanonicalAction {
  return {
    id: 'act_1',
    class: 'file',
    justification: 'test',
    timestamp: Date.now(),
    fingerprint: 'fp_1',
    ...overrides,
  } as CanonicalAction;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fileAdapter', () => {
  describe('file.read', () => {
    it('reads a file and returns path and size', async () => {
      vi.mocked(readFile).mockResolvedValue('hello world');
      const result = await fileAdapter(makeAction({ type: 'file.read', target: 'src/index.ts' }));
      expect(result).toEqual({ path: 'src/index.ts', size: 11 });
      expect(readFile).toHaveBeenCalledWith('src/index.ts', 'utf8');
    });

    it('propagates error when file does not exist', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT: no such file'));
      await expect(
        fileAdapter(makeAction({ type: 'file.read', target: 'missing.ts' }))
      ).rejects.toThrow('ENOENT');
    });
  });

  describe('file.write', () => {
    it('writes content and returns bytes written', async () => {
      vi.mocked(writeFile).mockResolvedValue();
      const action = makeAction({ type: 'file.write', target: 'out.txt', content: 'data' } as never);
      const result = await fileAdapter(action);
      expect(result).toEqual({ path: 'out.txt', written: 4 });
      expect(writeFile).toHaveBeenCalledWith('out.txt', 'data', 'utf8');
    });

    it('throws when content is missing', async () => {
      await expect(
        fileAdapter(makeAction({ type: 'file.write', target: 'out.txt' }))
      ).rejects.toThrow('file.write requires content');
    });
  });

  describe('file.delete', () => {
    it('deletes a file', async () => {
      vi.mocked(unlink).mockResolvedValue();
      const result = await fileAdapter(makeAction({ type: 'file.delete', target: 'tmp.txt' }));
      expect(result).toEqual({ path: 'tmp.txt', deleted: true });
      expect(unlink).toHaveBeenCalledWith('tmp.txt');
    });

    it('propagates error when file does not exist', async () => {
      vi.mocked(unlink).mockRejectedValue(new Error('ENOENT'));
      await expect(
        fileAdapter(makeAction({ type: 'file.delete', target: 'missing.txt' }))
      ).rejects.toThrow('ENOENT');
    });
  });

  describe('file.move', () => {
    it('moves a file to destination', async () => {
      vi.mocked(rename).mockResolvedValue();
      const action = makeAction({
        type: 'file.move',
        target: 'old.txt',
        destination: 'new.txt',
      } as never);
      const result = await fileAdapter(action);
      expect(result).toEqual({ from: 'old.txt', to: 'new.txt' });
      expect(rename).toHaveBeenCalledWith('old.txt', 'new.txt');
    });

    it('throws when destination is missing', async () => {
      await expect(
        fileAdapter(makeAction({ type: 'file.move', target: 'old.txt' }))
      ).rejects.toThrow('file.move requires destination');
    });
  });

  describe('unsupported action', () => {
    it('throws for unknown file action type', async () => {
      await expect(
        fileAdapter(makeAction({ type: 'file.unknown', target: 'x' }))
      ).rejects.toThrow('Unsupported file action: file.unknown');
    });
  });
});

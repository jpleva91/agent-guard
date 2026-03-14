// File operation adapter — executes file.read, file.write, file.delete actions.
// Node.js adapter. Uses fs APIs.

import { readFile, writeFile, unlink, rename } from 'node:fs/promises';
import type { CanonicalAction } from '@red-codes/core';

export async function fileAdapter(action: CanonicalAction): Promise<unknown> {
  const target = action.target;

  switch (action.type) {
    case 'file.read': {
      const content = await readFile(target, 'utf8');
      return { path: target, size: content.length };
    }

    case 'file.write': {
      const content = (action as Record<string, unknown>).content as string | undefined;
      if (content === undefined) {
        throw new Error('file.write requires content');
      }
      await writeFile(target, content, 'utf8');
      return { path: target, written: content.length };
    }

    case 'file.delete': {
      await unlink(target);
      return { path: target, deleted: true };
    }

    case 'file.move': {
      const destination = (action as Record<string, unknown>).destination as string | undefined;
      if (!destination) {
        throw new Error('file.move requires destination');
      }
      await rename(target, destination);
      return { from: target, to: destination };
    }

    default:
      throw new Error(`Unsupported file action: ${action.type}`);
  }
}

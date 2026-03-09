// Adapter registry — connects action classes to execution handlers.
// Node.js module. Registers file, shell, and git adapters.

import { createAdapterRegistry, createDryRunRegistry } from '../core/adapters.js';
import type { AdapterRegistry } from '../core/types.js';
import { fileAdapter } from './file.js';
import { shellAdapter } from './shell.js';
import { gitAdapter } from './git.js';

export function createLiveRegistry(): AdapterRegistry {
  const registry = createAdapterRegistry();

  registry.register('file', fileAdapter);
  registry.register('shell', shellAdapter);
  registry.register('git', gitAdapter);

  return registry;
}

export { createDryRunRegistry };

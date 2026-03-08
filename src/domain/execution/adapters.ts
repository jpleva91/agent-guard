// Execution adapters for the Agent Reference Monitor
// Adapters translate authorized action objects into executable operations.
// Each adapter validates that an action has been authorized before proceeding.
// No DOM, no Node.js APIs — pure adapter interfaces and registry.

import type {
  CanonicalAction,
  DecisionRecord,
  ExecutionResult,
  AdapterHandler,
  AdapterRegistry,
} from '../../core/types.js';
import { DECISION } from '../actions.js';

// --- Adapter Registry ---

export function createAdapterRegistry(): AdapterRegistry {
  const adapters = new Map<string, AdapterHandler>();

  function register(actionClass: string, handler: AdapterHandler): void {
    if (typeof handler !== 'function') {
      throw new Error(`Adapter handler must be a function for class: ${actionClass}`);
    }
    adapters.set(actionClass, handler);
  }

  async function execute(
    action: CanonicalAction,
    decisionRecord: DecisionRecord,
  ): Promise<ExecutionResult> {
    if (!decisionRecord || decisionRecord.decision !== DECISION.ALLOW) {
      return {
        success: false,
        error: `Action not authorized: ${decisionRecord ? decisionRecord.decision : 'no decision'}`,
      };
    }

    if (decisionRecord.actionId !== action.id) {
      return {
        success: false,
        error: `Decision record does not match action (expected ${action.id}, got ${decisionRecord.actionId})`,
      };
    }

    const adapter = adapters.get(action.class);
    if (!adapter) {
      return {
        success: false,
        error: `No adapter registered for action class: ${action.class}`,
      };
    }

    try {
      const result = await adapter(action);
      return { success: true, result };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  function has(actionClass: string): boolean {
    return adapters.has(actionClass);
  }

  function listRegistered(): string[] {
    return [...adapters.keys()];
  }

  return Object.freeze({
    register,
    execute,
    has,
    listRegistered,
  });
}

// --- Dry-Run Adapter ---

interface DryRunEntry {
  type: string;
  target: string;
  timestamp: number;
  dryRun: true;
}

export function createDryRunAdapter(): {
  adapter: AdapterHandler;
  getLog: () => DryRunEntry[];
  clear: () => void;
} {
  const log: DryRunEntry[] = [];

  const adapter: AdapterHandler = (action: CanonicalAction) => {
    const entry: DryRunEntry = {
      type: action.type,
      target: action.target,
      timestamp: Date.now(),
      dryRun: true,
    };
    log.push(entry);
    return entry;
  };

  return {
    adapter,
    getLog: () => [...log],
    clear: () => { log.length = 0; },
  };
}

export function createDryRunRegistry(): {
  registry: AdapterRegistry;
  dryRun: ReturnType<typeof createDryRunAdapter>;
} {
  const registry = createAdapterRegistry();
  const dryRun = createDryRunAdapter();

  const classes = ['file', 'test', 'git', 'shell', 'npm', 'http', 'deploy', 'infra'];
  for (const cls of classes) {
    registry.register(cls, dryRun.adapter);
  }

  return { registry, dryRun };
}

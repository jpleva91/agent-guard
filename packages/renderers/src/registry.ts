// Renderer registry — manages multiple governance renderers.
// Dispatches lifecycle events to all registered renderers.

import type {
  GovernanceRenderer,
  PolicyTracePayload,
  RendererConfig,
  RunSummary,
} from './types.js';
import type { KernelResult } from '@red-codes/kernel';
import type { MonitorDecision } from '@red-codes/kernel';
import type { GovernanceDecisionRecord } from '@red-codes/core';
import type { SimulationResult } from '@red-codes/kernel';

export interface RendererRegistry {
  /** Register a renderer. Throws if a renderer with the same ID already exists. */
  register(renderer: GovernanceRenderer): void;

  /** Unregister a renderer by ID. Calls dispose() if available. Returns true if found. */
  unregister(id: string): boolean;

  /** Get a registered renderer by ID */
  get(id: string): GovernanceRenderer | undefined;

  /** List all registered renderer IDs */
  list(): string[];

  /** Number of registered renderers */
  count(): number;

  /** Dispatch: run started */
  notifyRunStarted(config: RendererConfig): void;

  /** Dispatch: action result */
  notifyActionResult(result: KernelResult): void;

  /** Dispatch: monitor status */
  notifyMonitorStatus(decision: MonitorDecision): void;

  /** Dispatch: simulation completed */
  notifySimulation(simulation: SimulationResult): void;

  /** Dispatch: decision record */
  notifyDecisionRecord(record: GovernanceDecisionRecord): void;

  /** Dispatch: policy trace */
  notifyPolicyTrace(trace: PolicyTracePayload): void;

  /** Dispatch: run ended */
  notifyRunEnded(summary: RunSummary): void;

  /** Dispose all renderers and clear the registry */
  disposeAll(): void;
}

/**
 * Create a new renderer registry.
 *
 * Renderers are dispatched in registration order.
 * Errors in one renderer do not prevent other renderers from receiving events.
 */
export function createRendererRegistry(): RendererRegistry {
  const renderers = new Map<string, GovernanceRenderer>();

  const safeCall = (fn: () => void): void => {
    try {
      fn();
    } catch {
      // Renderer errors are non-fatal — isolate failures
    }
  };

  return {
    register(renderer) {
      if (renderers.has(renderer.id)) {
        throw new Error(`Renderer already registered: "${renderer.id}"`);
      }
      renderers.set(renderer.id, renderer);
    },

    unregister(id) {
      const renderer = renderers.get(id);
      if (!renderer) return false;
      if (renderer.dispose) {
        safeCall(() => renderer.dispose!());
      }
      renderers.delete(id);
      return true;
    },

    get(id) {
      return renderers.get(id);
    },

    list() {
      return [...renderers.keys()];
    },

    count() {
      return renderers.size;
    },

    notifyRunStarted(config) {
      for (const renderer of renderers.values()) {
        if (renderer.onRunStarted) {
          safeCall(() => renderer.onRunStarted!(config));
        }
      }
    },

    notifyActionResult(result) {
      for (const renderer of renderers.values()) {
        if (renderer.onActionResult) {
          safeCall(() => renderer.onActionResult!(result));
        }
      }
    },

    notifyMonitorStatus(decision) {
      for (const renderer of renderers.values()) {
        if (renderer.onMonitorStatus) {
          safeCall(() => renderer.onMonitorStatus!(decision));
        }
      }
    },

    notifySimulation(simulation) {
      for (const renderer of renderers.values()) {
        if (renderer.onSimulation) {
          safeCall(() => renderer.onSimulation!(simulation));
        }
      }
    },

    notifyDecisionRecord(record) {
      for (const renderer of renderers.values()) {
        if (renderer.onDecisionRecord) {
          safeCall(() => renderer.onDecisionRecord!(record));
        }
      }
    },

    notifyPolicyTrace(trace) {
      for (const renderer of renderers.values()) {
        if (renderer.onPolicyTrace) {
          safeCall(() => renderer.onPolicyTrace!(trace));
        }
      }
    },

    notifyRunEnded(summary) {
      for (const renderer of renderers.values()) {
        if (renderer.onRunEnded) {
          safeCall(() => renderer.onRunEnded!(summary));
        }
      }
    },

    disposeAll() {
      for (const renderer of renderers.values()) {
        if (renderer.dispose) {
          safeCall(() => renderer.dispose!());
        }
      }
      renderers.clear();
    },
  };
}

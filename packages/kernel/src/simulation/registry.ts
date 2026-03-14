// Simulator registry — routes intents to the correct ActionSimulator.
// Same array-based pattern as AdapterRegistry.

import type { NormalizedIntent } from '@red-codes/policy';
import type { ActionSimulator, SimulatorRegistry } from './types.js';

export function createSimulatorRegistry(): SimulatorRegistry {
  const simulators: ActionSimulator[] = [];

  return {
    register(simulator: ActionSimulator): void {
      // Prevent duplicate registration
      if (simulators.some((s) => s.id === simulator.id)) return;
      simulators.push(simulator);
    },

    find(intent: NormalizedIntent): ActionSimulator | null {
      for (const simulator of simulators) {
        if (simulator.supports(intent)) return simulator;
      }
      return null;
    },

    all(): ActionSimulator[] {
      return [...simulators];
    },
  };
}

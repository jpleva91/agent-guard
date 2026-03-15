// Simulator plugin loader — bridges the plugin registry with the simulator registry.
//
// Discovers installed simulator plugins, dynamically imports their modules,
// validates that they export a factory function conforming to the ActionSimulator
// contract, and registers them with the provided registration callback.
//
// Uses a callback pattern to avoid a direct dependency on @red-codes/kernel.

import type { InstalledPlugin, PluginRegistry } from './registry.js';

/**
 * Shape a simulator plugin module must export.
 *
 * The module must have a `createSimulator` factory function that returns
 * an object conforming to the ActionSimulator interface (id, supports, simulate).
 */
export interface SimulatorPluginModule {
  createSimulator: () => SimulatorPluginInstance;
}

/**
 * Minimal simulator interface — mirrors ActionSimulator from @red-codes/kernel.
 *
 * Declared here to avoid a direct dependency on the kernel package.
 * Community simulators implement this contract via the scaffolded template.
 */
export interface SimulatorPluginInstance {
  readonly id: string;
  supports(intent: { action: string; target?: string }): boolean;
  simulate(
    intent: { action: string; target?: string },
    context: Record<string, unknown>
  ): Promise<{
    predictedChanges: string[];
    blastRadius: number;
    riskLevel: 'low' | 'medium' | 'high';
    details: Record<string, unknown>;
    simulatorId: string;
    durationMs: number;
  }>;
}

/** Result of loading a single simulator plugin */
export interface SimulatorLoadResult {
  readonly pluginId: string;
  readonly simulatorId: string;
  readonly success: boolean;
  readonly error?: string;
}

/**
 * Load simulator plugins from the plugin registry and register them.
 *
 * @param pluginRegistry  The plugin registry to discover simulator plugins from
 * @param register        Callback to register each loaded simulator (typically SimulatorRegistry.register)
 * @returns Array of load results for each discovered simulator plugin
 */
export async function loadSimulatorPlugins(
  pluginRegistry: PluginRegistry,
  register: (simulator: SimulatorPluginInstance) => void
): Promise<readonly SimulatorLoadResult[]> {
  const simulatorPlugins = pluginRegistry.listByType('simulator');
  const results: SimulatorLoadResult[] = [];

  for (const plugin of simulatorPlugins) {
    if (!plugin.enabled) {
      results.push({
        pluginId: plugin.manifest.id,
        simulatorId: '',
        success: false,
        error: 'Plugin is disabled',
      });
      continue;
    }

    const result = await loadSingleSimulator(plugin, register);
    results.push(result);
  }

  return results;
}

/**
 * Load and register a single simulator plugin.
 */
async function loadSingleSimulator(
  plugin: InstalledPlugin,
  register: (simulator: SimulatorPluginInstance) => void
): Promise<SimulatorLoadResult> {
  const pluginId = plugin.manifest.id;

  try {
    // Dynamic import of the plugin module
    const mod = (await import(plugin.source)) as Partial<SimulatorPluginModule>;

    if (typeof mod.createSimulator !== 'function') {
      return {
        pluginId,
        simulatorId: '',
        success: false,
        error: 'Module does not export a createSimulator function',
      };
    }

    const simulator = mod.createSimulator();

    // Validate the simulator has the required shape
    if (!isValidSimulator(simulator)) {
      return {
        pluginId,
        simulatorId: '',
        success: false,
        error:
          'createSimulator() did not return a valid ActionSimulator (missing id, supports, or simulate)',
      };
    }

    register(simulator);

    return {
      pluginId,
      simulatorId: simulator.id,
      success: true,
    };
  } catch (err) {
    return {
      pluginId,
      simulatorId: '',
      success: false,
      error: `Failed to load: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Validate that an object conforms to the minimal ActionSimulator contract */
export function isValidSimulator(obj: unknown): obj is SimulatorPluginInstance {
  if (obj === null || typeof obj !== 'object') return false;
  const candidate = obj as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.supports === 'function' &&
    typeof candidate.simulate === 'function'
  );
}

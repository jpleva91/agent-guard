// Execution adapters for the Agent Reference Monitor
// Adapters translate authorized action objects into executable operations.
// Each adapter validates that an action has been authorized before proceeding.
// No DOM, no Node.js APIs — pure adapter interfaces and registry.
//
// In production, concrete adapters are injected (e.g., a Node.js file adapter
// that calls fs.writeFile). This module provides the adapter registry pattern
// and a dry-run adapter for testing/simulation.

import { DECISION } from '../actions.js';

// --- Adapter Registry ---

/**
 * Create an execution adapter registry.
 * Adapters are registered by action class and invoked when an authorized
 * action needs to be executed.
 *
 * @returns {object} Registry instance
 */
export function createAdapterRegistry() {
  const adapters = new Map();

  /**
   * Register an adapter for an action class.
   * @param {string} actionClass - Action class (e.g. 'file', 'test', 'git')
   * @param {function} handler - Async function (action) => result
   */
  function register(actionClass, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Adapter handler must be a function for class: ${actionClass}`);
    }
    adapters.set(actionClass, handler);
  }

  /**
   * Execute an authorized action through its registered adapter.
   * Refuses to execute if the decision record does not show ALLOW.
   *
   * @param {object} action - Canonical action object
   * @param {object} decisionRecord - Decision record from reference monitor
   * @returns {Promise<{ success: boolean, result?: any, error?: string }>}
   */
  async function execute(action, decisionRecord) {
    // Enforce: only authorized actions may execute
    if (!decisionRecord || decisionRecord.decision !== DECISION.ALLOW) {
      return {
        success: false,
        error: `Action not authorized: ${decisionRecord ? decisionRecord.decision : 'no decision'}`,
      };
    }

    // Verify action ID matches decision
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
      return { success: false, error: err.message };
    }
  }

  /**
   * Check if an adapter is registered for an action class.
   * @param {string} actionClass
   * @returns {boolean}
   */
  function has(actionClass) {
    return adapters.has(actionClass);
  }

  /**
   * List all registered action classes.
   * @returns {string[]}
   */
  function listRegistered() {
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

/**
 * Create a dry-run adapter that records actions without executing them.
 * Useful for testing, simulation, and policy validation.
 *
 * @returns {{ adapter: function, getLog: function, clear: function }}
 */
export function createDryRunAdapter() {
  const log = [];

  const adapter = (action) => {
    const entry = {
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

/**
 * Create an adapter registry pre-loaded with dry-run adapters for all action classes.
 * Useful for testing the full authorize → execute pipeline.
 *
 * @returns {{ registry: object, dryRun: object }}
 */
export function createDryRunRegistry() {
  const registry = createAdapterRegistry();
  const dryRun = createDryRunAdapter();

  const classes = ['file', 'test', 'git', 'shell', 'npm', 'http', 'deploy', 'infra'];
  for (const cls of classes) {
    registry.register(cls, dryRun.adapter);
  }

  return { registry, dryRun };
}

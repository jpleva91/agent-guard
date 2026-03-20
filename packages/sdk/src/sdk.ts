import type { GovernanceSDK, GovernedSession, RawActionInput, SDKConfig } from './types.js';
import type { KernelResult } from '@red-codes/kernel';
import { createSession } from './session.js';

/**
 * Create an AgentGuard governance SDK instance.
 *
 * The SDK provides a programmatic interface for integrating governance into
 * agent frameworks. Instead of relying on CLI hooks, frameworks call
 * `sdk.createSession()` and then `session.propose(action)` for each action.
 *
 * @example
 * ```ts
 * import { createGovernanceSDK } from '@red-codes/sdk';
 *
 * const sdk = createGovernanceSDK({
 *   policies: [{ id: 'p1', name: 'Safety', rules: [...], severity: 3 }],
 *   dryRun: true,
 * });
 *
 * const session = sdk.createSession();
 * const result = await session.propose({ tool: 'Bash', command: 'rm -rf /' });
 * console.log(result.allowed); // false
 * session.end();
 * ```
 */
export function createGovernanceSDK(config: SDKConfig = {}): GovernanceSDK {
  return {
    createSession(overrides?: Partial<SDKConfig>): GovernedSession {
      const merged: SDKConfig = { ...config, ...overrides };
      return createSession(merged);
    },

    async evaluate(action: RawActionInput): Promise<KernelResult> {
      const session = createSession(config);
      try {
        return await session.propose(action);
      } finally {
        session.end();
      }
    },
  };
}

// @red-codes/adapter-openclaw — OpenClaw adapter for AgentGuard.
// Governed action boundary for OpenClaw tool calls.

export const VERSION = '0.1.0';

// Types
export type {
  OpenClawToolCall,
  OpenClawContext,
  GuardRequest,
  GuardDecision,
  GuardResult,
} from './types.js';

// Normalization
export {
  normalizeOpenClawAction,
  resolveOpenClawIdentity,
  buildGuardRequest,
} from './normalize.js';

// Adapter
export { createOpenClawGuard, formatGuardDecision } from './adapter.js';
export type { OpenClawGuard } from './adapter.js';

// Default policy
export { OPENCLAW_DEFAULT_POLICY } from './policy.js';

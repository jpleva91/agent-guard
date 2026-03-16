// @red-codes/telemetry-client — Telemetry client SDK for AgentGuard.

export const VERSION = '0.1.0';

export type {
  TelemetryMode,
  TelemetryPayloadEvent,
  TrackableEvent,
  TelemetryIdentity,
  TelemetryClientConfig,
  TelemetryQueue,
  TelemetryClient,
  TelemetryStatus,
} from './types.js';

export {
  generateIdentity,
  loadIdentity,
  saveIdentity,
  deleteIdentity,
  resolveMode,
  getDefaultIdentityPath,
} from './identity.js';

export { canonicalize, signPayload, verifySignature } from './signing.js';

export { createSqliteQueue } from './queue-sqlite.js';
export { createJsonlQueue } from './queue-jsonl.js';
export { createQueue } from './queue.js';

export { createTelemetrySender } from './sender.js';
export type { TelemetrySender } from './sender.js';

export { createTelemetryClient } from './client.js';

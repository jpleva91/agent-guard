// Reference invariant plugin: data protection.
//
// Exports a plugin manifest for the AgentGuard plugin discovery system
// and the invariant definitions for registration with the invariant checker.

import type { PluginManifest } from '@red-codes/plugins';
import { DATA_PROTECTION_INVARIANTS } from './invariants.js';

export { DATA_PROTECTION_INVARIANTS } from './invariants.js';
export {
  PII_PATTERNS,
  SECRET_PATTERNS,
  LOG_PATH_PATTERNS,
  isLogPath,
  EMAIL_PATTERN,
  SSN_PATTERN,
  CREDIT_CARD_PATTERN,
  PHONE_PATTERN,
  AWS_KEY_PATTERN,
  GENERIC_API_KEY_PATTERN,
  BEARER_TOKEN_PATTERN,
  PRIVATE_KEY_PATTERN,
  CONNECTION_STRING_PATTERN,
} from './patterns.js';

/** Plugin manifest for the data protection invariant pack */
export const manifest: PluginManifest = {
  id: 'invariant-data-protection',
  name: 'Data Protection Invariants',
  version: '0.1.0',
  description:
    'Reference invariant plugin providing PII detection, secret scanning, and batch file limits',
  type: 'invariant',
  apiVersion: '^1.0.0',
  capabilities: ['filesystem:read'],
};

/** All invariants exported by this plugin */
export const invariants = DATA_PROTECTION_INVARIANTS;

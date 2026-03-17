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
  AWS_SECRET_KEY_PATTERN,
  AWS_SECRET_KEY_CONTEXT,
  GENERIC_API_KEY_PATTERN,
  BEARER_TOKEN_PATTERN,
  PRIVATE_KEY_PATTERN,
  CONNECTION_STRING_PATTERN,
  GITHUB_PAT_PATTERN,
  GITHUB_OAUTH_PATTERN,
  GITHUB_FINE_GRAINED_PAT_PATTERN,
  STRIPE_LIVE_KEY_PATTERN,
  STRIPE_TEST_KEY_PATTERN,
  SLACK_BOT_TOKEN_PATTERN,
  SLACK_USER_TOKEN_PATTERN,
  NPM_TOKEN_PATTERN,
  OPENAI_KEY_PATTERN,
  ANTHROPIC_KEY_PATTERN,
  GOOGLE_API_KEY_PATTERN,
  JWT_TOKEN_PATTERN,
  shannonEntropy,
  hasKnownCredentialPrefix,
  classifyCredentialShape,
  generateFingerprints,
  parseEnvContent,
  fingerprintEnvSecrets,
  scanForFingerprints,
} from './patterns.js';
export type { SecretPatternDef, EntropyMatch, SecretFingerprint } from './patterns.js';

/** Plugin manifest for the data protection invariant pack */
export const manifest: PluginManifest = {
  id: 'invariant-data-protection',
  name: 'Data Protection Invariants',
  version: '0.1.0',
  description:
    'Reference invariant plugin providing PII detection, secret scanning, entropy-based credential detection, known-secret fingerprinting, and batch file limits',
  type: 'invariant',
  apiVersion: '^1.0.0',
  capabilities: ['filesystem:read'],
};

/** All invariants exported by this plugin */
export const invariants = DATA_PROTECTION_INVARIANTS;

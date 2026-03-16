import { createHash } from 'node:crypto';

/**
 * Cryptographic SHA-256 for integrity verification.
 * Use for trust store, hook integrity, policy trust.
 * Returns lowercase 64-character hex digest.
 *
 * NOTE: This is separate from simpleHash() in hash.ts which is a
 * non-cryptographic djb2 hash for event fingerprinting. Do NOT
 * replace simpleHash calls with this — it would break event IDs.
 */
export function computeSHA256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

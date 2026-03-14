// Payload signing — Ed25519 sign/verify for tamper-resistant telemetry.

import { sign, verify, createPrivateKey, createPublicKey } from 'node:crypto';

/**
 * Canonicalize an object to a deterministic JSON string.
 * Sorts keys alphabetically at all levels, no whitespace.
 */
export function canonicalize(obj: unknown): string {
  return JSON.stringify(obj, (_key, value: unknown) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value as Record<string, unknown>).sort()) {
        sorted[k] = (value as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return value;
  });
}

/** Sign a canonical JSON body with an Ed25519 private key. Returns base64 signature. */
export function signPayload(body: string, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  const signature = sign(null, Buffer.from(body, 'utf8'), key);
  return signature.toString('base64');
}

/** Verify an Ed25519 signature against a canonical JSON body. */
export function verifySignature(
  body: string,
  signature: string,
  publicKeyPem: string
): boolean {
  try {
    const key = createPublicKey(publicKeyPem);
    return verify(null, Buffer.from(body, 'utf8'), key, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

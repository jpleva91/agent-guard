import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { canonicalize, signPayload, verifySignature } from '../src/signing.js';

function generateTestKeypair() {
  return generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

describe('canonicalize', () => {
  it('sorts keys alphabetically', () => {
    const result = canonicalize({ z: 1, a: 2, m: 3 });
    expect(result).toBe('{"a":2,"m":3,"z":1}');
  });

  it('sorts nested objects', () => {
    const result = canonicalize({ b: { z: 1, a: 2 }, a: 1 });
    expect(result).toBe('{"a":1,"b":{"a":2,"z":1}}');
  });

  it('preserves array order', () => {
    const result = canonicalize({ items: [3, 1, 2] });
    expect(result).toBe('{"items":[3,1,2]}');
  });

  it('produces deterministic output', () => {
    const obj = { mode: 'verified', events: [{ id: '1', ts: 100 }] };
    expect(canonicalize(obj)).toBe(canonicalize(obj));
  });

  it('handles null values', () => {
    const result = canonicalize({ a: null, b: 1 });
    expect(result).toBe('{"a":null,"b":1}');
  });
});

describe('signPayload / verifySignature', () => {
  it('sign then verify succeeds', () => {
    const { publicKey, privateKey } = generateTestKeypair();
    const body = canonicalize({ mode: 'verified', events: [] });
    const signature = signPayload(body, privateKey);

    expect(typeof signature).toBe('string');
    expect(signature.length).toBeGreaterThan(0);

    const valid = verifySignature(body, signature, publicKey);
    expect(valid).toBe(true);
  });

  it('tampered body fails verification', () => {
    const { publicKey, privateKey } = generateTestKeypair();
    const body = canonicalize({ mode: 'verified', events: [] });
    const signature = signPayload(body, privateKey);

    const tampered = canonicalize({ mode: 'anonymous', events: [] });
    expect(verifySignature(tampered, signature, publicKey)).toBe(false);
  });

  it('wrong key fails verification', () => {
    const keypair1 = generateTestKeypair();
    const keypair2 = generateTestKeypair();
    const body = 'test body';
    const signature = signPayload(body, keypair1.privateKey);

    expect(verifySignature(body, signature, keypair2.publicKey)).toBe(false);
  });

  it('invalid signature returns false', () => {
    const { publicKey } = generateTestKeypair();
    expect(verifySignature('body', 'invalid-sig', publicKey)).toBe(false);
  });

  it('invalid key returns false', () => {
    expect(verifySignature('body', 'sig', 'not-a-key')).toBe(false);
  });
});

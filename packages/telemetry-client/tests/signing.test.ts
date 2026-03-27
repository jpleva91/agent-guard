import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { canonicalize, signPayload, verifySignature } from '../src/signing.js';

// ─── Key fixture (generated once for all tests) ──────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const PRIVATE_PEM = privateKey as string;
const PUBLIC_PEM = publicKey as string;

// ─── canonicalize ────────────────────────────────────────────────────────────

describe('canonicalize', () => {
  it('serializes primitives', () => {
    expect(canonicalize(42)).toBe('42');
    expect(canonicalize('hello')).toBe('"hello"');
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize(null)).toBe('null');
  });

  it('serializes arrays preserving order', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalize(['b', 'a'])).toBe('["b","a"]');
  });

  it('serializes objects with keys sorted alphabetically', () => {
    const obj = { z: 1, a: 2, m: 3 };
    expect(canonicalize(obj)).toBe('{"a":2,"m":3,"z":1}');
  });

  it('sorts nested object keys', () => {
    const obj = { outer: { z: 'last', a: 'first' }, b: true };
    expect(canonicalize(obj)).toBe('{"b":true,"outer":{"a":"first","z":"last"}}');
  });

  it('produces identical output for equivalent objects regardless of insertion order', () => {
    const a = { x: 1, y: 2, z: 3 };
    const b = { z: 3, x: 1, y: 2 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('handles arrays of objects', () => {
    const arr = [{ b: 2, a: 1 }, { d: 4, c: 3 }];
    expect(canonicalize(arr)).toBe('[{"a":1,"b":2},{"c":3,"d":4}]');
  });

  it('handles empty object', () => {
    expect(canonicalize({})).toBe('{}');
  });

  it('handles empty array', () => {
    expect(canonicalize([])).toBe('[]');
  });
});

// ─── signPayload ─────────────────────────────────────────────────────────────

describe('signPayload', () => {
  it('returns a non-empty base64 string', () => {
    const sig = signPayload('hello world', PRIVATE_PEM);
    expect(typeof sig).toBe('string');
    expect(sig.length).toBeGreaterThan(0);
    // Ed25519 signatures are 64 bytes → 88 base64 chars
    expect(Buffer.from(sig, 'base64').length).toBe(64);
  });

  it('produces a consistent signature for the same input', () => {
    const body = '{"event":"test"}';
    const sig1 = signPayload(body, PRIVATE_PEM);
    const sig2 = signPayload(body, PRIVATE_PEM);
    expect(sig1).toBe(sig2);
  });

  it('produces different signatures for different payloads', () => {
    const sig1 = signPayload('payload-one', PRIVATE_PEM);
    const sig2 = signPayload('payload-two', PRIVATE_PEM);
    expect(sig1).not.toBe(sig2);
  });

  it('throws when given an invalid PEM key', () => {
    expect(() => signPayload('data', 'not-a-valid-key')).toThrow();
  });
});

// ─── verifySignature ─────────────────────────────────────────────────────────

describe('verifySignature', () => {
  it('returns true for a valid signature', () => {
    const body = canonicalize({ action: 'test.run', ts: 1234567890 });
    const sig = signPayload(body, PRIVATE_PEM);
    expect(verifySignature(body, sig, PUBLIC_PEM)).toBe(true);
  });

  it('returns false when the body has been tampered', () => {
    const body = canonicalize({ action: 'test.run', ts: 1234567890 });
    const sig = signPayload(body, PRIVATE_PEM);
    const tampered = canonicalize({ action: 'git.push', ts: 1234567890 });
    expect(verifySignature(tampered, sig, PUBLIC_PEM)).toBe(false);
  });

  it('returns false for a wrong public key', () => {
    const body = 'hello';
    const sig = signPayload(body, PRIVATE_PEM);
    const { publicKey: otherPublicKey } = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    expect(verifySignature(body, sig, otherPublicKey as string)).toBe(false);
  });

  it('returns false for a corrupted signature', () => {
    const body = 'payload';
    expect(verifySignature(body, 'not-a-real-sig', PUBLIC_PEM)).toBe(false);
  });

  it('returns false for an empty signature', () => {
    const body = 'payload';
    expect(verifySignature(body, '', PUBLIC_PEM)).toBe(false);
  });

  it('returns false for an invalid public key', () => {
    const body = 'payload';
    const sig = signPayload(body, PRIVATE_PEM);
    expect(verifySignature(body, sig, 'not-a-pem')).toBe(false);
  });

  it('sign → canonicalize → verify round-trips a complex object', () => {
    const obj = { user: 'agent', action: 'file.write', path: '/src/main.ts', ts: 9999 };
    const body = canonicalize(obj);
    const sig = signPayload(body, PRIVATE_PEM);
    expect(verifySignature(body, sig, PUBLIC_PEM)).toBe(true);
  });
});

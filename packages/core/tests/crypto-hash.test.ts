import { describe, it, expect } from 'vitest';
import { computeSHA256 } from '../src/crypto-hash.js';

describe('computeSHA256', () => {
  it('returns a 64-character hex digest for a string', () => {
    const hash = computeSHA256('hello world');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns correct SHA-256 for empty string', () => {
    expect(computeSHA256('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('accepts a Buffer', () => {
    expect(computeSHA256(Buffer.from('hello world'))).toBe(computeSHA256('hello world'));
  });

  it('is deterministic', () => {
    expect(computeSHA256('test')).toBe(computeSHA256('test'));
  });
});

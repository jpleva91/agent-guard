import { describe, it, expect } from 'vitest';
import { simpleHash } from '../src/hash.js';

describe('simpleHash', () => {
  it('returns a base-36 string', () => {
    const result = simpleHash('hello');
    expect(typeof result).toBe('string');
    expect(/^[0-9a-z]+$/.test(result)).toBe(true);
  });

  it('produces deterministic output for same input', () => {
    expect(simpleHash('test')).toBe(simpleHash('test'));
  });

  it('produces different hashes for different inputs', () => {
    expect(simpleHash('foo')).not.toBe(simpleHash('bar'));
  });

  it('handles empty string', () => {
    const result = simpleHash('');
    expect(typeof result).toBe('string');
    expect(result).toBe('0');
  });

  it('handles long strings', () => {
    const long = 'a'.repeat(10000);
    const result = simpleHash(long);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles strings with special characters', () => {
    const result = simpleHash('hello\nworld\t!@#$%');
    expect(typeof result).toBe('string');
  });
});

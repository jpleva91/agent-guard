import { describe, it, expect } from 'vitest';
import { getRetryCount, incrementRetry } from '../src/commands/claude-hook.js';

describe('getRetryCount', () => {
  it('returns 0 when no retryCounts exist', () => {
    const state: Record<string, unknown> = {};
    expect(getRetryCount(state, 'git.push:policy1:0')).toBe(0);
  });

  it('returns 0 for an unknown key', () => {
    const state: Record<string, unknown> = {
      retryCounts: { 'git.push:policy1:0': 2 },
    };
    expect(getRetryCount(state, 'file.write:policy2:1')).toBe(0);
  });

  it('returns the stored count for a known key', () => {
    const state: Record<string, unknown> = {
      retryCounts: { 'git.push:policy1:0': 3 },
    };
    expect(getRetryCount(state, 'git.push:policy1:0')).toBe(3);
  });
});

describe('incrementRetry', () => {
  it('initializes retryCounts and sets key to 1 on first call', () => {
    const state: Record<string, unknown> = {};
    incrementRetry(state, 'git.push:policy1:0');
    expect(getRetryCount(state, 'git.push:policy1:0')).toBe(1);
  });

  it('increments an existing key', () => {
    const state: Record<string, unknown> = {
      retryCounts: { 'git.push:policy1:0': 2 },
    };
    incrementRetry(state, 'git.push:policy1:0');
    expect(getRetryCount(state, 'git.push:policy1:0')).toBe(3);
  });

  it('tracks separate keys independently', () => {
    const state: Record<string, unknown> = {};
    incrementRetry(state, 'git.push:policy1:0');
    incrementRetry(state, 'git.push:policy1:0');
    incrementRetry(state, 'file.write:policy2:1');
    expect(getRetryCount(state, 'git.push:policy1:0')).toBe(2);
    expect(getRetryCount(state, 'file.write:policy2:1')).toBe(1);
  });
});

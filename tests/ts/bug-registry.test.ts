import { describe, it, expect, beforeEach } from 'vitest';
import { BugRegistry } from '../../src/core/bug-registry.js';
import type { BugEvent } from '../../src/core/types.js';

function makeBug(id: string, severity: 1 | 2 | 3 | 4 | 5 = 3): BugEvent {
  return {
    id,
    type: 'TypeError',
    source: 'console',
    errorMessage: `Error #${id}`,
    timestamp: Date.now(),
    severity,
  };
}

describe('BugRegistry', () => {
  let registry: BugRegistry;

  beforeEach(() => {
    registry = new BugRegistry();
  });

  it('should add and retrieve bugs', () => {
    const bug = makeBug('b1');
    expect(registry.add(bug)).toBe(true);
    expect(registry.get('b1')).toEqual(bug);
  });

  it('should reject duplicate additions', () => {
    const bug = makeBug('b1');
    registry.add(bug);
    expect(registry.add(bug)).toBe(false);
  });

  it('should check existence with has()', () => {
    expect(registry.has('b1')).toBe(false);
    registry.add(makeBug('b1'));
    expect(registry.has('b1')).toBe(true);
  });

  it('should resolve bugs', () => {
    registry.add(makeBug('b1'));
    expect(registry.resolve('b1')).toBe(true);
    expect(registry.isResolved('b1')).toBe(true);
  });

  it('should reject resolving non-existent bugs', () => {
    expect(registry.resolve('nope')).toBe(false);
  });

  it('should reject resolving already-resolved bugs', () => {
    registry.add(makeBug('b1'));
    registry.resolve('b1');
    expect(registry.resolve('b1')).toBe(false);
  });

  it('should return active (unresolved) bugs', () => {
    registry.add(makeBug('b1'));
    registry.add(makeBug('b2'));
    registry.add(makeBug('b3'));
    registry.resolve('b2');

    const active = registry.getActive();
    expect(active).toHaveLength(2);
    expect(active.map((b) => b.id).sort()).toEqual(['b1', 'b3']);
  });

  it('should return all bugs', () => {
    registry.add(makeBug('b1'));
    registry.add(makeBug('b2'));
    registry.resolve('b1');

    expect(registry.getAll()).toHaveLength(2);
  });

  it('should track counts correctly', () => {
    registry.add(makeBug('b1'));
    registry.add(makeBug('b2'));
    registry.add(makeBug('b3'));
    registry.resolve('b1');

    expect(registry.totalCount()).toBe(3);
    expect(registry.activeCount()).toBe(2);
  });

  it('should clear all data', () => {
    registry.add(makeBug('b1'));
    registry.resolve('b1');
    registry.clear();

    expect(registry.totalCount()).toBe(0);
    expect(registry.activeCount()).toBe(0);
    expect(registry.has('b1')).toBe(false);
  });
});

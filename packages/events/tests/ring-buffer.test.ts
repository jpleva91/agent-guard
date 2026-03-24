import { describe, it, expect } from 'vitest';
import { createRingBuffer } from '../src/ring-buffer.js';

describe('RingBuffer', () => {
  it('starts empty', () => {
    const buf = createRingBuffer<number>(4);
    expect(buf.size()).toBe(0);
    expect(buf.capacity()).toBe(4);
    expect(buf.dropped()).toBe(0);
    expect(buf.drain()).toEqual([]);
  });

  it('writes and drains in order', () => {
    const buf = createRingBuffer<number>(4);
    buf.write(1);
    buf.write(2);
    buf.write(3);
    expect(buf.size()).toBe(3);
    expect(buf.drain()).toEqual([1, 2, 3]);
    expect(buf.size()).toBe(0);
  });

  it('drain returns empty after drain', () => {
    const buf = createRingBuffer<number>(4);
    buf.write(1);
    buf.drain();
    expect(buf.drain()).toEqual([]);
  });

  it('overwrites oldest when full', () => {
    const buf = createRingBuffer<number>(3);
    buf.write(1);
    buf.write(2);
    buf.write(3);
    buf.write(4); // overwrites 1
    expect(buf.size()).toBe(3);
    expect(buf.dropped()).toBe(1);
    expect(buf.drain()).toEqual([2, 3, 4]);
  });

  it('tracks total dropped across multiple overwrites', () => {
    const buf = createRingBuffer<number>(2);
    buf.write(1);
    buf.write(2);
    buf.write(3); // overwrites 1
    buf.write(4); // overwrites 2
    buf.write(5); // overwrites 3
    expect(buf.dropped()).toBe(3);
    expect(buf.drain()).toEqual([4, 5]);
  });

  it('handles capacity of 1', () => {
    const buf = createRingBuffer<string>(1);
    buf.write('a');
    expect(buf.size()).toBe(1);
    buf.write('b'); // overwrites 'a'
    expect(buf.dropped()).toBe(1);
    expect(buf.drain()).toEqual(['b']);
  });

  it('rejects capacity < 1', () => {
    expect(() => createRingBuffer<number>(0)).toThrow('capacity must be >= 1');
    expect(() => createRingBuffer<number>(-1)).toThrow('capacity must be >= 1');
  });

  it('clear resets the buffer', () => {
    const buf = createRingBuffer<number>(4);
    buf.write(1);
    buf.write(2);
    buf.clear();
    expect(buf.size()).toBe(0);
    expect(buf.drain()).toEqual([]);
  });

  it('works correctly after drain and refill', () => {
    const buf = createRingBuffer<number>(3);
    buf.write(1);
    buf.write(2);
    buf.drain();
    buf.write(3);
    buf.write(4);
    expect(buf.drain()).toEqual([3, 4]);
  });

  it('handles large number of writes and drains', () => {
    const buf = createRingBuffer<number>(100);
    for (let i = 0; i < 1000; i++) {
      buf.write(i);
    }
    // Last 100 items should remain (900 dropped)
    expect(buf.dropped()).toBe(900);
    const drained = buf.drain();
    expect(drained.length).toBe(100);
    expect(drained[0]).toBe(900);
    expect(drained[99]).toBe(999);
  });

  it('write is O(1) — does not depend on buffer size', () => {
    const buf = createRingBuffer<number>(10000);
    const start = performance.now();
    for (let i = 0; i < 100000; i++) {
      buf.write(i);
    }
    const elapsed = performance.now() - start;
    // Should complete in well under 1 second even for 100k writes
    expect(elapsed).toBeLessThan(1000);
  });
});

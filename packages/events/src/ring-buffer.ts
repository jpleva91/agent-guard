/**
 * RingBuffer — Fixed-capacity circular buffer for the Emitter plane.
 *
 * Provides O(1) synchronous writes with bounded memory. When full,
 * the oldest entries are silently overwritten. The Evaluator plane writes
 * here with zero I/O; the Shipper plane drains periodically.
 *
 * @see KE-4 Plane Separation (Issue #687)
 */

export interface RingBuffer<T> {
  /** Append an item. O(1), never blocks, never throws. Overwrites oldest if full. */
  write(item: T): void;
  /** Remove and return all buffered items in insertion order. Resets the buffer. */
  drain(): T[];
  /** Number of items currently buffered. */
  size(): number;
  /** Maximum capacity of the buffer. */
  capacity(): number;
  /** Number of items dropped (overwritten) since creation. */
  dropped(): number;
  /** Discard all buffered items. */
  clear(): void;
}

/**
 * Create a fixed-capacity ring buffer.
 *
 * @param capacity Maximum number of items the buffer can hold. Must be >= 1.
 */
export function createRingBuffer<T>(capacity: number): RingBuffer<T> {
  if (capacity < 1) {
    throw new Error(`RingBuffer capacity must be >= 1, got ${capacity}`);
  }

  const buf: (T | undefined)[] = new Array(capacity);
  let head = 0; // next write position
  let count = 0;
  let totalDropped = 0;

  return {
    write(item: T): void {
      if (count === capacity) {
        // Buffer is full — overwrite oldest entry
        totalDropped++;
      } else {
        count++;
      }
      buf[head] = item;
      head = (head + 1) % capacity;
    },

    drain(): T[] {
      if (count === 0) return [];

      const result: T[] = new Array(count);
      // Start position is (head - count) wrapped around
      const start = (head - count + capacity) % capacity;

      for (let i = 0; i < count; i++) {
        result[i] = buf[(start + i) % capacity] as T;
      }

      // Reset
      count = 0;
      head = 0;

      return result;
    },

    size(): number {
      return count;
    },

    capacity(): number {
      return capacity;
    },

    dropped(): number {
      return totalDropped;
    },

    clear(): void {
      count = 0;
      head = 0;
    },
  };
}

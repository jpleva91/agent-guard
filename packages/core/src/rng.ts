// Seeded pseudo-random number generator for deterministic replay.
// Uses the mulberry32 algorithm — fast, simple, well-distributed outputs.
// Same seed + same call sequence = identical results.

/**
 * A seeded PRNG instance. All methods are deterministic given the same
 * seed and the same sequence of calls.
 */
export interface SeededRng {
  /** The seed used to initialize this RNG */
  readonly seed: number;
  /** Returns a random float in [0, 1) */
  random(): number;
  /** Returns a random integer in [min, max) */
  randomInt(min: number, max: number): number;
  /** Returns a random hex string of the given length */
  randomHex(length: number): string;
  /** Creates a fork with a derived seed (independent stream) */
  fork(): SeededRng;
}

/**
 * Generate a seed from system entropy (non-deterministic).
 * Used when recording a new session to capture the initial seed.
 */
export function generateSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

/**
 * Create a seeded PRNG using the mulberry32 algorithm.
 *
 * Mulberry32 is a simple 32-bit state PRNG with good statistical properties.
 * It passes BigCrush and is sufficient for ID generation and shuffling.
 */
export function createSeededRng(seed: number): SeededRng {
  let state = seed >>> 0;

  function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  }

  return {
    get seed() {
      return seed;
    },

    random: next,

    randomInt(min: number, max: number): number {
      return Math.floor(next() * (max - min)) + min;
    },

    randomHex(length: number): string {
      const chars = '0123456789abcdef';
      let result = '';
      for (let i = 0; i < length; i++) {
        result += chars[Math.floor(next() * 16)];
      }
      return result;
    },

    fork(): SeededRng {
      const derivedSeed = (next() * 0xffffffff) >>> 0;
      return createSeededRng(derivedSeed);
    },
  };
}

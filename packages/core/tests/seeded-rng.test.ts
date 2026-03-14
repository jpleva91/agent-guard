import { describe, it, expect } from 'vitest';
import { createSeededRng, generateSeed } from '@red-codes/core';

describe('SeededRng', () => {
  describe('determinism', () => {
    it('produces identical sequences from the same seed', () => {
      const rng1 = createSeededRng(42);
      const rng2 = createSeededRng(42);

      const seq1 = Array.from({ length: 100 }, () => rng1.random());
      const seq2 = Array.from({ length: 100 }, () => rng2.random());

      expect(seq1).toEqual(seq2);
    });

    it('produces different sequences from different seeds', () => {
      const rng1 = createSeededRng(42);
      const rng2 = createSeededRng(43);

      const seq1 = Array.from({ length: 10 }, () => rng1.random());
      const seq2 = Array.from({ length: 10 }, () => rng2.random());

      expect(seq1).not.toEqual(seq2);
    });

    it('exposes the original seed', () => {
      const rng = createSeededRng(12345);
      expect(rng.seed).toBe(12345);
    });
  });

  describe('random()', () => {
    it('returns values in [0, 1)', () => {
      const rng = createSeededRng(99);
      for (let i = 0; i < 1000; i++) {
        const val = rng.random();
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(1);
      }
    });

    it('produces varied output (not all the same)', () => {
      const rng = createSeededRng(77);
      const values = new Set(Array.from({ length: 100 }, () => rng.random()));
      expect(values.size).toBeGreaterThan(90);
    });
  });

  describe('randomInt()', () => {
    it('returns values in [min, max)', () => {
      const rng = createSeededRng(55);
      for (let i = 0; i < 1000; i++) {
        const val = rng.randomInt(5, 15);
        expect(val).toBeGreaterThanOrEqual(5);
        expect(val).toBeLessThan(15);
        expect(Number.isInteger(val)).toBe(true);
      }
    });

    it('is deterministic', () => {
      const rng1 = createSeededRng(42);
      const rng2 = createSeededRng(42);

      const seq1 = Array.from({ length: 50 }, () => rng1.randomInt(0, 100));
      const seq2 = Array.from({ length: 50 }, () => rng2.randomInt(0, 100));

      expect(seq1).toEqual(seq2);
    });
  });

  describe('randomHex()', () => {
    it('returns a hex string of the given length', () => {
      const rng = createSeededRng(88);
      const hex = rng.randomHex(16);
      expect(hex).toHaveLength(16);
      expect(hex).toMatch(/^[0-9a-f]+$/);
    });

    it('is deterministic', () => {
      const rng1 = createSeededRng(42);
      const rng2 = createSeededRng(42);

      expect(rng1.randomHex(8)).toBe(rng2.randomHex(8));
    });
  });

  describe('fork()', () => {
    it('creates an independent RNG stream', () => {
      const parent = createSeededRng(42);
      parent.random(); // advance state
      const child = parent.fork();

      // Parent and child should produce different sequences
      const parentSeq = Array.from({ length: 10 }, () => parent.random());
      const childSeq = Array.from({ length: 10 }, () => child.random());

      expect(parentSeq).not.toEqual(childSeq);
    });

    it('fork is deterministic from the same initial state', () => {
      const rng1 = createSeededRng(42);
      const rng2 = createSeededRng(42);

      // Both advance same number of steps before forking
      rng1.random();
      rng2.random();

      const child1 = rng1.fork();
      const child2 = rng2.fork();

      const seq1 = Array.from({ length: 10 }, () => child1.random());
      const seq2 = Array.from({ length: 10 }, () => child2.random());

      expect(seq1).toEqual(seq2);
    });
  });

  describe('generateSeed()', () => {
    it('returns a non-negative integer', () => {
      const seed = generateSeed();
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(seed)).toBe(true);
    });

    it('returns different seeds on successive calls', () => {
      const seeds = new Set(Array.from({ length: 10 }, () => generateSeed()));
      // At least some should differ (probabilistic but essentially guaranteed)
      expect(seeds.size).toBeGreaterThan(1);
    });
  });

  describe('edge cases', () => {
    it('handles seed of 0', () => {
      const rng = createSeededRng(0);
      const val = rng.random();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    });

    it('handles large seed values', () => {
      const rng = createSeededRng(0xffffffff);
      const val = rng.random();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    });
  });
});

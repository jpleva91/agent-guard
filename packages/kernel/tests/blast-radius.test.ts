import { describe, it, expect } from 'vitest';
import { computeBlastRadius, DEFAULT_WEIGHTS } from '@red-codes/kernel';
import type { NormalizedIntent } from '@red-codes/policy';

function makeIntent(overrides: Partial<NormalizedIntent> = {}): NormalizedIntent {
  return {
    action: 'file.write',
    target: 'src/index.ts',
    agent: 'test-agent',
    destructive: false,
    ...overrides,
  };
}

describe('blast-radius computation engine', () => {
  describe('computeBlastRadius', () => {
    it('returns low risk for a single file write to a normal path', () => {
      const result = computeBlastRadius(makeIntent(), 10);
      expect(result.rawCount).toBe(1);
      expect(result.weightedScore).toBe(DEFAULT_WEIGHTS.write); // 1 * 1.5
      expect(result.riskLevel).toBe('low');
      expect(result.exceeded).toBe(false);
    });

    it('applies delete multiplier for file.delete actions', () => {
      const result = computeBlastRadius(
        makeIntent({ action: 'file.delete', filesAffected: 3 }),
        100
      );
      expect(result.weightedScore).toBe(3 * DEFAULT_WEIGHTS.delete); // 3 * 3.0 = 9
      expect(result.factors.some((f) => f.name === 'delete-action')).toBe(true);
    });

    it('applies sensitive path multiplier for .env files', () => {
      const result = computeBlastRadius(
        makeIntent({ target: '.env.production', filesAffected: 1 }),
        100
      );
      // 1 * write(1.5) * sensitive(5.0) = 7.5
      expect(result.weightedScore).toBe(1 * DEFAULT_WEIGHTS.write * DEFAULT_WEIGHTS.sensitivePath);
      expect(result.factors.some((f) => f.name === 'sensitive-path')).toBe(true);
    });

    it('applies config path multiplier for package.json', () => {
      const result = computeBlastRadius(
        makeIntent({ target: 'package.json', filesAffected: 1 }),
        100
      );
      // 1 * write(1.5) * config(2.0) = 3.0
      expect(result.weightedScore).toBe(1 * DEFAULT_WEIGHTS.write * DEFAULT_WEIGHTS.configPath);
      expect(result.factors.some((f) => f.name === 'config-path')).toBe(true);
    });

    it('stacks sensitive and config multipliers for .github/credentials.json', () => {
      const result = computeBlastRadius(
        makeIntent({ target: '.github/credentials.json', filesAffected: 1 }),
        100
      );
      // 1 * write(1.5) * sensitive(5.0) * config(2.0) = 15
      const expected =
        DEFAULT_WEIGHTS.write * DEFAULT_WEIGHTS.sensitivePath * DEFAULT_WEIGHTS.configPath;
      expect(result.weightedScore).toBe(expected);
      expect(result.factors).toHaveLength(3); // write + sensitive + config
    });

    it('detects threshold exceeded', () => {
      const result = computeBlastRadius(makeIntent({ filesAffected: 10 }), 10);
      // 10 * write(1.5) = 15, threshold 10
      expect(result.exceeded).toBe(true);
      expect(result.weightedScore).toBe(15);
      expect(result.threshold).toBe(10);
    });

    it('does not exceed when score equals threshold', () => {
      // weightedScore must be strictly greater than threshold
      const result = computeBlastRadius(
        makeIntent({ action: 'shell.exec', filesAffected: 10 }),
        10
      );
      // 10 * shell(1.0) = 10, threshold 10
      expect(result.exceeded).toBe(false);
    });

    it('applies git force-push multiplier', () => {
      const result = computeBlastRadius(
        makeIntent({ action: 'git.force-push', filesAffected: 1 }),
        100
      );
      // git weight * 2 = 4.0
      expect(result.factors[0].multiplier).toBe(DEFAULT_WEIGHTS.git * 2);
    });

    it('applies git branch-delete multiplier', () => {
      const result = computeBlastRadius(
        makeIntent({ action: 'git.branch.delete', filesAffected: 1 }),
        100
      );
      expect(result.factors[0].multiplier).toBe(DEFAULT_WEIGHTS.git * 1.5);
    });

    it('returns medium risk for scores between 15 and 50', () => {
      const result = computeBlastRadius(makeIntent({ filesAffected: 10 }), 100);
      // 10 * write(1.5) = 15
      expect(result.riskLevel).toBe('medium');
    });

    it('returns high risk for scores >= 50', () => {
      const result = computeBlastRadius(makeIntent({ filesAffected: 50 }), 1000);
      // 50 * write(1.5) = 75
      expect(result.riskLevel).toBe('high');
    });

    it('defaults filesAffected to 1 when not provided', () => {
      const result = computeBlastRadius(makeIntent({ filesAffected: undefined }), 100);
      expect(result.rawCount).toBe(1);
    });

    it('supports custom weights', () => {
      const customWeights = { ...DEFAULT_WEIGHTS, write: 10.0 };
      const result = computeBlastRadius(makeIntent({ filesAffected: 2 }), 100, customWeights);
      // 2 * 10.0 = 20
      expect(result.weightedScore).toBe(20);
    });

    it('read actions have very low impact', () => {
      const result = computeBlastRadius(
        makeIntent({ action: 'file.read', filesAffected: 100 }),
        100
      );
      // 100 * read(0.1) = 10
      expect(result.weightedScore).toBe(10);
      expect(result.riskLevel).toBe('low');
      expect(result.exceeded).toBe(false);
    });

    it('applies destructive command multiplier for destructive shell commands', () => {
      const result = computeBlastRadius(
        makeIntent({ action: 'shell.exec', destructive: true, filesAffected: 1 }),
        100
      );
      // 1 * shell(1.0) * destructive(4.0) = 4.0
      expect(result.weightedScore).toBe(DEFAULT_WEIGHTS.shell * DEFAULT_WEIGHTS.destructive);
      expect(result.factors.some((f) => f.name === 'destructive-command')).toBe(true);
    });

    it('does not apply destructive multiplier for non-destructive commands', () => {
      const result = computeBlastRadius(
        makeIntent({ action: 'shell.exec', destructive: false, filesAffected: 1 }),
        100
      );
      // 1 * shell(1.0) = 1.0, no destructive factor
      expect(result.weightedScore).toBe(DEFAULT_WEIGHTS.shell);
      expect(result.factors.some((f) => f.name === 'destructive-command')).toBe(false);
    });

    it('stacks destructive multiplier with sensitive path', () => {
      const result = computeBlastRadius(
        makeIntent({
          action: 'shell.exec',
          destructive: true,
          target: '.env',
          filesAffected: 1,
        }),
        100
      );
      // 1 * shell(1.0) * destructive(4.0) * sensitive(5.0) = 20
      const expected =
        DEFAULT_WEIGHTS.shell * DEFAULT_WEIGHTS.destructive * DEFAULT_WEIGHTS.sensitivePath;
      expect(result.weightedScore).toBe(expected);
      expect(result.factors).toHaveLength(3); // shell + destructive + sensitive
    });
  });
});

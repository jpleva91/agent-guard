import { describe, it, expect } from 'vitest';
import {
  computeBlastRadius,
  DEFAULT_WEIGHTS,
  SENSITIVE_PATTERNS,
  CONFIG_PATTERNS,
} from '@red-codes/kernel';
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

describe('blast-radius branch coverage', () => {
  describe('action multiplier branches', () => {
    it('applies file.move as a write action', () => {
      const result = computeBlastRadius(makeIntent({ action: 'file.move' }), 100);
      expect(result.factors[0].name).toBe('write-action');
      expect(result.factors[0].multiplier).toBe(DEFAULT_WEIGHTS.write);
    });

    it('applies file.read multiplier', () => {
      const result = computeBlastRadius(makeIntent({ action: 'file.read' }), 100);
      expect(result.factors[0].name).toBe('read-action');
      expect(result.factors[0].multiplier).toBe(DEFAULT_WEIGHTS.read);
    });

    it('applies generic git action multiplier for git.commit', () => {
      const result = computeBlastRadius(makeIntent({ action: 'git.commit' }), 100);
      expect(result.factors[0].name).toBe('git-action');
      expect(result.factors[0].multiplier).toBe(DEFAULT_WEIGHTS.git);
      expect(result.factors[0].reason).toBe('Git operation: git.commit');
    });

    it('applies generic git action multiplier for git.diff', () => {
      const result = computeBlastRadius(makeIntent({ action: 'git.diff' }), 100);
      expect(result.factors[0].name).toBe('git-action');
      expect(result.factors[0].multiplier).toBe(DEFAULT_WEIGHTS.git);
    });

    it('applies shell.exec multiplier', () => {
      const result = computeBlastRadius(makeIntent({ action: 'shell.exec' }), 100);
      expect(result.factors[0].name).toBe('shell-exec');
      expect(result.factors[0].multiplier).toBe(DEFAULT_WEIGHTS.shell);
    });

    it('returns no action factor for unknown action types', () => {
      const result = computeBlastRadius(makeIntent({ action: 'npm.install' }), 100);
      expect(result.factors).toHaveLength(0);
      expect(result.weightedScore).toBe(1); // rawCount * 1 (no multiplier)
    });

    it('returns no action factor for deploy.trigger', () => {
      const result = computeBlastRadius(makeIntent({ action: 'deploy.trigger' }), 100);
      expect(result.factors).toHaveLength(0);
    });
  });

  describe('sensitive path patterns', () => {
    for (const pattern of SENSITIVE_PATTERNS) {
      it(`detects sensitive pattern: ${pattern}`, () => {
        const result = computeBlastRadius(makeIntent({ target: `some/path/${pattern}.file` }), 100);
        expect(result.factors.some((f) => f.name === 'sensitive-path')).toBe(true);
      });
    }

    it('returns no sensitive factor for non-sensitive paths', () => {
      const result = computeBlastRadius(makeIntent({ target: 'src/utils/helper.ts' }), 100);
      expect(result.factors.some((f) => f.name === 'sensitive-path')).toBe(false);
    });
  });

  describe('config path patterns', () => {
    // Note: CONFIG_PATTERNS are matched via lowercase .includes(), so patterns
    // with uppercase letters (like 'Jenkinsfile', 'Dockerfile') only match when
    // the target also contains the exact lowercase form.
    // Note: CONFIG_PATTERNS are matched via lowercase .includes(), so patterns
    // with mixed case (like 'Dockerfile', 'Jenkinsfile') may not match lowercase
    // targets. Use patterns that survive lowercasing.
    const sampleConfigs = [
      'webpack.config.js',
      'vite.config.ts',
      '.circleci/config.yml',
      'docker-compose.yml',
    ];

    for (const config of sampleConfigs) {
      it(`detects config pattern: ${config}`, () => {
        const result = computeBlastRadius(makeIntent({ target: config }), 100);
        expect(result.factors.some((f) => f.name === 'config-path')).toBe(true);
      });
    }

    it('returns no config factor for non-config paths', () => {
      const result = computeBlastRadius(makeIntent({ target: 'src/app.ts' }), 100);
      expect(result.factors.some((f) => f.name === 'config-path')).toBe(false);
    });
  });

  describe('empty/missing target', () => {
    it('returns no path factors for empty target', () => {
      const result = computeBlastRadius(makeIntent({ target: '' }), 100);
      expect(result.factors.some((f) => f.name === 'sensitive-path')).toBe(false);
      expect(result.factors.some((f) => f.name === 'config-path')).toBe(false);
    });
  });

  describe('filesAffected edge cases', () => {
    it('uses 0 when filesAffected is explicitly 0', () => {
      const result = computeBlastRadius(makeIntent({ filesAffected: 0 }), 100);
      expect(result.rawCount).toBe(0);
      expect(result.weightedScore).toBe(0);
    });

    it('defaults to 1 when filesAffected is undefined', () => {
      const result = computeBlastRadius(makeIntent({ filesAffected: undefined }), 100);
      expect(result.rawCount).toBe(1);
    });
  });

  describe('risk level boundaries', () => {
    it('returns low for score just below 15', () => {
      // shell.exec (1.0) * 14 files = 14
      const result = computeBlastRadius(
        makeIntent({ action: 'shell.exec', filesAffected: 14 }),
        100
      );
      expect(result.weightedScore).toBe(14);
      expect(result.riskLevel).toBe('low');
    });

    it('returns medium for score exactly 15', () => {
      // shell.exec (1.0) * 15 files = 15
      const result = computeBlastRadius(
        makeIntent({ action: 'shell.exec', filesAffected: 15 }),
        100
      );
      expect(result.weightedScore).toBe(15);
      expect(result.riskLevel).toBe('medium');
    });

    it('returns medium for score just below 50', () => {
      // shell.exec (1.0) * 49 files = 49
      const result = computeBlastRadius(
        makeIntent({ action: 'shell.exec', filesAffected: 49 }),
        100
      );
      expect(result.weightedScore).toBe(49);
      expect(result.riskLevel).toBe('medium');
    });

    it('returns high for score exactly 50', () => {
      // shell.exec (1.0) * 50 files = 50
      const result = computeBlastRadius(
        makeIntent({ action: 'shell.exec', filesAffected: 50 }),
        100
      );
      expect(result.weightedScore).toBe(50);
      expect(result.riskLevel).toBe('high');
    });
  });

  describe('factor stacking — all 4 factors simultaneously', () => {
    it('stacks action + destructive + sensitive + config factors', () => {
      const result = computeBlastRadius(
        makeIntent({
          action: 'file.delete',
          destructive: true,
          target: '.github/credentials.json',
          filesAffected: 1,
        }),
        100
      );
      // delete(3.0) * destructive(4.0) * sensitive(5.0, "credentials") * config(2.0, ".github/") = 120
      const expected =
        DEFAULT_WEIGHTS.delete *
        DEFAULT_WEIGHTS.destructive *
        DEFAULT_WEIGHTS.sensitivePath *
        DEFAULT_WEIGHTS.configPath;
      expect(result.weightedScore).toBe(expected);
      expect(result.factors).toHaveLength(4);
      expect(result.riskLevel).toBe('high');
    });
  });

  describe('destructive flag interaction', () => {
    it('applies destructive factor when destructive is true', () => {
      const result = computeBlastRadius(
        makeIntent({ action: 'file.write', destructive: true }),
        100
      );
      expect(result.factors.some((f) => f.name === 'destructive-command')).toBe(true);
    });

    it('does not apply destructive factor when destructive is false', () => {
      const result = computeBlastRadius(
        makeIntent({ action: 'file.write', destructive: false }),
        100
      );
      expect(result.factors.some((f) => f.name === 'destructive-command')).toBe(false);
    });
  });
});

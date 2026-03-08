import { describe, it, expect } from 'vitest';
import {
  matchScope,
  matchCapability,
  validatePolicy,
  evaluate,
  createDenyAllPolicy,
  createDevPolicy,
} from '../../src/domain/policy.js';

describe('domain/policy', () => {
  describe('matchScope', () => {
    it('matches wildcard', () => {
      expect(matchScope('*', 'anything')).toBe(true);
    });

    it('matches exact', () => {
      expect(matchScope('src/index.ts', 'src/index.ts')).toBe(true);
      expect(matchScope('src/index.ts', 'src/other.ts')).toBe(false);
    });

    it('matches single glob', () => {
      expect(matchScope('src/*.ts', 'src/index.ts')).toBe(true);
      expect(matchScope('src/*.ts', 'src/sub/index.ts')).toBe(false);
    });

    it('matches double glob', () => {
      expect(matchScope('src/**', 'src/sub/index.ts')).toBe(true);
      expect(matchScope('src/**', 'lib/index.ts')).toBe(false);
    });
  });

  describe('matchCapability', () => {
    it('matches action type and scope', () => {
      expect(matchCapability('file.read:*', 'file.read', 'src/index.ts')).toBe(true);
      expect(matchCapability('file.write:src/**', 'file.write', 'src/foo.ts')).toBe(true);
    });

    it('rejects mismatched type', () => {
      expect(matchCapability('file.read:*', 'file.write', 'src/foo.ts')).toBe(false);
    });

    it('rejects missing colon', () => {
      expect(matchCapability('file.read', 'file.read', 'anything')).toBe(false);
    });

    it('supports wildcard action types', () => {
      expect(matchCapability('test.*:*', 'test.run', 'anything')).toBe(true);
      expect(matchCapability('test.*:*', 'git.commit', 'anything')).toBe(false);
    });
  });

  describe('validatePolicy', () => {
    it('validates a correct policy', () => {
      const result = validatePolicy({
        capabilities: ['file.read:*'],
      });
      expect(result.valid).toBe(true);
    });

    it('rejects non-object', () => {
      const result = validatePolicy(null);
      expect(result.valid).toBe(false);
    });

    it('rejects missing capabilities', () => {
      const result = validatePolicy({});
      expect(result.valid).toBe(false);
    });

    it('rejects badly formatted capabilities', () => {
      const result = validatePolicy({ capabilities: ['nocolon'] });
      expect(result.valid).toBe(false);
    });
  });

  describe('evaluate', () => {
    it('allows matching capabilities', () => {
      const policy = createDevPolicy();
      const result = evaluate({ type: 'file.read', target: 'src/index.ts' }, policy);
      expect(result.decision).toBe('allow');
    });

    it('denies explicitly denied actions', () => {
      const policy = createDevPolicy();
      const result = evaluate({ type: 'deploy.trigger', target: 'production' }, policy);
      expect(result.decision).toBe('deny');
    });

    it('escalates protected branches for git ops', () => {
      const policy = createDevPolicy();
      const result = evaluate({ type: 'git.push', target: 'main' }, policy);
      expect(result.decision).toBe('escalate');
    });

    it('escalates protected paths', () => {
      const policy = createDevPolicy({ protectedPaths: ['.env', 'secrets/**'] });
      const result = evaluate({ type: 'file.read', target: '.env' }, policy);
      expect(result.decision).toBe('escalate');
    });

    it('denies by default when no capability matches', () => {
      const policy = createDenyAllPolicy();
      const result = evaluate({ type: 'file.read', target: 'src/a.ts' }, policy);
      expect(result.decision).toBe('deny');
    });
  });
});

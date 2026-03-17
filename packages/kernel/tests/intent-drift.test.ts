import { describe, it, expect } from 'vitest';
import { checkIntentAlignment } from '@red-codes/kernel';
import type { IntentSpec } from '@red-codes/kernel';
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

describe('intent drift detection', () => {
  describe('checkIntentAlignment', () => {
    it('reports aligned when no constraints are set', () => {
      const spec: IntentSpec = {};
      const result = checkIntentAlignment(makeIntent(), spec);
      expect(result.aligned).toBe(true);
      expect(result.drifts).toHaveLength(0);
    });

    it('reports aligned when action is in allowed list', () => {
      const spec: IntentSpec = { allowedActions: ['file.read', 'file.write'] };
      const result = checkIntentAlignment(makeIntent({ action: 'file.write' }), spec);
      expect(result.aligned).toBe(true);
      expect(result.drifts).toHaveLength(0);
    });

    it('detects action-not-allowed drift', () => {
      const spec: IntentSpec = { allowedActions: ['file.read', 'test.run'] };
      const result = checkIntentAlignment(makeIntent({ action: 'file.write' }), spec);
      expect(result.aligned).toBe(false);
      expect(result.drifts).toHaveLength(1);
      expect(result.drifts[0].driftType).toBe('action-not-allowed');
      expect(result.drifts[0].reason).toContain('file.write');
    });

    it('reports aligned when target matches allowed paths', () => {
      const spec: IntentSpec = { allowedPaths: ['src/**', 'tests/**'] };
      const result = checkIntentAlignment(makeIntent({ target: 'src/index.ts' }), spec);
      expect(result.aligned).toBe(true);
    });

    it('detects path-outside-scope drift', () => {
      const spec: IntentSpec = { allowedPaths: ['src/**'] };
      const result = checkIntentAlignment(
        makeIntent({ target: 'packages/kernel/src/kernel.ts' }),
        spec
      );
      expect(result.aligned).toBe(false);
      expect(result.drifts).toHaveLength(1);
      expect(result.drifts[0].driftType).toBe('path-outside-scope');
      expect(result.drifts[0].reason).toContain('packages/kernel/src/kernel.ts');
    });

    it('reports aligned when under file modification limit', () => {
      const spec: IntentSpec = { maxFilesModified: 5 };
      const result = checkIntentAlignment(makeIntent(), spec, { filesModified: 3 });
      expect(result.aligned).toBe(true);
    });

    it('detects scope-limit-exceeded drift', () => {
      const spec: IntentSpec = { maxFilesModified: 5 };
      const result = checkIntentAlignment(makeIntent(), spec, { filesModified: 5 });
      expect(result.aligned).toBe(false);
      expect(result.drifts).toHaveLength(1);
      expect(result.drifts[0].driftType).toBe('scope-limit-exceeded');
      expect(result.drifts[0].reason).toContain('5');
    });

    it('detects multiple drifts simultaneously', () => {
      const spec: IntentSpec = {
        allowedActions: ['file.read'],
        allowedPaths: ['src/**'],
        maxFilesModified: 2,
      };
      const result = checkIntentAlignment(
        makeIntent({ action: 'git.push', target: 'packages/foo.ts' }),
        spec,
        { filesModified: 3 }
      );
      expect(result.aligned).toBe(false);
      expect(result.drifts).toHaveLength(3);
      const driftTypes = result.drifts.map((d) => d.driftType);
      expect(driftTypes).toContain('action-not-allowed');
      expect(driftTypes).toContain('path-outside-scope');
      expect(driftTypes).toContain('scope-limit-exceeded');
    });

    it('skips path check when target is empty', () => {
      const spec: IntentSpec = { allowedPaths: ['src/**'] };
      const result = checkIntentAlignment(makeIntent({ target: '' }), spec);
      expect(result.aligned).toBe(true);
    });

    it('matches nested glob patterns', () => {
      const spec: IntentSpec = { allowedPaths: ['packages/*/src/**'] };
      const result = checkIntentAlignment(
        makeIntent({ target: 'packages/kernel/src/intent.ts' }),
        spec
      );
      expect(result.aligned).toBe(true);
    });

    it('handles Windows-style backslash paths', () => {
      const spec: IntentSpec = { allowedPaths: ['src/**'] };
      const result = checkIntentAlignment(
        makeIntent({ target: 'src\\components\\Button.tsx' }),
        spec
      );
      expect(result.aligned).toBe(true);
    });
  });
});

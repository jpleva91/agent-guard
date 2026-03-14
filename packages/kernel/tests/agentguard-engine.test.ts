import { describe, it, expect } from 'vitest';
import { createEngine, INTERVENTION } from '@red-codes/kernel';

describe('agentguard/core/engine', () => {
  describe('INTERVENTION', () => {
    it('defines intervention modes', () => {
      expect(INTERVENTION.DENY).toBe('deny');
      expect(INTERVENTION.ROLLBACK).toBe('rollback');
      expect(INTERVENTION.PAUSE).toBe('pause');
      expect(INTERVENTION.TEST_ONLY).toBe('test-only');
    });
  });

  describe('createEngine', () => {
    it('creates an engine with defaults', () => {
      const engine = createEngine();
      expect(engine.getPolicyCount()).toBe(0);
expect(engine.getInvariantCount()).toBe(16); // DEFAULT_INVARIANTS
      expect(engine.getPolicyErrors()).toEqual([]);
    });

    it('loads policies', () => {
      const engine = createEngine({
        policyDefs: [{
          id: 'test-policy',
          name: 'Test',
          rules: [{ action: 'file.write', effect: 'deny', reason: 'No writes' }],
        }],
      });
      expect(engine.getPolicyCount()).toBe(1);
    });

    it('reports policy errors', () => {
      const engine = createEngine({
        policyDefs: [{ invalid: true }],
      });
      expect(engine.getPolicyErrors().length).toBeGreaterThan(0);
    });

    it('evaluates allowed actions', () => {
      const engine = createEngine();
      const result = engine.evaluate({ tool: 'Read', file: 'src/index.ts' });
      expect(result.allowed).toBe(true);
      expect(result.intervention).toBeNull();
    });

    it('evaluates denied actions', () => {
      const engine = createEngine({
        policyDefs: [{
          id: 'no-shell',
          name: 'No Shell',
          rules: [{ action: 'shell.exec', effect: 'deny', reason: 'No shell' }],
          severity: 4,
        }],
      });
      const result = engine.evaluate({ tool: 'Bash', command: 'echo hello' });
      expect(result.allowed).toBe(false);
      expect(result.intervention).toBeTruthy();
      expect(result.evidencePack).toBeTruthy();
    });

    it('detects invariant violations', () => {
      const engine = createEngine();
      // Force push should trigger no-force-push invariant
      const result = engine.evaluate(
        { tool: 'Bash', command: 'git push --force origin main' },
        {},
      );
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('emits events through onEvent callback', () => {
      const events: unknown[] = [];
      const engine = createEngine({
        policyDefs: [{
          id: 'deny-all',
          name: 'Deny All',
          rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
        }],
        onEvent: (e) => events.push(e),
      });
      engine.evaluate({ tool: 'Write', file: 'src/a.ts' });
      expect(events.length).toBeGreaterThan(0);
    });
  });
});

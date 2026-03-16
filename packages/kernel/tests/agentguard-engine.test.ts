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
      expect(engine.getInvariantCount()).toBe(20); // DEFAULT_INVARIANTS
      expect(engine.getPolicyErrors()).toEqual([]);
    });

    it('loads policies', () => {
      const engine = createEngine({
        policyDefs: [
          {
            id: 'test-policy',
            name: 'Test',
            rules: [{ action: 'file.write', effect: 'deny', reason: 'No writes' }],
          },
        ],
      });
      expect(engine.getPolicyCount()).toBe(1);
    });

    it('reports policy errors', () => {
      const engine = createEngine({
        policyDefs: [{ invalid: true }],
      });
      expect(engine.getPolicyErrors().length).toBeGreaterThan(0);
    });

    it('evaluates actions as denied by default (no policies, default deny)', () => {
      const engine = createEngine();
      const result = engine.evaluate({ tool: 'Read', file: 'src/index.ts' });
      expect(result.allowed).toBe(false);
      expect(result.decision.reason).toContain('default deny');
    });

    it('evaluates allowed actions with explicit allow policy', () => {
      const engine = createEngine({
        policyDefs: [
          {
            id: 'allow-reads',
            name: 'Allow Reads',
            rules: [{ action: 'file.read', effect: 'allow', reason: 'Reads are safe' }],
          },
        ],
      });
      const result = engine.evaluate({ tool: 'Read', file: 'src/index.ts' });
      expect(result.allowed).toBe(true);
      expect(result.intervention).toBeNull();
    });

    it('evaluates allowed actions in fail-open mode', () => {
      const engine = createEngine({ evaluateOptions: { defaultDeny: false } });
      const result = engine.evaluate({ tool: 'Read', file: 'src/index.ts' });
      expect(result.allowed).toBe(true);
      expect(result.intervention).toBeNull();
    });

    it('evaluates denied actions', () => {
      const engine = createEngine({
        policyDefs: [
          {
            id: 'no-shell',
            name: 'No Shell',
            rules: [{ action: 'shell.exec', effect: 'deny', reason: 'No shell' }],
            severity: 4,
          },
        ],
      });
      const result = engine.evaluate({ tool: 'Bash', command: 'echo hello' });
      expect(result.allowed).toBe(false);
      expect(result.intervention).toBeTruthy();
      expect(result.evidencePack).toBeTruthy();
    });

    it('detects invariant violations', () => {
      const engine = createEngine();
      // Force push should trigger no-force-push invariant
      const result = engine.evaluate({ tool: 'Bash', command: 'git push --force origin main' }, {});
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('emits events through onEvent callback', () => {
      const events: unknown[] = [];
      const engine = createEngine({
        policyDefs: [
          {
            id: 'deny-all',
            name: 'Deny All',
            rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
          },
        ],
        onEvent: (e) => events.push(e),
      });
      engine.evaluate({ tool: 'Write', file: 'src/a.ts' });
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('systemContext → intent.metadata bridge', () => {
    it('bridges formatPass from systemContext into policy evaluation', () => {
      const engine = createEngine({
        policyDefs: [
          {
            id: 'format-gate',
            name: 'Format Gate',
            rules: [
              {
                action: 'git.commit',
                effect: 'deny',
                conditions: { requireFormat: true },
                reason: 'Formatting required',
              },
              { action: 'git.commit', effect: 'allow', reason: 'Allow commits' },
            ],
          },
        ],
      });

      // Without formatPass — should be denied
      const denied = engine.evaluate(
        { tool: 'Bash', command: 'git commit -m "test"' },
        {}
      );
      expect(denied.allowed).toBe(false);

      // With formatPass via systemContext — should be allowed
      const allowed = engine.evaluate(
        { tool: 'Bash', command: 'git commit -m "test"' },
        { formatPass: true }
      );
      expect(allowed.allowed).toBe(true);
    });

    it('bridges testsPass from systemContext into policy evaluation', () => {
      const engine = createEngine({
        policyDefs: [
          {
            id: 'test-gate',
            name: 'Test Gate',
            rules: [
              {
                action: 'git.commit',
                effect: 'deny',
                conditions: { requireTests: true },
                reason: 'Tests required',
              },
              { action: 'git.commit', effect: 'allow', reason: 'Allow commits' },
            ],
          },
        ],
      });

      // Without testsPass — should be denied
      const denied = engine.evaluate(
        { tool: 'Bash', command: 'git commit -m "test"' },
        {}
      );
      expect(denied.allowed).toBe(false);

      // With testsPass via systemContext — should be allowed
      const allowed = engine.evaluate(
        { tool: 'Bash', command: 'git commit -m "test"' },
        { testsPass: true }
      );
      expect(allowed.allowed).toBe(true);
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  normalizeIntent,
  authorize,
  detectGitAction,
  isDestructiveCommand,
} from '../../src/kernel/aab.js';
import type { RawAgentAction as _RawAgentAction } from '../../src/kernel/aab.js';

describe('agentguard/core/aab', () => {
  describe('detectGitAction', () => {
    it('detects git push', () => {
      expect(detectGitAction('git push origin main')).toBe('git.push');
    });

    it('detects git force push', () => {
      expect(detectGitAction('git push --force origin main')).toBe('git.force-push');
      expect(detectGitAction('git push -f origin main')).toBe('git.force-push');
    });

    it('detects git branch delete', () => {
      expect(detectGitAction('git branch -d feature')).toBe('git.branch.delete');
      expect(detectGitAction('git branch -D feature')).toBe('git.branch.delete');
    });

    it('detects git merge', () => {
      expect(detectGitAction('git merge feature')).toBe('git.merge');
    });

    it('detects git commit', () => {
      expect(detectGitAction('git commit -m "msg"')).toBe('git.commit');
    });

    it('returns null for non-git commands', () => {
      expect(detectGitAction('npm install')).toBeNull();
      expect(detectGitAction('')).toBeNull();
    });
  });

  describe('isDestructiveCommand', () => {
    it('detects rm -rf', () => {
      expect(isDestructiveCommand('rm -rf /')).toBe(true);
    });

    it('detects DROP DATABASE', () => {
      expect(isDestructiveCommand('DROP DATABASE mydb')).toBe(true);
    });

    it('returns false for safe commands', () => {
      expect(isDestructiveCommand('ls -la')).toBe(false);
      expect(isDestructiveCommand('npm test')).toBe(false);
    });
  });

  describe('normalizeIntent', () => {
    it('normalizes a Write tool action', () => {
      const intent = normalizeIntent({ tool: 'Write', file: 'src/index.ts' });
      expect(intent.action).toBe('file.write');
      expect(intent.target).toBe('src/index.ts');
    });

    it('normalizes a Read tool action', () => {
      const intent = normalizeIntent({ tool: 'Read', file: 'src/index.ts' });
      expect(intent.action).toBe('file.read');
    });

    it('normalizes a Bash git push', () => {
      const intent = normalizeIntent({ tool: 'Bash', command: 'git push origin main' });
      expect(intent.action).toBe('git.push');
      expect(intent.target).toBe('main');
    });

    it('marks destructive shell commands', () => {
      const intent = normalizeIntent({ tool: 'Bash', command: 'rm -rf /' });
      expect(intent.destructive).toBe(true);
    });

    it('handles null input', () => {
      const intent = normalizeIntent(null);
      expect(intent.action).toBe('unknown');
    });
  });

  describe('authorize', () => {
    it('allows actions with no policies (open model)', () => {
      const result = authorize({ tool: 'Read', file: 'src/a.ts' }, []);
      expect(result.result.allowed).toBe(true);
      expect(result.events).toHaveLength(0);
    });

    it('denies destructive commands immediately', () => {
      const result = authorize({ tool: 'Bash', command: 'rm -rf /' }, []);
      expect(result.result.allowed).toBe(false);
      expect(result.events.length).toBeGreaterThan(0);
    });

    it('generates POLICY_DENIED events for policy violations', () => {
      const policies = [{
        id: 'no-write',
        name: 'No Write',
        rules: [{ action: 'file.write', effect: 'deny' as const, reason: 'Read-only' }],
        severity: 3,
      }];
      const result = authorize({ tool: 'Write', file: 'src/a.ts' }, policies);
      expect(result.result.allowed).toBe(false);
      expect(result.events.length).toBeGreaterThan(0);
    });

    it('checks blast radius limits', () => {
      const policies = [{
        id: 'limit-blast',
        name: 'Blast Limit',
        rules: [{ action: '*', effect: 'allow' as const, conditions: { limit: 5 } }],
        severity: 3,
      }];
      const result = authorize(
        { tool: 'Write', file: 'src/a.ts', filesAffected: 10 },
        policies,
      );
      // Should generate blast radius event
      const blastEvent = result.events.find(e => e.kind === 'BlastRadiusExceeded');
      expect(blastEvent).toBeTruthy();
    });
  });
});

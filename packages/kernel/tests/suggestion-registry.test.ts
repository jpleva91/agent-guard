import { describe, it, expect } from 'vitest';
import {
  SuggestionRegistry,
  shellEscape,
  renderTemplate,
  validateCommandScope,
} from '@red-codes/kernel';
import type { NormalizedIntent } from '@red-codes/policy';

function makeIntent(overrides: Partial<NormalizedIntent> = {}): NormalizedIntent {
  return {
    action: 'git.push',
    target: 'main',
    agent: 'test-agent',
    destructive: false,
    ...overrides,
  };
}

describe('SuggestionRegistry', () => {
  describe('resolve — policy-authored suggestion', () => {
    it('returns policy suggestion when present', () => {
      const registry = new SuggestionRegistry();
      const result = registry.resolve({
        policySuggestion: 'Do not push to main directly.',
        intent: makeIntent(),
      });
      expect(result).not.toBeNull();
      expect(result!.message).toBe('Do not push to main directly.');
      expect(result!.correctedCommand).toBeUndefined();
    });

    it('returns policy suggestion with correctedCommand', () => {
      const registry = new SuggestionRegistry();
      const result = registry.resolve({
        policySuggestion: 'Push to a feature branch instead.',
        policyCorrectedCommand: 'git push origin feature',
        intent: makeIntent(),
      });
      expect(result).not.toBeNull();
      expect(result!.message).toBe('Push to a feature branch instead.');
      expect(result!.correctedCommand).toBe('git push origin feature');
    });
  });

  describe('resolve — template rendering', () => {
    it('renders template variables from intent', () => {
      const registry = new SuggestionRegistry();
      const result = registry.resolve({
        policySuggestion: 'Do not push to {{branch}} on {{target}}.',
        intent: makeIntent({ branch: 'main', target: 'origin' }),
      });
      expect(result).not.toBeNull();
      // Values are shell-escaped (wrapped in single quotes)
      expect(result!.message).toBe("Do not push to 'main' on 'origin'.");
    });

    it('renders branch in correctedCommand template', () => {
      const registry = new SuggestionRegistry();
      const result = registry.resolve({
        policySuggestion: 'Use a feature branch.',
        policyCorrectedCommand: 'git push origin {{branch}}',
        intent: makeIntent({ branch: 'feat/new-thing' }),
      });
      expect(result).not.toBeNull();
      expect(result!.correctedCommand).toBe("git push origin 'feat/new-thing'");
    });

    it('leaves unknown variables as-is', () => {
      const registry = new SuggestionRegistry();
      const result = registry.resolve({
        policySuggestion: 'Check {{unknownVar}} for details.',
        intent: makeIntent(),
      });
      expect(result).not.toBeNull();
      expect(result!.message).toBe('Check {{unknownVar}} for details.');
    });
  });

  describe('resolve — built-in generators', () => {
    it('falls back to built-in generator when no policy suggestion', () => {
      const registry = new SuggestionRegistry();
      const result = registry.resolve({
        intent: makeIntent({ branch: 'main' }),
      });
      expect(result).not.toBeNull();
      expect(result!.message).toContain('main');
      expect(result!.message).toContain('denied by policy');
    });

    it('generates suggestion for git.force-push', () => {
      const registry = new SuggestionRegistry();
      const result = registry.resolve({
        intent: makeIntent({ action: 'git.force-push', branch: 'develop' }),
      });
      expect(result).not.toBeNull();
      expect(result!.message).toContain('Force-push');
      expect(result!.correctedCommand).toContain('--force-with-lease');
    });

    it('generates suggestion for git.reset-hard', () => {
      const registry = new SuggestionRegistry();
      const result = registry.resolve({
        intent: makeIntent({ action: 'git.reset-hard' }),
      });
      expect(result).not.toBeNull();
      expect(result!.message).toContain('stash');
      expect(result!.correctedCommand).toBe('git stash');
    });

    it('generates suggestion for file.write with secrets target', () => {
      const registry = new SuggestionRegistry();
      const result = registry.resolve({
        intent: makeIntent({ action: 'file.write', target: '.env.production' }),
      });
      expect(result).not.toBeNull();
      expect(result!.message).toContain('secrets');
    });

    it('returns null for file.write with non-secrets target', () => {
      const registry = new SuggestionRegistry();
      const result = registry.resolve({
        intent: makeIntent({ action: 'file.write', target: 'src/index.ts' }),
      });
      expect(result).toBeNull();
    });

    it('generates suggestion for shell.exec with rm -rf', () => {
      const registry = new SuggestionRegistry();
      const result = registry.resolve({
        intent: makeIntent({
          action: 'shell.exec',
          command: 'rm -rf /tmp/build',
          target: 'rm -rf /tmp/build',
        }),
      });
      expect(result).not.toBeNull();
      expect(result!.message).toContain('Recursive deletion');
    });
  });

  describe('resolve — returns null when no suggestion available', () => {
    it('returns null for unknown action with no policy suggestion', () => {
      const registry = new SuggestionRegistry();
      const result = registry.resolve({
        intent: makeIntent({ action: 'http.request' }),
      });
      expect(result).toBeNull();
    });
  });

  describe('register — custom generators', () => {
    it('allows registering a custom generator', () => {
      const registry = new SuggestionRegistry();
      registry.register('deploy.trigger', () => ({
        message: 'Deployments require approval.',
      }));

      const result = registry.resolve({
        intent: makeIntent({ action: 'deploy.trigger' }),
      });
      expect(result).not.toBeNull();
      expect(result!.message).toBe('Deployments require approval.');
    });

    it('custom generator overrides built-in', () => {
      const registry = new SuggestionRegistry();
      registry.register('git.push', () => ({
        message: 'Custom push message.',
      }));

      const result = registry.resolve({
        intent: makeIntent({ action: 'git.push', branch: 'main' }),
      });
      expect(result).not.toBeNull();
      expect(result!.message).toBe('Custom push message.');
    });
  });

  describe('shellEscape', () => {
    it('wraps value in single quotes', () => {
      expect(shellEscape('hello')).toBe("'hello'");
    });

    it('escapes embedded single quotes', () => {
      expect(shellEscape("it's")).toBe("'it'\\''s'");
    });

    it('prevents command injection via $()', () => {
      const escaped = shellEscape('feat/$(whoami)');
      expect(escaped).toBe("'feat/$(whoami)'");
      // The value is safely quoted — shell won't expand $()
      expect(escaped).not.toContain('`');
    });

    it('prevents backtick injection', () => {
      const escaped = shellEscape('feat/`whoami`');
      expect(escaped).toBe("'feat/`whoami`'");
    });
  });

  describe('renderTemplate', () => {
    it('renders known variables with shell escaping', () => {
      const intent = makeIntent({ branch: 'main', agent: 'claude' });
      expect(renderTemplate('{{branch}} by {{agent}}', intent)).toBe("'main' by 'claude'");
    });

    it('shell-escapes template variables with injection attempts', () => {
      const intent = makeIntent({ branch: 'feat/$(whoami)' });
      const rendered = renderTemplate('git push origin {{branch}}', intent);
      expect(rendered).toBe("git push origin 'feat/$(whoami)'");
    });

    it('leaves unknown variables as-is', () => {
      const intent = makeIntent();
      expect(renderTemplate('{{foo}} bar', intent)).toBe('{{foo}} bar');
    });

    it('renders metadata values', () => {
      const intent = makeIntent({ metadata: { customKey: 'customValue' } });
      expect(renderTemplate('key={{customKey}}', intent)).toBe("key='customValue'");
    });
  });

  describe('validateCommandScope', () => {
    it('allows git push command for git.push action', () => {
      expect(validateCommandScope('git push origin main', 'git.push')).toBe(
        'git push origin main'
      );
    });

    it('strips curl command from git.push action', () => {
      expect(validateCommandScope('curl http://evil.com', 'git.push')).toBeUndefined();
    });

    it('allows any command for unknown action (no restriction)', () => {
      expect(validateCommandScope('anything', 'unknown.action')).toBe('anything');
    });

    it('allows any command for file.write (empty prefix list)', () => {
      expect(validateCommandScope('echo "data" > file.txt', 'file.write')).toBe(
        'echo "data" > file.txt'
      );
    });

    it('returns undefined for empty correctedCommand', () => {
      expect(validateCommandScope('', 'git.push')).toBeUndefined();
      expect(validateCommandScope(undefined, 'git.push')).toBeUndefined();
    });

    it('strips mismatched command from shell.exec action', () => {
      // shell.exec only allows rm, ls, find prefixes
      expect(validateCommandScope('curl http://evil.com', 'shell.exec')).toBeUndefined();
    });

    it('allows rm command for shell.exec action', () => {
      expect(validateCommandScope('rm file.txt', 'shell.exec')).toBe('rm file.txt');
    });
  });
});

// Tests for suggestion resolution in the kernel decision pipeline
import { describe, it, expect, beforeEach } from 'vitest';
import { createKernel } from '@red-codes/kernel';
import { resetActionCounter } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';

beforeEach(() => {
  resetActionCounter();
  resetEventCounter();
});

describe('Suggestion pipeline', () => {
  it('attaches policy-authored suggestion to denied result', async () => {
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [
        {
          id: 'no-force-push',
          name: 'No Force Push',
          rules: [
            {
              action: 'git.push',
              effect: 'deny',
              reason: 'Direct push to main is not allowed',
              suggestion: 'Push to a feature branch and open a pull request instead.',
              correctedCommand: 'git push origin {{branch}}',
            },
          ],
          severity: 5,
        },
      ],
    });

    const result = await kernel.propose({
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'test-agent',
    });

    expect(result.allowed).toBe(false);
    expect(result.suggestion).toBeDefined();
    expect(result.suggestion!.message).toBe(
      'Push to a feature branch and open a pull request instead.'
    );
    // correctedCommand is rendered through the template engine
    expect(result.suggestion!.correctedCommand).toBeDefined();
    expect(result.suggestion!.correctedCommand).toContain('git push origin');
  });

  it('attaches built-in suggestion when no policy suggestion is authored', async () => {
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [
        {
          id: 'no-force-push',
          name: 'No Force Push',
          rules: [
            {
              action: 'git.force-push',
              effect: 'deny',
              reason: 'Force push is not allowed',
            },
          ],
          severity: 5,
        },
      ],
    });

    const result = await kernel.propose({
      tool: 'Bash',
      command: 'git push --force origin main',
      agent: 'test-agent',
    });

    expect(result.allowed).toBe(false);
    expect(result.suggestion).toBeDefined();
    // Built-in generator for git.force-push provides a message about force-with-lease
    expect(result.suggestion!.message).toContain('Force-push');
    expect(result.suggestion!.correctedCommand).toContain('--force-with-lease');
  });

  it('returns undefined suggestion when no suggestion source is available', async () => {
    // Use a deny rule for file.write (non-secrets target) — no policy suggestion
    // and the built-in generator only fires for secrets-related targets.
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [
        {
          id: 'deny-writes',
          name: 'Deny Writes',
          rules: [
            {
              action: 'file.write',
              effect: 'deny',
              reason: 'Writes not allowed',
            },
          ],
          severity: 5,
        },
      ],
    });

    const result = await kernel.propose({
      tool: 'Write',
      file: 'src/app.ts',
      content: 'console.log("hello")',
      agent: 'test-agent',
    });

    expect(result.allowed).toBe(false);
    // No policy suggestion field, and built-in generator for file.write only fires
    // for secrets-related targets (*.env, *.pem, etc.), so no suggestion here
    expect(result.suggestion).toBeUndefined();
  });

  it('renders template variables in policy suggestion correctedCommand', async () => {
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [
        {
          id: 'no-direct-push',
          name: 'No Direct Push',
          rules: [
            {
              action: 'git.push',
              effect: 'deny',
              reason: 'Use feature branches',
              suggestion: 'Create a PR targeting {{target}} instead.',
              correctedCommand: 'git push origin feature-{{agent}}',
            },
          ],
          severity: 5,
        },
      ],
    });

    const result = await kernel.propose({
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'my-agent',
    });

    expect(result.allowed).toBe(false);
    expect(result.suggestion).toBeDefined();
    // Template variable {{agent}} should be rendered (shell-escaped)
    expect(result.suggestion!.message).toContain('PR targeting');
    // correctedCommand should contain the rendered agent name
    expect(result.suggestion!.correctedCommand).toContain('feature-');
  });

  it('does not attach suggestion to allowed results', async () => {
    const kernel = createKernel({
      dryRun: true,
      evaluateOptions: { defaultDeny: false },
    });

    const result = await kernel.propose({
      tool: 'Read',
      file: 'src/index.ts',
      agent: 'test-agent',
    });

    expect(result.allowed).toBe(true);
    expect(result.suggestion).toBeUndefined();
  });
});

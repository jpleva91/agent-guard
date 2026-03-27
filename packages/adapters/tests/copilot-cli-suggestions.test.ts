// Tests for Copilot CLI adapter — corrective enforcement mode (suggestion) support
import { describe, it, expect, vi } from 'vitest';
import { formatCopilotHookResponse } from '@red-codes/adapters';
import type { HookResponseOptions } from '@red-codes/adapters';
import type { KernelResult } from '@red-codes/kernel';
import type { Suggestion } from '@red-codes/core';

// Minimal denied KernelResult stub for mode-aware tests
const deniedResult = {
  allowed: false,
  executed: false,
  decision: {
    decision: { allowed: false, reason: 'Force push not allowed' },
    violations: [{ name: 'no-force-push' }],
  },
  execution: null,
  action: null,
  events: [],
  runId: 'test-run',
} as unknown as KernelResult;

// Minimal allowed KernelResult stub
const allowedResult = {
  allowed: true,
  executed: true,
  decision: { decision: { allowed: true, reason: '' }, violations: [] },
  execution: null,
  action: null,
  events: [],
  runId: 'test-run',
} as unknown as KernelResult;

const suggestion: Suggestion = {
  message: 'Use git push without --force to avoid rewriting history.',
  correctedCommand: 'git push origin feature-branch',
};

describe('formatCopilotHookResponse — backward compatibility', () => {
  it('calling with just result still works (denied)', () => {
    const response = formatCopilotHookResponse(deniedResult);
    const parsed = JSON.parse(response);
    expect(parsed.permissionDecision).toBe('deny');
    expect(parsed.permissionDecisionReason).toContain('Force push not allowed');
  });

  it('calling with just result still works (allowed)', () => {
    const response = formatCopilotHookResponse(allowedResult);
    expect(response).toBe('');
  });

  it('calling with result and null suggestion works (denied)', () => {
    const response = formatCopilotHookResponse(deniedResult, null);
    const parsed = JSON.parse(response);
    expect(parsed.permissionDecision).toBe('deny');
    expect(parsed.permissionDecisionReason).toContain('Force push not allowed');
  });

  it('calling with result, null suggestion, and no options works', () => {
    const response = formatCopilotHookResponse(deniedResult, null, undefined);
    const parsed = JSON.parse(response);
    expect(parsed.permissionDecision).toBe('deny');
  });
});

describe('formatCopilotHookResponse — educate mode', () => {
  const educateOptions: HookResponseOptions = { mode: 'educate' };

  it('returns empty string (allow) and writes suggestion to stderr', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const response = formatCopilotHookResponse(deniedResult, suggestion, educateOptions);
      expect(response).toBe('');
      expect(stderrSpy).toHaveBeenCalledOnce();
      const written = stderrSpy.mock.calls[0]![0] as string;
      expect(written).toContain('[AgentGuard educate]');
      expect(written).toContain(suggestion.message);
      expect(written).toContain('Suggested command: git push origin feature-branch');
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('writes suggestion without correctedCommand when absent', () => {
    const simpleSuggestion: Suggestion = { message: 'Avoid force push.' };
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const response = formatCopilotHookResponse(deniedResult, simpleSuggestion, educateOptions);
      expect(response).toBe('');
      expect(stderrSpy).toHaveBeenCalledOnce();
      const written = stderrSpy.mock.calls[0]![0] as string;
      expect(written).toContain('Avoid force push.');
      expect(written).not.toContain('Suggested command');
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('still allows the action when no suggestion is provided', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const response = formatCopilotHookResponse(deniedResult, null, educateOptions);
      // Educate mode always allows — suggestion is optional context, not a gate
      expect(response).toBe('');
      expect(stderrSpy).not.toHaveBeenCalled();
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('falls back to default allow when result is allowed and no suggestion', () => {
    const response = formatCopilotHookResponse(allowedResult, null, educateOptions);
    expect(response).toBe('');
  });
});

describe('formatCopilotHookResponse — guide mode', () => {
  it('includes suggestion and correctedCommand in denial reason', () => {
    const guideOptions: HookResponseOptions = {
      mode: 'guide',
      retryAttempt: 1,
      maxRetries: 3,
    };
    const response = formatCopilotHookResponse(deniedResult, suggestion, guideOptions);
    const parsed = JSON.parse(response);
    expect(parsed.permissionDecision).toBe('deny');
    const reason = parsed.permissionDecisionReason;
    expect(reason).toContain('Force push not allowed');
    expect(reason).toContain('Suggestion: Use git push without --force');
    expect(reason).toContain('Corrected command: git push origin feature-branch');
    expect(reason).toContain('(attempt 1/3)');
  });

  it('includes attempt counter without suggestion', () => {
    const guideOptions: HookResponseOptions = {
      mode: 'guide',
      retryAttempt: 2,
      maxRetries: 3,
    };
    const response = formatCopilotHookResponse(deniedResult, null, guideOptions);
    const parsed = JSON.parse(response);
    expect(parsed.permissionDecision).toBe('deny');
    const reason = parsed.permissionDecisionReason;
    expect(reason).toContain('(attempt 2/3)');
    expect(reason).not.toContain('Suggestion');
  });

  it('returns hard block when retry attempts exhausted', () => {
    const guideOptions: HookResponseOptions = {
      mode: 'guide',
      retryAttempt: 4,
      maxRetries: 3,
    };
    const response = formatCopilotHookResponse(deniedResult, suggestion, guideOptions);
    const parsed = JSON.parse(response);
    expect(parsed.permissionDecision).toBe('deny');
    expect(parsed.permissionDecisionReason).toBe(
      'Action blocked after 4 correction attempts — ask the human for help'
    );
  });

  it('guide mode on allowed result returns empty string', () => {
    const guideOptions: HookResponseOptions = {
      mode: 'guide',
      retryAttempt: 1,
      maxRetries: 3,
    };
    const response = formatCopilotHookResponse(allowedResult, suggestion, guideOptions);
    expect(response).toBe('');
  });
});

describe('formatCopilotHookResponse — enforce mode', () => {
  it('omits suggestion fields and uses standard deny format', () => {
    const enforceOptions: HookResponseOptions = { mode: 'enforce' };
    const response = formatCopilotHookResponse(deniedResult, suggestion, enforceOptions);
    const parsed = JSON.parse(response);
    expect(parsed.permissionDecision).toBe('deny');
    const reason = parsed.permissionDecisionReason;
    expect(reason).toContain('Force push not allowed');
    expect(reason).toContain('Violations: no-force-push');
    // Enforce mode should NOT include suggestion or corrected command
    expect(reason).not.toContain('Suggestion');
    expect(reason).not.toContain('Corrected command');
  });
});

describe('formatCopilotHookResponse — monitor mode', () => {
  it('returns empty string for allowed actions', () => {
    const monitorOptions: HookResponseOptions = { mode: 'monitor' };
    const response = formatCopilotHookResponse(allowedResult, suggestion, monitorOptions);
    expect(response).toBe('');
  });

  it('uses standard deny format for denied actions', () => {
    const monitorOptions: HookResponseOptions = { mode: 'monitor' };
    const response = formatCopilotHookResponse(deniedResult, suggestion, monitorOptions);
    const parsed = JSON.parse(response);
    expect(parsed.permissionDecision).toBe('deny');
    expect(parsed.permissionDecisionReason).toContain('Force push not allowed');
  });
});

// Tests for the VS Code extension notification formatter
// These test the pure formatting/severity logic with no VS Code dependency.

import { describe, it, expect } from 'vitest';
import {
  isNotificationEvent,
  formatNotificationMessage,
  resolveSeverity,
  DEFAULT_SEVERITY,
  NOTIFICATION_EVENT_KINDS,
} from '../../vscode-extension/src/services/notification-formatter';
import type { GovernanceEvent } from '../../vscode-extension/src/services/event-reader';

/** Helper to create a minimal GovernanceEvent for testing */
function makeEvent(kind: string, metadata: Record<string, unknown> = {}): GovernanceEvent {
  return {
    id: `evt_${Date.now()}`,
    kind,
    timestamp: Date.now(),
    fingerprint: 'test',
    metadata,
  };
}

describe('isNotificationEvent', () => {
  it('returns true for PolicyDenied', () => {
    expect(isNotificationEvent('PolicyDenied')).toBe(true);
  });

  it('returns true for InvariantViolation', () => {
    expect(isNotificationEvent('InvariantViolation')).toBe(true);
  });

  it('returns true for BlastRadiusExceeded', () => {
    expect(isNotificationEvent('BlastRadiusExceeded')).toBe(true);
  });

  it('returns true for ActionEscalated', () => {
    expect(isNotificationEvent('ActionEscalated')).toBe(true);
  });

  it('returns false for ActionAllowed', () => {
    expect(isNotificationEvent('ActionAllowed')).toBe(false);
  });

  it('returns false for RunStarted', () => {
    expect(isNotificationEvent('RunStarted')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isNotificationEvent('')).toBe(false);
  });
});

describe('NOTIFICATION_EVENT_KINDS', () => {
  it('contains exactly 4 event kinds', () => {
    expect(NOTIFICATION_EVENT_KINDS).toHaveLength(4);
  });
});

describe('DEFAULT_SEVERITY', () => {
  it('maps PolicyDenied to warning', () => {
    expect(DEFAULT_SEVERITY.PolicyDenied).toBe('warning');
  });

  it('maps InvariantViolation to error', () => {
    expect(DEFAULT_SEVERITY.InvariantViolation).toBe('error');
  });

  it('maps BlastRadiusExceeded to error', () => {
    expect(DEFAULT_SEVERITY.BlastRadiusExceeded).toBe('error');
  });

  it('maps ActionEscalated to information', () => {
    expect(DEFAULT_SEVERITY.ActionEscalated).toBe('information');
  });
});

describe('resolveSeverity', () => {
  it('returns default severity when no overrides', () => {
    expect(resolveSeverity('PolicyDenied')).toBe('warning');
    expect(resolveSeverity('InvariantViolation')).toBe('error');
  });

  it('returns default severity with empty overrides', () => {
    expect(resolveSeverity('PolicyDenied', {})).toBe('warning');
  });

  it('applies override when present', () => {
    expect(resolveSeverity('PolicyDenied', { PolicyDenied: 'error' })).toBe('error');
  });

  it('applies information override', () => {
    expect(resolveSeverity('InvariantViolation', { InvariantViolation: 'information' })).toBe(
      'information'
    );
  });

  it('ignores invalid override values', () => {
    expect(resolveSeverity('PolicyDenied', { PolicyDenied: 'invalid' })).toBe('warning');
  });

  it('ignores overrides for other kinds', () => {
    expect(resolveSeverity('PolicyDenied', { InvariantViolation: 'information' })).toBe('warning');
  });
});

describe('formatNotificationMessage', () => {
  describe('PolicyDenied', () => {
    it('formats with rule and action from metadata', () => {
      const event = makeEvent('PolicyDenied', {
        rule: 'no-force-push',
        actionType: 'git.push',
      });
      expect(formatNotificationMessage(event)).toBe(
        'AgentGuard: Policy denied git.push — no-force-push'
      );
    });

    it('falls back to reason when rule is absent', () => {
      const event = makeEvent('PolicyDenied', {
        reason: 'branch protection',
        action: 'push',
      });
      expect(formatNotificationMessage(event)).toBe(
        'AgentGuard: Policy denied push — branch protection'
      );
    });

    it('uses defaults when metadata is empty', () => {
      const event = makeEvent('PolicyDenied');
      expect(formatNotificationMessage(event)).toBe(
        'AgentGuard: Policy denied action — unknown rule'
      );
    });
  });

  describe('InvariantViolation', () => {
    it('formats with invariant name and detail', () => {
      const event = makeEvent('InvariantViolation', {
        invariant: 'no-secret-exposure',
        message: 'API key detected in file.ts',
      });
      expect(formatNotificationMessage(event)).toBe(
        'AgentGuard: Invariant violation [no-secret-exposure] — API key detected in file.ts'
      );
    });

    it('formats without detail when message is absent', () => {
      const event = makeEvent('InvariantViolation', {
        name: 'protected-branch',
      });
      expect(formatNotificationMessage(event)).toBe(
        'AgentGuard: Invariant violation [protected-branch]'
      );
    });

    it('uses defaults when metadata is empty', () => {
      const event = makeEvent('InvariantViolation');
      expect(formatNotificationMessage(event)).toBe('AgentGuard: Invariant violation [unknown]');
    });
  });

  describe('BlastRadiusExceeded', () => {
    it('formats with score and threshold', () => {
      const event = makeEvent('BlastRadiusExceeded', {
        score: 85,
        threshold: 50,
      });
      expect(formatNotificationMessage(event)).toBe('AgentGuard: Blast radius exceeded (85/50)');
    });

    it('uses fallback field names', () => {
      const event = makeEvent('BlastRadiusExceeded', {
        blastRadius: 100,
        limit: 75,
      });
      expect(formatNotificationMessage(event)).toBe('AgentGuard: Blast radius exceeded (100/75)');
    });

    it('uses ? when metadata is empty', () => {
      const event = makeEvent('BlastRadiusExceeded');
      expect(formatNotificationMessage(event)).toBe('AgentGuard: Blast radius exceeded (?/?)');
    });
  });

  describe('ActionEscalated', () => {
    it('formats with level and action', () => {
      const event = makeEvent('ActionEscalated', {
        escalationLevel: 2,
        actionType: 'shell.exec',
      });
      expect(formatNotificationMessage(event)).toBe('AgentGuard: shell.exec escalated to level 2');
    });

    it('uses fallback field names', () => {
      const event = makeEvent('ActionEscalated', {
        level: 3,
        action: 'deploy',
      });
      expect(formatNotificationMessage(event)).toBe('AgentGuard: deploy escalated to level 3');
    });

    it('uses defaults when metadata is empty', () => {
      const event = makeEvent('ActionEscalated');
      expect(formatNotificationMessage(event)).toBe('AgentGuard: action escalated to level ?');
    });
  });

  describe('unknown event kind', () => {
    it('produces a generic message', () => {
      const event = makeEvent('SomeNewEvent');
      expect(formatNotificationMessage(event)).toBe('AgentGuard: SomeNewEvent event detected');
    });
  });

  it('handles event with null metadata gracefully', () => {
    const event: GovernanceEvent = {
      id: 'evt_1',
      kind: 'PolicyDenied',
      timestamp: Date.now(),
      fingerprint: 'test',
      metadata: null,
    };
    expect(formatNotificationMessage(event)).toBe(
      'AgentGuard: Policy denied action — unknown rule'
    );
  });
});

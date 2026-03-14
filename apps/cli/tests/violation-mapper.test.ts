// Tests for the VS Code extension violation mapper
// These test the pure location extraction logic with no VS Code dependency.

import { describe, it, expect } from 'vitest';
import {
  isViolationEvent,
  extractViolationLocations,
} from '../../vscode-extension/src/services/violation-mapper';
import type { GovernanceEvent } from '../../vscode-extension/src/services/event-reader';

/** Helper to create a minimal GovernanceEvent for testing */
function makeEvent(
  kind: string,
  fields: Record<string, unknown> = {},
  metadata: Record<string, unknown> = {}
): GovernanceEvent {
  return {
    id: `evt_${Date.now()}_${Math.random()}`,
    kind,
    timestamp: Date.now(),
    fingerprint: 'test',
    metadata,
    ...fields,
  };
}

describe('isViolationEvent', () => {
  it('returns true for InvariantViolation', () => {
    expect(isViolationEvent('InvariantViolation')).toBe(true);
  });

  it('returns true for PolicyDenied', () => {
    expect(isViolationEvent('PolicyDenied')).toBe(true);
  });

  it('returns true for BlastRadiusExceeded', () => {
    expect(isViolationEvent('BlastRadiusExceeded')).toBe(true);
  });

  it('returns true for ActionDenied', () => {
    expect(isViolationEvent('ActionDenied')).toBe(true);
  });

  it('returns false for ActionAllowed', () => {
    expect(isViolationEvent('ActionAllowed')).toBe(false);
  });

  it('returns false for RunStarted', () => {
    expect(isViolationEvent('RunStarted')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isViolationEvent('')).toBe(false);
  });
});

describe('extractViolationLocations', () => {
  describe('InvariantViolation', () => {
    it('extracts location from direct file/line fields', () => {
      const event = makeEvent(
        'InvariantViolation',
        {
          invariant: 'no-secret-exposure',
          expected: 'No sensitive files',
          actual: 'Sensitive file found',
          file: 'src/config.ts',
          line: 42,
        },
        { name: 'No Secret Exposure', severity: 5 }
      );

      const locations = extractViolationLocations(event);
      expect(locations).toHaveLength(1);
      expect(locations[0].filePath).toBe('src/config.ts');
      expect(locations[0].line).toBe(42);
      expect(locations[0].severity).toBe('error');
      expect(locations[0].invariantId).toBe('no-secret-exposure');
      expect(locations[0].message).toContain('No Secret Exposure');
    });

    it('extracts file paths from actual field', () => {
      const event = makeEvent(
        'InvariantViolation',
        {
          invariant: 'no-secret-exposure',
          expected: 'No sensitive files modified',
          actual: 'Sensitive files detected: .env, credentials.json',
        },
        { name: 'No Secret Exposure', severity: 5 }
      );

      const locations = extractViolationLocations(event);
      expect(locations).toHaveLength(2);
      expect(locations[0].filePath).toBe('.env');
      expect(locations[1].filePath).toBe('credentials.json');
    });

    it('avoids duplicate when file field matches embedded path', () => {
      const event = makeEvent(
        'InvariantViolation',
        {
          invariant: 'no-secret-exposure',
          expected: 'No sensitive files',
          actual: 'Sensitive files detected: .env',
          file: '.env',
          line: 1,
        },
        { name: 'No Secret Exposure', severity: 5 }
      );

      const locations = extractViolationLocations(event);
      expect(locations).toHaveLength(1);
      expect(locations[0].filePath).toBe('.env');
    });

    it('maps high severity to error', () => {
      const event = makeEvent(
        'InvariantViolation',
        { invariant: 'test', expected: 'x', actual: 'y', file: 'a.ts' },
        { severity: 5 }
      );
      const locations = extractViolationLocations(event);
      expect(locations[0].severity).toBe('error');
    });

    it('maps medium severity to warning', () => {
      const event = makeEvent(
        'InvariantViolation',
        { invariant: 'test', expected: 'x', actual: 'y', file: 'a.ts' },
        { severity: 3 }
      );
      const locations = extractViolationLocations(event);
      expect(locations[0].severity).toBe('warning');
    });

    it('maps low severity to info', () => {
      const event = makeEvent(
        'InvariantViolation',
        { invariant: 'test', expected: 'x', actual: 'y', file: 'a.ts' },
        { severity: 1 }
      );
      const locations = extractViolationLocations(event);
      expect(locations[0].severity).toBe('info');
    });

    it('returns empty array when no file info present', () => {
      const event = makeEvent(
        'InvariantViolation',
        {
          invariant: 'test-before-push',
          expected: 'Tests passing',
          actual: 'Tests not verified',
        },
        { severity: 3 }
      );
      const locations = extractViolationLocations(event);
      expect(locations).toHaveLength(0);
    });
  });

  describe('PolicyDenied', () => {
    it('extracts location from file/line fields', () => {
      const event = makeEvent('PolicyDenied', {
        policy: 'default',
        action: 'file.write',
        reason: 'path not in scope',
        file: 'src/kernel/kernel.ts',
        line: 10,
      });

      const locations = extractViolationLocations(event);
      expect(locations).toHaveLength(1);
      expect(locations[0].filePath).toBe('src/kernel/kernel.ts');
      expect(locations[0].line).toBe(10);
      expect(locations[0].severity).toBe('warning');
      expect(locations[0].message).toContain('Policy denied');
    });

    it('returns empty when no file field', () => {
      const event = makeEvent('PolicyDenied', {
        policy: 'default',
        action: 'shell.exec',
        reason: 'denied',
      });
      const locations = extractViolationLocations(event);
      expect(locations).toHaveLength(0);
    });
  });

  describe('BlastRadiusExceeded', () => {
    it('extracts locations from files array', () => {
      const event = makeEvent('BlastRadiusExceeded', {
        filesAffected: 25,
        limit: 20,
        files: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      });

      const locations = extractViolationLocations(event);
      expect(locations).toHaveLength(3);
      expect(locations[0].filePath).toBe('src/a.ts');
      expect(locations[0].severity).toBe('error');
      expect(locations[0].message).toContain('25/20');
    });

    it('returns empty when no files array', () => {
      const event = makeEvent('BlastRadiusExceeded', {
        filesAffected: 25,
        limit: 20,
      });
      const locations = extractViolationLocations(event);
      expect(locations).toHaveLength(0);
    });
  });

  describe('ActionDenied', () => {
    it('extracts location when target looks like a file path', () => {
      const event = makeEvent('ActionDenied', {
        actionType: 'file.write',
        target: 'src/kernel/kernel.ts',
        reason: 'protected path',
      });

      const locations = extractViolationLocations(event);
      expect(locations).toHaveLength(1);
      expect(locations[0].filePath).toBe('src/kernel/kernel.ts');
      expect(locations[0].severity).toBe('warning');
    });

    it('skips target that does not look like a file path', () => {
      const event = makeEvent('ActionDenied', {
        actionType: 'shell.exec',
        target: 'rm -rf /',
        reason: 'destructive command',
      });

      const locations = extractViolationLocations(event);
      expect(locations).toHaveLength(0);
    });
  });

  describe('unknown event', () => {
    it('returns empty array for unknown kind', () => {
      const event = makeEvent('SomeOtherEvent');
      const locations = extractViolationLocations(event);
      expect(locations).toHaveLength(0);
    });
  });
});

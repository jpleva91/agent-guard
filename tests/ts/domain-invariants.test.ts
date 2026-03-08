import { describe, it, expect } from 'vitest';
import {
  INVARIANT_TYPES,
  validateInvariant,
  loadInvariants,
  evaluateInvariant,
  violationFingerprint,
} from '../../src/domain/invariants.js';
import { INVARIANT_VIOLATION } from '../../src/domain/events.js';

describe('domain/invariants', () => {
  describe('INVARIANT_TYPES', () => {
    it('defines type constants', () => {
      expect(INVARIANT_TYPES.test_result).toBe('test_result');
      expect(INVARIANT_TYPES.action).toBe('action');
      expect(INVARIANT_TYPES.dependency).toBe('dependency');
    });
  });

  describe('validateInvariant', () => {
    it('validates a well-formed invariant', () => {
      const result = validateInvariant({
        id: 'inv_1',
        name: 'Tests must pass',
        type: 'test_result',
        condition: { field: 'result', operator: '===', value: 'pass' },
      });
      expect(result.valid).toBe(true);
    });

    it('rejects missing id', () => {
      const result = validateInvariant({
        name: 'Tests',
        type: 'test_result',
        condition: { field: 'result', operator: '===', value: 'pass' },
      } as Record<string, unknown>);
      expect(result.valid).toBe(false);
    });

    it('rejects missing name', () => {
      const result = validateInvariant({
        id: 'inv_1',
        type: 'test_result',
        condition: {},
      } as Record<string, unknown>);
      expect(result.valid).toBe(false);
    });

    it('rejects unknown type', () => {
      const result = validateInvariant({
        id: 'inv_1',
        name: 'Test',
        type: 'unknown_type',
        condition: {},
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('loadInvariants', () => {
    it('loads valid invariants', () => {
      const result = loadInvariants({
        invariants: [
          { id: 'inv_1', name: 'Tests pass', type: 'test_result', condition: { field: 'result', operator: '===', value: 'pass' } },
          { id: 'inv_2', name: 'Safe actions', type: 'action', condition: { field: 'action', operator: '!==', value: 'shell.exec' } },
        ],
      });
      expect(result.invariants).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });

    it('filters out invalid invariants', () => {
      const result = loadInvariants({
        invariants: [
          { id: 'inv_1', name: 'Tests pass', type: 'test_result', condition: { field: 'result', operator: '===', value: 'pass' } },
          { type: 'broken' },
        ],
      });
      expect(result.invariants).toHaveLength(1);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('returns error for missing config', () => {
      const result = loadInvariants({});
      expect(result.invariants).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('evaluateInvariant', () => {
    it('returns null when invariant holds', () => {
      const inv = {
        id: 'inv_1',
        name: 'All tests pass',
        type: 'test_result' as const,
        description: 'Tests must pass',
        condition: { field: 'result', operator: '===', value: 'pass' },
      };
      const event = evaluateInvariant(inv, { result: 'pass' });
      expect(event).toBeNull();
    });

    it('returns event when invariant is violated', () => {
      const inv = {
        id: 'inv_1',
        name: 'All tests pass',
        type: 'test_result' as const,
        description: 'Tests must pass',
        condition: { field: 'result', operator: '===', value: 'pass' },
      };
      const event = evaluateInvariant(inv, { result: 'fail', failed: 3 });
      expect(event).not.toBeNull();
      expect(event!.kind).toBe(INVARIANT_VIOLATION);
    });

    it('detects action violations', () => {
      const inv = {
        id: 'inv_2',
        name: 'No shell exec',
        type: 'action' as const,
        description: 'Must not execute shell commands',
        condition: { field: 'action', operator: '!==', value: 'shell.exec' },
      };
      const event = evaluateInvariant(inv, { action: 'shell.exec' });
      expect(event).not.toBeNull();
    });
  });

  describe('violationFingerprint', () => {
    it('produces a stable fingerprint', () => {
      const fp1 = violationFingerprint('test_result', 'Tests failed');
      const fp2 = violationFingerprint('test_result', 'Tests failed');
      expect(fp1).toBe(fp2);
    });

    it('differs for different inputs', () => {
      const fp1 = violationFingerprint('test_result', 'Tests failed');
      const fp2 = violationFingerprint('action', 'Unauthorized');
      expect(fp1).not.toBe(fp2);
    });
  });
});

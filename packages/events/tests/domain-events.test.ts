import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEvent,
  validateEvent,
  resetEventCounter,
  ALL_EVENT_KINDS,
  ERROR_OBSERVED,
  MOVE_USED,
  BATTLE_ENDED,
  INVARIANT_VIOLATION,
  PIPELINE_STARTED,
} from '@red-codes/events';

describe('domain/events', () => {
  beforeEach(() => {
    resetEventCounter();
  });

  describe('createEvent', () => {
    it('creates a valid ErrorObserved event', () => {
      const event = createEvent(ERROR_OBSERVED, { message: 'TypeError: x is not defined' });
      expect(event.kind).toBe('ErrorObserved');
      expect(event.id).toMatch(/^evt_\d+_1$/);
      expect(event.timestamp).toBeTypeOf('number');
      expect(event.fingerprint).toBeTypeOf('string');
    });

    it('assigns unique IDs via monotonic counter', () => {
      const e1 = createEvent(ERROR_OBSERVED, { message: 'err1' });
      const e2 = createEvent(ERROR_OBSERVED, { message: 'err2' });
      expect(e1.id).not.toBe(e2.id);
    });

    it('throws on unknown event kind', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => createEvent('UnknownKind' as any, {})).toThrow('Unknown event kind');
    });

    it('throws when required fields are missing', () => {
      expect(() => createEvent(ERROR_OBSERVED, {})).toThrow('missing required field: message');
    });

    it('generates deterministic fingerprints for same kind+data', () => {
      const e1 = createEvent(MOVE_USED, { move: 'segfault', attacker: 'NullPointer' });
      resetEventCounter();
      const e2 = createEvent(MOVE_USED, { move: 'segfault', attacker: 'NullPointer' });
      expect(e1.fingerprint).toBe(e2.fingerprint);
    });

    it('creates battle events', () => {
      const event = createEvent(BATTLE_ENDED, { result: 'win' });
      expect(event.kind).toBe('BATTLE_ENDED');
    });

    it('creates governance events', () => {
      const event = createEvent(INVARIANT_VIOLATION, {
        invariant: 'no-secret-exposure',
        expected: 'No sensitive files',
        actual: 'Found .env',
      });
      expect(event.kind).toBe('InvariantViolation');
    });

    it('creates pipeline events', () => {
      const event = createEvent(PIPELINE_STARTED, {
        runId: 'run_1',
        task: 'build feature',
      });
      expect(event.kind).toBe('PipelineStarted');
    });
  });

  describe('validateEvent', () => {
    it('validates a well-formed event', () => {
      const result = validateEvent({
        kind: ERROR_OBSERVED,
        message: 'test error',
        timestamp: Date.now(),
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects null', () => {
      const result = validateEvent(null as unknown as Record<string, unknown>);
      expect(result.valid).toBe(false);
    });

    it('rejects missing kind', () => {
      const result = validateEvent({ message: 'test' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('kind');
    });

    it('rejects unknown kind', () => {
      const result = validateEvent({ kind: 'FakeEvent' });
      expect(result.valid).toBe(false);
    });

    it('reports missing required fields', () => {
      const result = validateEvent({ kind: MOVE_USED });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('ALL_EVENT_KINDS', () => {
    it('contains all known event kinds', () => {
      expect(ALL_EVENT_KINDS.size).toBeGreaterThan(30);
      expect(ALL_EVENT_KINDS.has('ErrorObserved')).toBe(true);
      expect(ALL_EVENT_KINDS.has('BATTLE_ENDED')).toBe(true);
      expect(ALL_EVENT_KINDS.has('InvariantViolation')).toBe(true);
    });
  });
});

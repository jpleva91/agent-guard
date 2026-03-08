import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDevEvent,
  validateDevEvent,
  resetDevEventCounter,
  devEventKindToDomainKind,
} from '../../src/domain/dev-event.js';
import type { DevEventInput } from '../../src/domain/dev-event.js';

describe('domain/dev-event', () => {
  beforeEach(() => {
    resetDevEventCounter();
  });

  describe('createDevEvent', () => {
    it('creates a valid error event with required fields', () => {
      const event = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'error.detected',
        payload: { message: 'TypeError: x is not defined' },
      });

      expect(event.id).toMatch(/^dev_\d+_1$/);
      expect(event.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(event.source).toBe('cli');
      expect(event.actor).toBe('system');
      expect(event.kind).toBe('error.detected');
      expect(event.fingerprint).toBeTypeOf('string');
      expect(event.payload.message).toBe('TypeError: x is not defined');
    });

    it('assigns monotonic IDs', () => {
      const e1 = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'error.detected',
        payload: {},
      });
      const e2 = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'error.detected',
        payload: {},
      });

      expect(e1.id).toMatch(/_1$/);
      expect(e2.id).toMatch(/_2$/);
    });

    it('includes optional fields when provided', () => {
      const event = createDevEvent({
        source: 'git',
        actor: 'human',
        kind: 'git.commit',
        repo: 'org/repo',
        branch: 'main',
        commit: 'abc123',
        severity: 'low',
        file: 'src/index.ts',
        payload: { message: 'fix bug' },
      });

      expect(event.repo).toBe('org/repo');
      expect(event.branch).toBe('main');
      expect(event.commit).toBe('abc123');
      expect(event.severity).toBe('low');
      expect(event.file).toBe('src/index.ts');
    });

    it('omits optional fields when not provided', () => {
      const event = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'build.succeeded',
        payload: {},
      });

      expect(event.repo).toBeUndefined();
      expect(event.branch).toBeUndefined();
      expect(event.commit).toBeUndefined();
      expect(event.agentRunId).toBeUndefined();
    });

    it('defaults payload to empty object', () => {
      const event = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'session.started',
      });

      expect(event.payload).toEqual({});
    });

    it('computes deterministic fingerprint for same content', () => {
      resetDevEventCounter();
      const e1 = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'error.detected',
        payload: { message: 'same error' },
      });
      resetDevEventCounter();
      const e2 = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'error.detected',
        payload: { message: 'same error' },
      });

      expect(e1.fingerprint).toBe(e2.fingerprint);
    });

    it('produces different fingerprints for different content', () => {
      const e1 = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'error.detected',
        payload: { message: 'error A' },
      });
      const e2 = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'error.detected',
        payload: { message: 'error B' },
      });

      expect(e1.fingerprint).not.toBe(e2.fingerprint);
    });

    it('supports all event sources', () => {
      const sources = [
        'cli',
        'git',
        'ci',
        'ide',
        'agent',
        'browser',
        'test',
        'build',
        'lint',
        'runtime',
      ] as const;
      for (const source of sources) {
        const event = createDevEvent({
          source,
          actor: 'system',
          kind: 'session.started',
          payload: {},
        });
        expect(event.source).toBe(source);
      }
    });

    it('supports agent-originated events', () => {
      const event = createDevEvent({
        source: 'agent',
        actor: 'agent',
        kind: 'agent.file.modified',
        agentRunId: 'run_123',
        file: 'src/auth.ts',
        severity: 'high',
        payload: { action: 'file.write' },
      });

      expect(event.actor).toBe('agent');
      expect(event.agentRunId).toBe('run_123');
      expect(event.severity).toBe('high');
    });
  });

  describe('validateDevEvent', () => {
    it('validates a correct event', () => {
      const event = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'error.detected',
        payload: { message: 'test' },
      });
      const result = validateDevEvent(event);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects null', () => {
      const result = validateDevEvent(null);
      expect(result.valid).toBe(false);
    });

    it('rejects missing required fields', () => {
      const result = validateDevEvent({ id: 'test' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects invalid source', () => {
      const event = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'error.detected',
        payload: {},
      });
      const modified = { ...event, source: 'invalid' };
      const result = validateDevEvent(modified);
      expect(result.valid).toBe(false);
    });

    it('rejects invalid severity', () => {
      const event = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'error.detected',
        severity: 'low',
        payload: {},
      });
      const modified = { ...event, severity: 'invalid' };
      const result = validateDevEvent(modified);
      expect(result.valid).toBe(false);
    });
  });

  describe('devEventKindToDomainKind', () => {
    it('maps error.detected to ErrorObserved', () => {
      expect(devEventKindToDomainKind('error.detected')).toBe('ErrorObserved');
    });

    it('maps test.failed to TestCompleted', () => {
      expect(devEventKindToDomainKind('test.failed')).toBe('TestCompleted');
    });

    it('maps governance.policy.violated to PolicyDenied', () => {
      expect(devEventKindToDomainKind('governance.policy.violated')).toBe('PolicyDenied');
    });

    it('returns undefined for unmapped kinds', () => {
      expect(devEventKindToDomainKind('incident.opened')).toBeUndefined();
    });
  });
});

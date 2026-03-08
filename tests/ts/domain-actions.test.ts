import { describe, it, expect, beforeEach } from 'vitest';
import {
  ACTION_CLASS,
  ACTION_TYPES,
  DECISION,
  createAction,
  validateAction,
  validateActionType,
  resetActionCounter,
} from '../../src/domain/actions.js';

describe('domain/actions', () => {
  beforeEach(() => {
    resetActionCounter();
  });

  it('defines action classes', () => {
    expect(ACTION_CLASS.FILE).toBe('file');
    expect(ACTION_CLASS.TEST).toBe('test');
    expect(ACTION_CLASS.GIT).toBe('git');
    expect(ACTION_CLASS.SHELL).toBe('shell');
  });

  it('defines action types with class mappings', () => {
    expect(ACTION_TYPES['file.read']).toEqual({ class: 'file', description: expect.any(String) });
    expect(ACTION_TYPES['test.run']).toEqual({ class: 'test', description: expect.any(String) });
    expect(ACTION_TYPES['git.commit']).toEqual({ class: 'git', description: expect.any(String) });
  });

  it('defines decision constants', () => {
    expect(DECISION.ALLOW).toBe('allow');
    expect(DECISION.DENY).toBe('deny');
    expect(DECISION.ESCALATE).toBe('escalate');
  });

  it('creates a valid action', () => {
    const action = createAction('file.write', 'src/index.ts', 'Update imports');
    expect(action.id).toMatch(/^act_/);
    expect(action.type).toBe('file.write');
    expect(action.target).toBe('src/index.ts');
    expect(action.justification).toBe('Update imports');
    expect(action.class).toBe('file');
    expect(action.timestamp).toBeGreaterThan(0);
    expect(action.fingerprint).toBeTruthy();
  });

  it('assigns sequential IDs with timestamp prefix', () => {
    const a1 = createAction('file.read', 'src/a.ts', 'Read A');
    const a2 = createAction('file.read', 'src/b.ts', 'Read B');
    // IDs end with _1, _2 etc
    expect(a1.id).toMatch(/_1$/);
    expect(a2.id).toMatch(/_2$/);
  });

  it('throws on unknown action type', () => {
    expect(() => createAction('unknown.action', 'target', 'reason')).toThrow();
  });

  it('validates a well-formed action', () => {
    const action = createAction('file.read', 'src/index.ts', 'Check file');
    const result = validateAction(action as unknown as Record<string, unknown>);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects invalid actions', () => {
    const result = validateAction({ type: 'file.read' } as Record<string, unknown>);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validates known action types', () => {
    expect(validateActionType('file.read').valid).toBe(true);
    expect(validateActionType('bogus.type').valid).toBe(false);
  });
});

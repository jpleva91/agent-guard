// Tests for policy loader — validation and loading
import { describe, it, expect } from 'vitest';
import { validatePolicy, loadPolicies, VALID_ACTIONS } from '@red-codes/policy';

// ---------------------------------------------------------------------------
// validatePolicy
// ---------------------------------------------------------------------------

describe('validatePolicy', () => {
  it('accepts a valid policy', () => {
    const result = validatePolicy({
      id: 'test-policy',
      name: 'Test Policy',
      rules: [{ action: 'file.write', effect: 'deny', reason: 'No writes' }],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects null policy', () => {
    const result = validatePolicy(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('non-null object');
  });

  it('rejects policy missing id', () => {
    const result = validatePolicy({
      name: 'No ID',
      rules: [{ action: '*', effect: 'allow' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('id')]));
  });

  it('rejects policy missing name', () => {
    const result = validatePolicy({
      id: 'no-name',
      rules: [{ action: '*', effect: 'allow' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('name')]));
  });

  it('rejects policy with no rules', () => {
    const result = validatePolicy({
      id: 'no-rules',
      name: 'No Rules',
      rules: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('at least one rule')])
    );
  });

  it('rejects policy with missing rules array', () => {
    const result = validatePolicy({
      id: 'bad',
      name: 'Bad',
    });
    expect(result.valid).toBe(false);
  });

  it('reports rule validation errors with index', () => {
    const result = validatePolicy({
      id: 'bad-rules',
      name: 'Bad Rules',
      rules: [{ action: 'file.write', effect: 'invalid-effect' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Rule[0]');
    expect(result.errors[0]).toContain('Invalid effect');
  });

  it('validates rule missing action', () => {
    const result = validatePolicy({
      id: 'no-action',
      name: 'No Action',
      rules: [{ effect: 'deny' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('action')]));
  });

  it('validates rule missing effect', () => {
    const result = validatePolicy({
      id: 'no-effect',
      name: 'No Effect',
      rules: [{ action: 'file.write' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('effect')]));
  });

  it('validates non-string action type', () => {
    const result = validatePolicy({
      id: 'bad-action',
      name: 'Bad Action',
      rules: [{ action: 123, effect: 'deny' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Invalid action type')])
    );
  });

  it('accepts array of actions in a rule', () => {
    const result = validatePolicy({
      id: 'multi-action',
      name: 'Multi',
      rules: [{ action: ['file.write', 'file.delete'], effect: 'deny' }],
    });
    expect(result.valid).toBe(true);
  });

  it('validates severity range (1-5)', () => {
    const valid = validatePolicy({
      id: 's',
      name: 's',
      rules: [{ action: '*', effect: 'allow' }],
      severity: 3,
    });
    expect(valid.valid).toBe(true);

    const tooLow = validatePolicy({
      id: 's',
      name: 's',
      rules: [{ action: '*', effect: 'allow' }],
      severity: 0,
    });
    expect(tooLow.valid).toBe(false);

    const tooHigh = validatePolicy({
      id: 's',
      name: 's',
      rules: [{ action: '*', effect: 'allow' }],
      severity: 6,
    });
    expect(tooHigh.valid).toBe(false);
  });

  it('validates condition types', () => {
    const result = validatePolicy({
      id: 'cond',
      name: 'Cond',
      rules: [{ action: '*', effect: 'deny', conditions: { limit: 'not-a-number' } }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('limit')]));
  });

  it('rejects non-object conditions', () => {
    const result = validatePolicy({
      id: 'cond',
      name: 'Cond',
      rules: [{ action: '*', effect: 'deny', conditions: 'string' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Conditions must be an object')])
    );
  });

  it('rejects non-object rule', () => {
    const result = validatePolicy({
      id: 'bad',
      name: 'Bad',
      rules: ['not-an-object'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('non-null object')])
    );
  });
});

// ---------------------------------------------------------------------------
// loadPolicies
// ---------------------------------------------------------------------------

describe('loadPolicies', () => {
  it('loads valid policies', () => {
    const { policies, errors } = loadPolicies([
      {
        id: 'p1',
        name: 'Policy 1',
        rules: [{ action: '*', effect: 'allow' }],
      },
    ]);
    expect(policies).toHaveLength(1);
    expect(policies[0].id).toBe('p1');
    expect(errors).toHaveLength(0);
  });

  it('sets default severity to 3', () => {
    const { policies } = loadPolicies([
      {
        id: 'p1',
        name: 'Policy 1',
        rules: [{ action: '*', effect: 'allow' }],
      },
    ]);
    expect(policies[0].severity).toBe(3);
  });

  it('preserves explicit severity', () => {
    const { policies } = loadPolicies([
      {
        id: 'p1',
        name: 'Policy 1',
        rules: [{ action: '*', effect: 'allow' }],
        severity: 5,
      },
    ]);
    expect(policies[0].severity).toBe(5);
  });

  it('detects duplicate policy IDs', () => {
    const { policies, errors } = loadPolicies([
      { id: 'dup', name: 'First', rules: [{ action: '*', effect: 'allow' }] },
      { id: 'dup', name: 'Second', rules: [{ action: '*', effect: 'deny' }] },
    ]);
    expect(policies).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Duplicate policy ID');
  });

  it('skips invalid policies and collects errors', () => {
    const { policies, errors } = loadPolicies([
      { id: 'valid', name: 'Valid', rules: [{ action: '*', effect: 'allow' }] },
      { id: 'invalid' }, // missing name and rules
    ]);
    expect(policies).toHaveLength(1);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns error for non-array input', () => {
    const { policies, errors } = loadPolicies('not-an-array' as unknown as unknown[]);
    expect(policies).toHaveLength(0);
    expect(errors[0]).toContain('must be an array');
  });
});

// ---------------------------------------------------------------------------
// VALID_ACTIONS
// ---------------------------------------------------------------------------

describe('VALID_ACTIONS', () => {
  it('includes core action types', () => {
    expect(VALID_ACTIONS.has('file.write')).toBe(true);
    expect(VALID_ACTIONS.has('git.push')).toBe(true);
    expect(VALID_ACTIONS.has('shell.exec')).toBe(true);
    expect(VALID_ACTIONS.has('*')).toBe(true);
  });

  it('does not include arbitrary strings', () => {
    expect(VALID_ACTIONS.has('random.action')).toBe(false);
  });
});

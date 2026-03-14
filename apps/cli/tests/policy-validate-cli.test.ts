// Tests for the policy validate CLI command
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { validatePolicyFile, validatePolicyFileStrict } from '../src/commands/policy.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_DIR = join(import.meta.dirname ?? '.', '.test-policy-validate');

const VALID_YAML = `
id: test-policy
name: Test Policy
description: A test policy for validation
severity: 3

rules:
  - action: git.push
    effect: deny
    branches: [main]
    reason: No direct push to main

  - action: file.read
    effect: allow
    reason: Reads are safe
`;

const VALID_JSON = JSON.stringify(
  {
    id: 'json-policy',
    name: 'JSON Policy',
    rules: [
      { action: 'file.write', effect: 'deny', reason: 'No writes' },
      { action: 'file.read', effect: 'allow', reason: 'Reads allowed' },
    ],
  },
  null,
  2
);

const INVALID_YAML_MISSING_ID = `
name: Missing ID
rules:
  - action: file.write
    effect: deny
`;

const INVALID_YAML_NO_RULES = `
id: no-rules
name: No Rules Policy
`;

const INVALID_YAML_BAD_EFFECT = `
id: bad-effect
name: Bad Effect
rules:
  - action: file.write
    effect: block
`;

const ONLY_ALLOW_RULES_YAML = `
id: allow-only
name: Allow Only
rules:
  - action: file.read
    effect: allow
  - action: file.write
    effect: allow
`;

const UNRECOGNIZED_ACTION_YAML = `
id: unknown-action
name: Unknown Action
description: Policy with an unrecognized action
rules:
  - action: file.write
    effect: deny
  - action: database.drop
    effect: deny
`;

const OVERLAPPING_RULES_YAML = `
id: overlapping
name: Overlapping
description: Policy with overlapping rules
rules:
  - action: file.write
    effect: deny
    target: ".env"
    reason: No env writes
  - action: file.write
    effect: deny
    reason: No writes at all
`;

const CANONICAL_ACTION_YAML = `
id: canonical
name: Canonical Actions
description: Policy using canonical action types from core/actions.ts
rules:
  - action: file.read
    effect: allow
    reason: File reads are safe
  - action: git.diff
    effect: allow
    reason: Diffs are safe
`;

const CONFLICTING_RULES_YAML = `
id: conflicting
name: Conflicting Rules
description: Policy with conflicting allow and deny for same action
rules:
  - action: shell.exec
    effect: deny
    reason: No shell commands
  - action: shell.exec
    effect: allow
    reason: Actually allow shell
`;

const NON_CANONICAL_ACTION_YAML = `
id: non-canonical
name: Non Canonical
description: Policy with an action not in canonical registry
rules:
  - action: file.write
    effect: deny
  - action: custom.action
    effect: deny
`;

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(join(TEST_DIR, 'valid.yaml'), VALID_YAML);
  writeFileSync(join(TEST_DIR, 'valid.json'), VALID_JSON);
  writeFileSync(join(TEST_DIR, 'missing-id.yaml'), INVALID_YAML_MISSING_ID);
  writeFileSync(join(TEST_DIR, 'no-rules.yaml'), INVALID_YAML_NO_RULES);
  writeFileSync(join(TEST_DIR, 'bad-effect.yaml'), INVALID_YAML_BAD_EFFECT);
  writeFileSync(join(TEST_DIR, 'allow-only.yaml'), ONLY_ALLOW_RULES_YAML);
  writeFileSync(join(TEST_DIR, 'unknown-action.yaml'), UNRECOGNIZED_ACTION_YAML);
  writeFileSync(join(TEST_DIR, 'overlapping.yaml'), OVERLAPPING_RULES_YAML);
  writeFileSync(join(TEST_DIR, 'canonical.yaml'), CANONICAL_ACTION_YAML);
  writeFileSync(join(TEST_DIR, 'conflicting.yaml'), CONFLICTING_RULES_YAML);
  writeFileSync(join(TEST_DIR, 'non-canonical.yaml'), NON_CANONICAL_ACTION_YAML);
  writeFileSync(join(TEST_DIR, 'empty.yaml'), '');
  writeFileSync(join(TEST_DIR, 'bad-json.json'), '{ invalid json');
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// validatePolicyFile — basic structural validation
// ---------------------------------------------------------------------------

describe('validatePolicyFile', () => {
  it('validates a correct YAML policy', () => {
    const result = validatePolicyFile(join(TEST_DIR, 'valid.yaml'));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.ruleCount).toBe(2);
    expect(result.file).toContain('valid.yaml');
  });

  it('validates a correct JSON policy', () => {
    const result = validatePolicyFile(join(TEST_DIR, 'valid.json'));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.ruleCount).toBe(2);
  });

  it('reports error for non-existent file', () => {
    const result = validatePolicyFile(join(TEST_DIR, 'does-not-exist.yaml'));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('not found');
  });

  it('reports error for empty file', () => {
    const result = validatePolicyFile(join(TEST_DIR, 'empty.yaml'));
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('empty');
  });

  it('reports error for malformed JSON', () => {
    const result = validatePolicyFile(join(TEST_DIR, 'bad-json.json'));
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('JSON parse error');
  });

  it('reports error for YAML missing id', () => {
    const result = validatePolicyFile(join(TEST_DIR, 'missing-id.yaml'));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('id'))).toBe(true);
  });

  it('reports error for YAML with no rules', () => {
    const result = validatePolicyFile(join(TEST_DIR, 'no-rules.yaml'));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('rule'))).toBe(true);
  });

  it('reports error for invalid effect', () => {
    const result = validatePolicyFile(join(TEST_DIR, 'bad-effect.yaml'));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('effect'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validatePolicyFileStrict — strict mode checks
// ---------------------------------------------------------------------------

describe('validatePolicyFileStrict', () => {
  it('returns same result as basic when strict=false', () => {
    const basic = validatePolicyFile(join(TEST_DIR, 'valid.yaml'));
    const strict = validatePolicyFileStrict(join(TEST_DIR, 'valid.yaml'), false);
    expect(strict.valid).toBe(basic.valid);
    expect(strict.errors).toEqual(basic.errors);
  });

  it('warns about missing deny rules in strict mode', () => {
    const result = validatePolicyFileStrict(join(TEST_DIR, 'allow-only.yaml'), true);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.message.includes('no deny rules'))).toBe(true);
  });

  it('warns about unrecognized actions in strict mode', () => {
    const result = validatePolicyFileStrict(join(TEST_DIR, 'unknown-action.yaml'), true);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.message.includes('database.drop'))).toBe(true);
  });

  it('reports info about overlapping rules in strict mode', () => {
    const result = validatePolicyFileStrict(join(TEST_DIR, 'overlapping.yaml'), true);
    expect(result.valid).toBe(true);
    expect(result.info.some((i) => i.message.includes('Multiple deny rules'))).toBe(true);
  });

  it('does not run strict checks on invalid files', () => {
    const result = validatePolicyFileStrict(join(TEST_DIR, 'missing-id.yaml'), true);
    expect(result.valid).toBe(false);
    // Strict checks should not run if basic validation failed
    expect(result.warnings).toHaveLength(0);
    expect(result.info).toHaveLength(0);
  });

  it('suggests adding description in strict mode', () => {
    const result = validatePolicyFileStrict(join(TEST_DIR, 'allow-only.yaml'), true);
    expect(result.info.some((i) => i.message.includes('description'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Result structure
// ---------------------------------------------------------------------------

describe('PolicyValidationResult structure', () => {
  it('includes all required fields', () => {
    const result = validatePolicyFile(join(TEST_DIR, 'valid.yaml'));
    expect(result).toHaveProperty('file');
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('warnings');
    expect(result).toHaveProperty('info');
    expect(result).toHaveProperty('ruleCount');
  });

  it('error issues have correct level', () => {
    const result = validatePolicyFile(join(TEST_DIR, 'missing-id.yaml'));
    for (const err of result.errors) {
      expect(err.level).toBe('error');
    }
  });

  it('JSON output is well-formed', () => {
    const result = validatePolicyFile(join(TEST_DIR, 'valid.yaml'));
    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);
    expect(parsed.valid).toBe(true);
    expect(parsed.ruleCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Canonical action type reference validation
// ---------------------------------------------------------------------------

describe('canonical action type validation', () => {
  it('accepts canonical action types from core/actions.ts', () => {
    const result = validatePolicyFileStrict(join(TEST_DIR, 'canonical.yaml'), true);
    expect(result.valid).toBe(true);
    // file.read and git.diff are in ACTION_TYPES — no warnings about unrecognized actions
    expect(result.warnings.some((w) => w.message.includes('file.read'))).toBe(false);
    expect(result.warnings.some((w) => w.message.includes('git.diff'))).toBe(false);
  });

  it('warns about actions not in canonical registry or policy actions', () => {
    const result = validatePolicyFileStrict(join(TEST_DIR, 'non-canonical.yaml'), true);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.message.includes('custom.action'))).toBe(true);
    expect(result.warnings.some((w) => w.message.includes('canonical action registry'))).toBe(true);
    // file.write is valid — should not warn
    expect(result.warnings.some((w) => w.message.includes('"file.write"'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule conflict detection
// ---------------------------------------------------------------------------

describe('rule conflict detection', () => {
  it('warns about conflicting allow and deny rules for same action', () => {
    const result = validatePolicyFileStrict(join(TEST_DIR, 'conflicting.yaml'), true);
    expect(result.valid).toBe(true);
    expect(
      result.warnings.some(
        (w) => w.message.includes('Conflicting') && w.message.includes('shell.exec')
      )
    ).toBe(true);
    expect(result.warnings.some((w) => w.message.includes('deny rules take precedence'))).toBe(
      true
    );
  });

  it('does not warn about conflicts when only one effect is used', () => {
    const result = validatePolicyFileStrict(join(TEST_DIR, 'overlapping.yaml'), true);
    // overlapping has only deny rules — no conflict warning
    expect(result.warnings.some((w) => w.message.includes('Conflicting'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Exit code behavior
// ---------------------------------------------------------------------------

describe('exit code semantics', () => {
  it('valid policy without strict returns exit code 0 (valid, no warnings)', () => {
    const result = validatePolicyFileStrict(join(TEST_DIR, 'valid.yaml'), false);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('valid policy with strict warnings returns warnings array', () => {
    const result = validatePolicyFileStrict(join(TEST_DIR, 'conflicting.yaml'), true);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('invalid policy returns valid=false', () => {
    const result = validatePolicyFileStrict(join(TEST_DIR, 'missing-id.yaml'), true);
    expect(result.valid).toBe(false);
  });
});

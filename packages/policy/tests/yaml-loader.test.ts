// Tests for YAML policy loader
import { describe, it, expect } from 'vitest';
import { parseYamlPolicy, loadYamlPolicy } from '@red-codes/policy';

describe('parseYamlPolicy', () => {
  it('parses basic policy', () => {
    const yaml = `
id: protect-main
name: Protect Main Branch
severity: 4
rules:
  - action: git.push
    effect: deny
    reason: Protected branch
`;
    const result = parseYamlPolicy(yaml);
    expect(result.id).toBe('protect-main');
    expect(result.name).toBe('Protect Main Branch');
    expect(result.severity).toBe(4);
    expect(result.rules).toHaveLength(1);
    expect(result.rules![0].action).toBe('git.push');
    expect(result.rules![0].effect).toBe('deny');
    expect(result.rules![0].reason).toBe('Protected branch');
  });

  it('parses multiple rules', () => {
    const yaml = `
id: strict
name: Strict Policy
rules:
  - action: git.push
    effect: deny
    reason: No pushing
  - action: git.force-push
    effect: deny
    reason: No force pushing
  - action: file.read
    effect: allow
    reason: Reading is fine
`;
    const result = parseYamlPolicy(yaml);
    expect(result.rules).toHaveLength(3);
    expect(result.rules![0].effect).toBe('deny');
    expect(result.rules![1].effect).toBe('deny');
    expect(result.rules![2].effect).toBe('allow');
  });

  it('parses inline branches array', () => {
    const yaml = `
rules:
  - action: git.push
    effect: deny
    branches: [main, master, production]
`;
    const result = parseYamlPolicy(yaml);
    expect(result.rules![0].branches).toEqual(['main', 'master', 'production']);
  });

  it('parses target condition', () => {
    const yaml = `
rules:
  - action: file.write
    effect: deny
    target: .env
    reason: No env file writes
`;
    const result = parseYamlPolicy(yaml);
    expect(result.rules![0].target).toBe('.env');
  });

  it('parses limit condition', () => {
    const yaml = `
rules:
  - action: file.write
    effect: deny
    limit: 20
`;
    const result = parseYamlPolicy(yaml);
    expect(result.rules![0].limit).toBe(20);
  });

  it('skips comments and blank lines', () => {
    const yaml = `
# This is a comment
id: test

# Another comment
rules:
  # Rule comment
  - action: git.push
    effect: deny
`;
    const result = parseYamlPolicy(yaml);
    expect(result.id).toBe('test');
    expect(result.rules).toHaveLength(1);
  });

  it('handles quoted values', () => {
    const yaml = `
id: "quoted-id"
name: 'single-quoted'
rules:
  - action: "git.push"
    effect: "deny"
`;
    const result = parseYamlPolicy(yaml);
    expect(result.id).toBe('quoted-id');
    expect(result.name).toBe('single-quoted');
    expect(result.rules![0].action).toBe('git.push');
  });
});

describe('loadYamlPolicy', () => {
  it('converts to LoadedPolicy format', () => {
    const yaml = `
id: test-policy
name: Test Policy
severity: 3
rules:
  - action: git.push
    effect: deny
    reason: No pushing
    target: main
`;
    const policy = loadYamlPolicy(yaml);
    expect(policy.id).toBe('test-policy');
    expect(policy.name).toBe('Test Policy');
    expect(policy.severity).toBe(3);
    expect(policy.rules).toHaveLength(1);
    expect(policy.rules[0].action).toBe('git.push');
    expect(policy.rules[0].effect).toBe('deny');
    expect(policy.rules[0].conditions?.scope).toEqual(['main']);
  });

  it('uses defaults for missing fields', () => {
    const yaml = `
rules:
  - action: git.push
    effect: deny
`;
    const policy = loadYamlPolicy(yaml, 'fallback-id');
    expect(policy.id).toBe('fallback-id');
    expect(policy.name).toBe('YAML Policy');
    expect(policy.severity).toBe(3);
  });

  it('converts branches to conditions', () => {
    const yaml = `
rules:
  - action: git.push
    effect: deny
    branches: [main, master]
`;
    const policy = loadYamlPolicy(yaml);
    expect(policy.rules[0].conditions?.branches).toEqual(['main', 'master']);
  });
});

// Tests for policy pack loader — resolution, loading, validation, and merging
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolvePackPath, loadPackFile, resolveExtends, mergePolicies } from '@red-codes/policy';
import { parseYamlPolicy } from '@red-codes/policy';
import type { LoadedPolicy } from '@red-codes/policy';

const TEST_DIR = resolve('tests/tmp-pack-test');

function ensureClean() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// parseYamlPolicy — extends support
// ---------------------------------------------------------------------------

describe('parseYamlPolicy extends', () => {
  it('parses inline extends array', () => {
    const yaml = `
id: my-policy
name: My Policy
extends: ["@agentguard/security-pack", "./custom-rules"]
rules:
  - action: file.read
    effect: allow
`;
    const result = parseYamlPolicy(yaml);
    expect(result.extends).toEqual(['@agentguard/security-pack', './custom-rules']);
  });

  it('parses multi-line extends array', () => {
    const yaml = `
id: my-policy
name: My Policy
extends:
  - "@agentguard/security-pack"
  - "./custom-rules"
rules:
  - action: file.read
    effect: allow
`;
    const result = parseYamlPolicy(yaml);
    expect(result.extends).toEqual(['@agentguard/security-pack', './custom-rules']);
  });

  it('returns undefined extends when not present', () => {
    const yaml = `
id: my-policy
name: My Policy
rules:
  - action: file.read
    effect: allow
`;
    const result = parseYamlPolicy(yaml);
    expect(result.extends).toBeUndefined();
  });

  it('handles single-item extends array', () => {
    const yaml = `
id: my-policy
name: My Policy
extends: ["./pack"]
rules:
  - action: file.read
    effect: allow
`;
    const result = parseYamlPolicy(yaml);
    expect(result.extends).toEqual(['./pack']);
  });

  it('parses version and agentguardVersion fields', () => {
    const yaml = `
id: versioned-policy
name: Versioned Policy
version: 1.2.0
agentguardVersion: ">=2.0.0"
rules:
  - action: file.read
    effect: allow
`;
    const result = parseYamlPolicy(yaml);
    expect(result.version).toBe('1.2.0');
    expect(result.agentguardVersion).toBe('>=2.0.0');
  });

  it('leaves version fields undefined when not present', () => {
    const yaml = `
id: no-version
name: No Version
rules:
  - action: file.read
    effect: allow
`;
    const result = parseYamlPolicy(yaml);
    expect(result.version).toBeUndefined();
    expect(result.agentguardVersion).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolvePackPath
// ---------------------------------------------------------------------------

describe('resolvePackPath', () => {
  beforeEach(() => ensureClean());
  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('resolves a direct YAML file path', () => {
    const packPath = join(TEST_DIR, 'security.yaml');
    writeFileSync(
      packPath,
      'id: security\nname: Security\nrules:\n  - action: "*"\n    effect: deny\n'
    );

    const result = resolvePackPath('./security.yaml', TEST_DIR);
    expect(result).toBe(packPath);
  });

  it('resolves a directory with agentguard-pack.yaml', () => {
    const packDir = join(TEST_DIR, 'my-pack');
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, 'agentguard-pack.yaml'),
      'id: pack\nname: Pack\nrules:\n  - action: "*"\n    effect: deny\n'
    );

    const result = resolvePackPath('./my-pack', TEST_DIR);
    expect(result).toBe(join(packDir, 'agentguard-pack.yaml'));
  });

  it('resolves a directory with agentguard.yaml fallback', () => {
    const packDir = join(TEST_DIR, 'my-pack');
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, 'agentguard.yaml'),
      'id: pack\nname: Pack\nrules:\n  - action: "*"\n    effect: deny\n'
    );

    const result = resolvePackPath('./my-pack', TEST_DIR);
    expect(result).toBe(join(packDir, 'agentguard.yaml'));
  });

  it('tries common extensions when path has no extension', () => {
    const packPath = join(TEST_DIR, 'strict.yaml');
    writeFileSync(
      packPath,
      'id: strict\nname: Strict\nrules:\n  - action: "*"\n    effect: deny\n'
    );

    const result = resolvePackPath('./strict', TEST_DIR);
    expect(result).toBe(packPath);
  });

  it('resolves npm-style packages from node_modules', () => {
    const npmDir = join(TEST_DIR, 'node_modules', '@agentguard', 'security-pack');
    mkdirSync(npmDir, { recursive: true });
    writeFileSync(
      join(npmDir, 'agentguard-pack.yaml'),
      'id: npm-pack\nname: NPM Pack\nrules:\n  - action: "*"\n    effect: deny\n'
    );

    const result = resolvePackPath('@agentguard/security-pack', TEST_DIR);
    expect(result).toBe(join(npmDir, 'agentguard-pack.yaml'));
  });

  it('returns null for non-existent pack', () => {
    const result = resolvePackPath('./non-existent', TEST_DIR);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadPackFile
// ---------------------------------------------------------------------------

describe('loadPackFile', () => {
  beforeEach(() => ensureClean());
  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('loads a YAML pack file', () => {
    const packPath = join(TEST_DIR, 'pack.yaml');
    writeFileSync(
      packPath,
      `
id: test-pack
name: Test Pack
severity: 4
rules:
  - action: git.push
    effect: deny
    reason: No pushing from pack
`
    );

    const pack = loadPackFile(packPath);
    expect(pack).not.toBeNull();
    expect(pack!.id).toBe('test-pack');
    expect(pack!.name).toBe('Test Pack');
    expect(pack!.severity).toBe(4);
    expect(pack!.rules).toHaveLength(1);
    expect(pack!.rules[0].action).toBe('git.push');
    expect(pack!.rules[0].effect).toBe('deny');
  });

  it('loads a JSON pack file', () => {
    const packPath = join(TEST_DIR, 'pack.json');
    writeFileSync(
      packPath,
      JSON.stringify({
        id: 'json-pack',
        name: 'JSON Pack',
        severity: 2,
        rules: [{ action: 'file.delete', effect: 'deny', reason: 'No deletes' }],
      })
    );

    const pack = loadPackFile(packPath);
    expect(pack).not.toBeNull();
    expect(pack!.id).toBe('json-pack');
    expect(pack!.name).toBe('JSON Pack');
  });

  it('loads JSON pack with version fields', () => {
    const packPath = join(TEST_DIR, 'versioned.json');
    writeFileSync(
      packPath,
      JSON.stringify({
        id: 'versioned-json',
        name: 'Versioned JSON',
        version: '2.1.0',
        agentguardVersion: '^2.0.0',
        severity: 3,
        rules: [{ action: 'file.delete', effect: 'deny' }],
      }),
    );

    const pack = loadPackFile(packPath);
    expect(pack).not.toBeNull();
    expect(pack!.version).toBe('2.1.0');
    expect(pack!.agentguardVersion).toBe('^2.0.0');
  });

  it('returns null for invalid JSON pack', () => {
    const packPath = join(TEST_DIR, 'bad.json');
    writeFileSync(packPath, 'not valid json');

    const pack = loadPackFile(packPath);
    expect(pack).toBeNull();
  });

  it('returns null for JSON pack that fails validation', () => {
    const packPath = join(TEST_DIR, 'invalid.json');
    writeFileSync(packPath, JSON.stringify({ rules: [] }));

    const pack = loadPackFile(packPath);
    expect(pack).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveExtends
// ---------------------------------------------------------------------------

describe('resolveExtends', () => {
  beforeEach(() => ensureClean());
  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('resolves and loads multiple packs', () => {
    writeFileSync(
      join(TEST_DIR, 'pack-a.yaml'),
      `
id: pack-a
name: Pack A
rules:
  - action: git.push
    effect: deny
`
    );
    writeFileSync(
      join(TEST_DIR, 'pack-b.yaml'),
      `
id: pack-b
name: Pack B
rules:
  - action: file.delete
    effect: deny
`
    );

    const { policies, errors, warnings } = resolveExtends(
      ['./pack-a.yaml', './pack-b.yaml'],
      TEST_DIR,
    );

    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
    expect(policies).toHaveLength(2);
    expect(policies[0].id).toBe('pack-a');
    expect(policies[1].id).toBe('pack-b');
  });

  it('reports error for missing pack', () => {
    const { policies, errors } = resolveExtends(['./non-existent.yaml'], TEST_DIR);

    expect(policies).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Pack not found');
  });

  it('detects duplicate pack IDs', () => {
    writeFileSync(
      join(TEST_DIR, 'pack1.yaml'),
      `
id: same-id
name: Pack 1
rules:
  - action: git.push
    effect: deny
`,
    );
    writeFileSync(
      join(TEST_DIR, 'pack2.yaml'),
      `
id: same-id
name: Pack 2
rules:
  - action: file.delete
    effect: deny
`,
    );

    const { policies, errors } = resolveExtends(['./pack1.yaml', './pack2.yaml'], TEST_DIR);

    expect(policies).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Duplicate pack ID');
  });

  it('loads pack with version metadata', () => {
    writeFileSync(
      join(TEST_DIR, 'versioned-pack.yaml'),
      `
id: versioned
name: Versioned Pack
version: 1.2.0
agentguardVersion: ">=2.0.0"
rules:
  - action: file.delete
    effect: deny
`,
    );

    const { policies, errors } = resolveExtends(
      ['./versioned-pack.yaml'],
      TEST_DIR,
      { currentAgentguardVersion: '2.2.0' },
    );

    expect(errors).toHaveLength(0);
    expect(policies).toHaveLength(1);
    expect(policies[0].version).toBe('1.2.0');
    expect(policies[0].agentguardVersion).toBe('>=2.0.0');
  });

  it('rejects pack incompatible with current AgentGuard version', () => {
    writeFileSync(
      join(TEST_DIR, 'future-pack.yaml'),
      `
id: future
name: Future Pack
version: 1.0.0
agentguardVersion: ">=5.0.0"
rules:
  - action: file.delete
    effect: deny
`,
    );

    const { policies, errors } = resolveExtends(
      ['./future-pack.yaml'],
      TEST_DIR,
      { currentAgentguardVersion: '2.2.0' },
    );

    expect(policies).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('incompatible');
    expect(errors[0]).toContain('>=5.0.0');
  });

  it('skips compatibility check when no currentAgentguardVersion provided', () => {
    writeFileSync(
      join(TEST_DIR, 'strict-pack.yaml'),
      `
id: strict
name: Strict Pack
agentguardVersion: ">=99.0.0"
rules:
  - action: file.delete
    effect: deny
`,
    );

    const { policies, errors } = resolveExtends(
      ['./strict-pack.yaml'],
      TEST_DIR,
    );

    expect(errors).toHaveLength(0);
    expect(policies).toHaveLength(1);
  });

  it('warns when version pin does not match pack version', () => {
    writeFileSync(
      join(TEST_DIR, 'old-pack.yaml'),
      `
id: old-pack
name: Old Pack
version: 1.0.0
rules:
  - action: file.delete
    effect: deny
`,
    );

    const { policies, warnings } = resolveExtends(
      ['./old-pack.yaml@^2.0.0'],
      TEST_DIR,
    );

    expect(policies).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('does not satisfy');
    expect(warnings[0]).toContain('^2.0.0');
  });

  it('warns when version pin requested but pack has no version', () => {
    writeFileSync(
      join(TEST_DIR, 'no-ver.yaml'),
      `
id: no-ver
name: No Version Pack
rules:
  - action: file.delete
    effect: deny
`,
    );

    const { policies, warnings } = resolveExtends(
      ['./no-ver.yaml@^1.0.0'],
      TEST_DIR,
    );

    expect(policies).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('no version field');
  });

  it('accepts pack when version pin matches', () => {
    writeFileSync(
      join(TEST_DIR, 'good-pack.yaml'),
      `
id: good-pack
name: Good Pack
version: 1.3.0
rules:
  - action: file.delete
    effect: deny
`,
    );

    const { policies, warnings } = resolveExtends(
      ['./good-pack.yaml@^1.2.0'],
      TEST_DIR,
    );

    expect(policies).toHaveLength(1);
    expect(warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// mergePolicies
// ---------------------------------------------------------------------------

describe('mergePolicies', () => {
  it('places pack policies before local policy', () => {
    const local: LoadedPolicy = {
      id: 'local',
      name: 'Local',
      rules: [{ action: 'file.write', effect: 'allow', reason: 'local allow' }],
      severity: 3,
    };

    const packA: LoadedPolicy = {
      id: 'pack-a',
      name: 'Pack A',
      rules: [{ action: 'git.push', effect: 'deny', reason: 'pack deny' }],
      severity: 4,
    };

    const packB: LoadedPolicy = {
      id: 'pack-b',
      name: 'Pack B',
      rules: [{ action: 'file.delete', effect: 'deny', reason: 'pack deny' }],
      severity: 3,
    };

    const merged = mergePolicies(local, [packA, packB]);

    expect(merged).toHaveLength(3);
    expect(merged[0].id).toBe('pack-a');
    expect(merged[1].id).toBe('pack-b');
    expect(merged[2].id).toBe('local');
  });

  it('returns just local policy when no packs provided', () => {
    const local: LoadedPolicy = {
      id: 'local',
      name: 'Local',
      rules: [{ action: '*', effect: 'allow' }],
      severity: 3,
    };

    const merged = mergePolicies(local, []);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('local');
  });
});

// Tests for the policy-resolver module — policy discovery, loading, and composition.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/mock-home'),
}));

vi.mock('@red-codes/policy', () => ({
  loadYamlPolicy: vi.fn(),
  parseYamlPolicy: vi.fn(),
  resolveExtends: vi.fn(),
  mergePolicies: vi.fn(),
  composePolicies: vi.fn(),
  describeComposition: vi.fn(),
}));

// Mock process.exit to prevent test process from exiting
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
const mockStderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import {
  loadYamlPolicy,
  parseYamlPolicy,
  resolveExtends,
  mergePolicies,
  composePolicies,
  describeComposition,
} from '@red-codes/policy';

import {
  findDefaultPolicy,
  findPolicyForPath,
  findUserPolicy,
  loadPolicyFile,
  loadPolicyDefs,
  loadComposedPolicies,
} from '../src/policy-resolver.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// findDefaultPolicy
// ---------------------------------------------------------------------------

describe('findDefaultPolicy', () => {
  it('returns first matching candidate when existsSync returns true', () => {
    vi.mocked(existsSync).mockImplementation((p) => p === 'agentguard.yaml');
    expect(findDefaultPolicy()).toBe('agentguard.yaml');
  });

  it('returns null when no candidates exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(findDefaultPolicy()).toBeNull();
  });

  it('returns agentguard.yml if agentguard.yaml does not exist but .yml does', () => {
    vi.mocked(existsSync).mockImplementation((p) => p === 'agentguard.yml');
    expect(findDefaultPolicy()).toBe('agentguard.yml');
  });
});

// ---------------------------------------------------------------------------
// findPolicyForPath — path-aware policy resolution (global hook bypass fix)
// ---------------------------------------------------------------------------

describe('findPolicyForPath', () => {
  // Use resolve() so paths include the drive letter on Windows (e.g., C:\home\...)
  const projectDir = resolve('/home/user/project');
  const policyPath = join(projectDir, 'agentguard.yaml');

  it('finds policy in the same directory as the target file', () => {
    vi.mocked(existsSync).mockImplementation((p) => p === policyPath);

    const result = findPolicyForPath(join(projectDir, '.env'));

    expect(result).toEqual({ policyPath, projectRoot: projectDir });
  });

  it('walks up directories to find policy', () => {
    vi.mocked(existsSync).mockImplementation((p) => p === policyPath);

    const result = findPolicyForPath(join(projectDir, 'src', 'deep', 'file.ts'));

    expect(result).toEqual({ policyPath, projectRoot: projectDir });
  });

  it('returns null when no policy found anywhere up the tree', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = findPolicyForPath(join(projectDir, 'file.ts'));

    expect(result).toBeNull();
  });

  it('finds .agentguard.yaml variant', () => {
    const dotPolicyPath = join(projectDir, '.agentguard.yaml');
    vi.mocked(existsSync).mockImplementation((p) => p === dotPolicyPath);

    const result = findPolicyForPath(join(projectDir, 'src', 'index.ts'));

    expect(result).toEqual({ policyPath: dotPolicyPath, projectRoot: projectDir });
  });

  it('prefers agentguard.yaml over agentguard.yml in same directory', () => {
    const ymlPath = join(projectDir, 'agentguard.yml');
    vi.mocked(existsSync).mockImplementation((p) => p === policyPath || p === ymlPath);

    const result = findPolicyForPath(join(projectDir, '.env'));

    // agentguard.yaml is checked first in DEFAULT_POLICY_CANDIDATES
    expect(result?.policyPath).toBe(policyPath);
  });
});

describe('findDefaultPolicy with targetPath', () => {
  const projectDir = resolve('/home/user/project');
  const policyPath = join(projectDir, 'agentguard.yaml');

  it('uses path-aware resolution when targetPath is provided', () => {
    vi.mocked(existsSync).mockImplementation((p) => p === policyPath);

    const result = findDefaultPolicy(join(projectDir, 'src', 'auth.ts'));

    expect(result).toBe(policyPath);
  });

  it('falls back to cwd when targetPath yields no policy', () => {
    vi.mocked(existsSync).mockImplementation((p) => p === 'agentguard.yaml');

    const result = findDefaultPolicy(resolve('/some/random/file.ts'));

    expect(result).toBe('agentguard.yaml');
  });
});

// ---------------------------------------------------------------------------
// findUserPolicy
// ---------------------------------------------------------------------------

describe('findUserPolicy', () => {
  it('returns full path when user policy exists', () => {
    const expectedPath = join('/mock-home', '.agentguard', 'policy.yaml');
    vi.mocked(existsSync).mockImplementation((p) => p === expectedPath);
    expect(findUserPolicy()).toBe(expectedPath);
  });

  it('returns null when no user policy exists', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(findUserPolicy()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadPolicyFile
// ---------------------------------------------------------------------------

describe('loadPolicyFile', () => {
  it('loads YAML policy file (.yaml extension)', () => {
    const absPath = resolve('test-policy.yaml');
    const yamlContent = 'id: test\nname: Test\nrules: []';
    const mockPolicy = { id: 'test', name: 'Test', rules: [], severity: 3 };

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(yamlContent);
    vi.mocked(loadYamlPolicy).mockReturnValue(mockPolicy as never);
    vi.mocked(parseYamlPolicy).mockReturnValue({ extends: [] } as never);

    const result = loadPolicyFile('test-policy.yaml');

    expect(loadYamlPolicy).toHaveBeenCalledWith(yamlContent, 'test-policy.yaml');
    expect(result).toEqual([{ id: 'test', name: 'Test', rules: [], severity: 3 }]);
  });

  it('loads YAML policy file with extends chain', () => {
    const absPath = resolve('test-policy.yaml');
    const yamlContent = 'id: test\nname: Test\nextends: [ci-safe]';
    const localPolicy = { id: 'test', name: 'Test', rules: [{ action: 'file.read' }], severity: 3 };
    const packPolicy = {
      id: 'ci-safe',
      name: 'CI Safe',
      rules: [{ action: 'git.push' }],
      severity: 2,
    };
    const mergedPolicies = [localPolicy, packPolicy];

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(yamlContent);
    vi.mocked(loadYamlPolicy).mockReturnValue(localPolicy as never);
    vi.mocked(parseYamlPolicy).mockReturnValue({ extends: ['ci-safe'] } as never);
    vi.mocked(resolveExtends).mockReturnValue({ policies: [packPolicy], errors: [], warnings: [] } as never);
    vi.mocked(mergePolicies).mockReturnValue(mergedPolicies as never);

    const result = loadPolicyFile('test-policy.yaml');

    expect(resolveExtends).toHaveBeenCalled();
    expect(mergePolicies).toHaveBeenCalledWith(localPolicy, [packPolicy]);
    expect(result).toHaveLength(2);
  });

  it('loads JSON policy file (single object)', () => {
    const absPath = resolve('policy.json');
    const jsonContent = JSON.stringify({ id: 'json-policy', rules: [] });

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(jsonContent);

    const result = loadPolicyFile('policy.json');

    expect(result).toEqual([{ id: 'json-policy', rules: [] }]);
  });

  it('loads JSON policy file (array of policies)', () => {
    const policies = [
      { id: 'policy-a', rules: [] },
      { id: 'policy-b', rules: [] },
    ];
    const jsonContent = JSON.stringify(policies);

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(jsonContent);

    const result = loadPolicyFile('policies.json');

    expect(result).toEqual(policies);
    expect(result).toHaveLength(2);
  });

  it('exits with error for missing file', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    loadPolicyFile('nonexistent.yaml');

    expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining('Policy file not found'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('exits with error for malformed JSON', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{ invalid json');

    loadPolicyFile('bad.json');

    expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining('Failed to parse policy file'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// loadPolicyDefs
// ---------------------------------------------------------------------------

describe('loadPolicyDefs', () => {
  it('uses provided path', () => {
    const jsonContent = JSON.stringify({ id: 'explicit', rules: [] });

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(jsonContent);

    const result = loadPolicyDefs('explicit.json');

    expect(result).toEqual([{ id: 'explicit', rules: [] }]);
  });

  it('falls back to findDefaultPolicy', () => {
    // existsSync returns true for agentguard.yaml (first candidate)
    vi.mocked(existsSync).mockImplementation(
      (p) => p === 'agentguard.yaml' || p === resolve('agentguard.yaml')
    );
    const yamlContent = 'id: default\nname: Default\nrules: []';
    const mockPolicy = { id: 'default', name: 'Default', rules: [], severity: 3 };

    vi.mocked(readFileSync).mockReturnValue(yamlContent);
    vi.mocked(loadYamlPolicy).mockReturnValue(mockPolicy as never);
    vi.mocked(parseYamlPolicy).mockReturnValue({ extends: [] } as never);

    const result = loadPolicyDefs();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'default', name: 'Default', rules: [], severity: 3 });
  });

  it('returns empty array when no policy found', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = loadPolicyDefs();

    expect(result).toEqual([]);
  });

  it('uses targetPath for path-aware resolution when no explicit path given', () => {
    const projectDir = resolve('/home/user/project');
    const projectPolicyPath = join(projectDir, 'agentguard.yaml');
    const yamlContent = 'id: project\nname: Project\nrules: []';
    const mockPolicy = { id: 'project', name: 'Project', rules: [], severity: 3 };

    vi.mocked(existsSync).mockImplementation(
      (p) => p === projectPolicyPath || p === resolve(projectPolicyPath)
    );
    vi.mocked(readFileSync).mockReturnValue(yamlContent);
    vi.mocked(loadYamlPolicy).mockReturnValue(mockPolicy as never);
    vi.mocked(parseYamlPolicy).mockReturnValue({ extends: [] } as never);

    const result = loadPolicyDefs(undefined, join(projectDir, '.env'));

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'project', name: 'Project', rules: [], severity: 3 });
  });
});

// ---------------------------------------------------------------------------
// loadComposedPolicies
// ---------------------------------------------------------------------------

describe('loadComposedPolicies', () => {
  const userPolicyPath = join('/mock-home', '.agentguard', 'policy.yaml');

  it('includes user-level policy when it exists', () => {
    const userPolicy = { id: 'user-policy', name: 'User', rules: [], severity: 1 };
    const yamlContent = 'id: user-policy\nname: User\nrules: []';

    vi.mocked(existsSync).mockImplementation((p) => p === userPolicyPath);
    vi.mocked(readFileSync).mockReturnValue(yamlContent);
    vi.mocked(loadYamlPolicy).mockReturnValue(userPolicy as never);
    vi.mocked(parseYamlPolicy).mockReturnValue({ extends: [] } as never);
    vi.mocked(composePolicies).mockReturnValue({ policies: [userPolicy], sources: [] } as never);

    loadComposedPolicies();

    expect(composePolicies).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ path: userPolicyPath, layer: 'user' })])
    );
  });

  it('includes project-level policy', () => {
    const projectPolicy = { id: 'project-policy', name: 'Project', rules: [], severity: 2 };
    const yamlContent = 'id: project-policy\nname: Project\nrules: []';

    // No user policy, but project-level agentguard.yaml exists
    vi.mocked(existsSync).mockImplementation(
      (p) => p === 'agentguard.yaml' || p === resolve('agentguard.yaml')
    );
    vi.mocked(readFileSync).mockReturnValue(yamlContent);
    vi.mocked(loadYamlPolicy).mockReturnValue(projectPolicy as never);
    vi.mocked(parseYamlPolicy).mockReturnValue({ extends: [] } as never);
    vi.mocked(composePolicies).mockReturnValue({ policies: [projectPolicy], sources: [] } as never);

    loadComposedPolicies();

    expect(composePolicies).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ layer: 'project' })])
    );
  });

  it('includes explicit policy paths', () => {
    const explicitPolicy = { id: 'explicit', name: 'Explicit', rules: [], severity: 3 };
    const jsonContent = JSON.stringify(explicitPolicy);

    // No user or project policy, only explicit
    vi.mocked(existsSync).mockImplementation((p) => p === resolve('custom.json'));
    vi.mocked(readFileSync).mockReturnValue(jsonContent);
    vi.mocked(composePolicies).mockReturnValue({
      policies: [explicitPolicy],
      sources: [],
    } as never);

    loadComposedPolicies(['custom.json']);

    expect(composePolicies).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ layer: 'explicit' })])
    );
  });

  it('avoids loading default policy twice when explicitly listed', () => {
    const policy = { id: 'default', name: 'Default', rules: [], severity: 2 };
    const yamlContent = 'id: default\nname: Default\nrules: []';
    const absDefault = resolve('agentguard.yaml');

    // agentguard.yaml exists as both project default and is passed explicitly
    vi.mocked(existsSync).mockImplementation((p) => p === 'agentguard.yaml' || p === absDefault);
    vi.mocked(readFileSync).mockReturnValue(yamlContent);
    vi.mocked(loadYamlPolicy).mockReturnValue(policy as never);
    vi.mocked(parseYamlPolicy).mockReturnValue({ extends: [] } as never);
    vi.mocked(composePolicies).mockReturnValue({ policies: [policy], sources: [] } as never);

    loadComposedPolicies(['agentguard.yaml']);

    // composePolicies should be called with sources that do NOT include a 'project' layer
    // since the default policy is explicitly listed (only 'explicit' layer)
    const sources = vi.mocked(composePolicies).mock.calls[0][0] as Array<{ layer: string }>;
    const projectSources = sources.filter((s) => s.layer === 'project');
    expect(projectSources).toHaveLength(0);
  });

  it('handles load failures gracefully (warns but continues)', () => {
    // User policy exists but fails to load
    vi.mocked(existsSync).mockImplementation((p) => p === userPolicyPath);
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('read error');
    });
    vi.mocked(composePolicies).mockReturnValue({ policies: [], sources: [] } as never);

    loadComposedPolicies();

    expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining('Failed to load user policy'));
    // composePolicies should still be called (with empty sources)
    expect(composePolicies).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// describeComposition re-export
// ---------------------------------------------------------------------------

describe('describeComposition', () => {
  it('is re-exported from @red-codes/policy', () => {
    expect(describeComposition).toBeDefined();
    expect(typeof describeComposition).toBe('function');
  });
});

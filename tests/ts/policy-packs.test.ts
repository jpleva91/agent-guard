// Tests for prebuilt policy packs — verifies all four packs load correctly,
// have valid structure, and produce expected governance decisions.
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { resolvePackPath, loadPackFile } from '../../src/policy/pack-loader.js';
import { evaluate } from '../../src/policy/evaluator.js';
import type { LoadedPolicy, NormalizedIntent } from '../../src/policy/evaluator.js';

const POLICIES_DIR = resolve('policies');

/** Helper to load a pack from the policies directory */
function loadPack(name: string): LoadedPolicy {
  const packPath = resolvePackPath(`./${name}`, POLICIES_DIR);
  if (!packPath) throw new Error(`Pack "${name}" not found in ${POLICIES_DIR}`);
  const pack = loadPackFile(packPath);
  if (!pack) throw new Error(`Failed to load pack "${name}" from ${packPath}`);
  return pack;
}

/** Helper to create a normalized intent for testing */
function intent(overrides: Partial<NormalizedIntent>): NormalizedIntent {
  return {
    action: 'file.read',
    target: 'src/index.ts',
    agent: 'test-agent',
    destructive: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pack resolution and loading
// ---------------------------------------------------------------------------

describe('policy packs — resolution and loading', () => {
  it.each(['strict', 'open-source', 'enterprise', 'ci-safe'])(
    'resolves %s pack by directory name',
    (name) => {
      const packPath = resolvePackPath(`./${name}`, POLICIES_DIR);
      expect(packPath).not.toBeNull();
      expect(packPath!).toContain('agentguard-pack.yaml');
    }
  );

  it.each(['strict', 'open-source', 'enterprise', 'ci-safe'])(
    'loads %s pack successfully',
    (name) => {
      const pack = loadPack(name);
      expect(pack.id).toBeTruthy();
      expect(pack.name).toBeTruthy();
      expect(pack.description).toBeTruthy();
      expect(pack.rules.length).toBeGreaterThan(0);
      expect(pack.severity).toBeGreaterThanOrEqual(1);
      expect(pack.severity).toBeLessThanOrEqual(5);
    }
  );

  it('each pack has a unique ID', () => {
    const packs = ['strict', 'open-source', 'enterprise', 'ci-safe'].map(loadPack);
    const ids = packs.map((p) => p.id);
    expect(new Set(ids).size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Strict pack behavior
// ---------------------------------------------------------------------------

describe('strict pack — governance decisions', () => {
  const pack = loadPack('strict');
  const policies = [pack];

  it('denies push to main', () => {
    const result = evaluate(intent({ action: 'git.push', branch: 'main' }), policies);
    expect(result.allowed).toBe(false);
    expect(result.decision).toBe('deny');
  });

  it('denies push to develop', () => {
    const result = evaluate(intent({ action: 'git.push', branch: 'develop' }), policies);
    expect(result.allowed).toBe(false);
    expect(result.decision).toBe('deny');
  });

  it('denies force push', () => {
    const result = evaluate(intent({ action: 'git.force-push' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies git reset', () => {
    const result = evaluate(intent({ action: 'git.reset' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies branch deletion', () => {
    const result = evaluate(intent({ action: 'git.branch.delete' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies file deletion', () => {
    const result = evaluate(intent({ action: 'file.delete' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies .env modification', () => {
    const result = evaluate(intent({ action: 'file.write', target: '.env' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies rm -rf', () => {
    const result = evaluate(intent({ action: 'shell.exec', target: 'rm -rf' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies npm publish', () => {
    const result = evaluate(intent({ action: 'npm.publish' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies deploy trigger', () => {
    const result = evaluate(intent({ action: 'deploy.trigger' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies infra destroy', () => {
    const result = evaluate(intent({ action: 'infra.destroy' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('allows file read', () => {
    const result = evaluate(intent({ action: 'file.read' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows test run', () => {
    const result = evaluate(intent({ action: 'test.run' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows git diff', () => {
    const result = evaluate(intent({ action: 'git.diff' }), policies);
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Open source pack behavior
// ---------------------------------------------------------------------------

describe('open-source pack — governance decisions', () => {
  const pack = loadPack('open-source');
  const policies = [pack];

  it('denies force push', () => {
    const result = evaluate(intent({ action: 'git.force-push' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies .env modification', () => {
    const result = evaluate(intent({ action: 'file.write', target: '.env' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies npm publish', () => {
    const result = evaluate(intent({ action: 'npm.publish' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('allows push to any branch (branch protection via invariants)', () => {
    const result = evaluate(intent({ action: 'git.push', branch: 'feature/my-feature' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows file writes', () => {
    const result = evaluate(intent({ action: 'file.write', target: 'src/index.ts' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows file deletion', () => {
    const result = evaluate(intent({ action: 'file.delete' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows branch creation', () => {
    const result = evaluate(intent({ action: 'git.branch.create' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows shell commands', () => {
    const result = evaluate(intent({ action: 'shell.exec', target: 'npm run build' }), policies);
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Enterprise pack behavior
// ---------------------------------------------------------------------------

describe('enterprise pack — governance decisions', () => {
  const pack = loadPack('enterprise');
  const policies = [pack];

  it('denies force push', () => {
    const result = evaluate(intent({ action: 'git.force-push' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies git reset', () => {
    const result = evaluate(intent({ action: 'git.reset' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies .env modification', () => {
    const result = evaluate(intent({ action: 'file.write', target: '.env' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies credential file modification', () => {
    const result = evaluate(intent({ action: 'file.write', target: 'credentials.json' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies deploy trigger', () => {
    const result = evaluate(intent({ action: 'deploy.trigger' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies infra apply', () => {
    const result = evaluate(intent({ action: 'infra.apply' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies curl from shell (exact target match)', () => {
    const result = evaluate(intent({ action: 'shell.exec', target: 'curl' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('allows push to feature branch (branch protection via invariants)', () => {
    const result = evaluate(intent({ action: 'git.push', branch: 'feature/abc' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows file reads', () => {
    const result = evaluate(intent({ action: 'file.read' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows test runs', () => {
    const result = evaluate(intent({ action: 'test.run' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows npm install', () => {
    const result = evaluate(intent({ action: 'npm.install' }), policies);
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CI-safe pack behavior
// ---------------------------------------------------------------------------

describe('ci-safe pack — governance decisions', () => {
  const pack = loadPack('ci-safe');
  const policies = [pack];

  it('denies git push', () => {
    const result = evaluate(intent({ action: 'git.push' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies git commit', () => {
    const result = evaluate(intent({ action: 'git.commit' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies file write', () => {
    const result = evaluate(intent({ action: 'file.write' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies file delete', () => {
    const result = evaluate(intent({ action: 'file.delete' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies branch creation', () => {
    const result = evaluate(intent({ action: 'git.branch.create' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies npm publish', () => {
    const result = evaluate(intent({ action: 'npm.publish' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies deploy trigger', () => {
    const result = evaluate(intent({ action: 'deploy.trigger' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('allows file read', () => {
    const result = evaluate(intent({ action: 'file.read' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows git diff', () => {
    const result = evaluate(intent({ action: 'git.diff' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows test run', () => {
    const result = evaluate(intent({ action: 'test.run' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows shell exec for builds', () => {
    const result = evaluate(intent({ action: 'shell.exec', target: 'npm run build' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows npm install', () => {
    const result = evaluate(intent({ action: 'npm.install' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows npm script run', () => {
    const result = evaluate(intent({ action: 'npm.script.run' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows http requests for API testing', () => {
    const result = evaluate(intent({ action: 'http.request' }), policies);
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cross-pack integration — extends usage
// ---------------------------------------------------------------------------

describe('policy packs — extends integration', () => {
  it('can be loaded as extends references from project root', () => {
    const projectRoot = resolve('.');
    const packPath = resolvePackPath('./policies/strict', projectRoot);
    expect(packPath).not.toBeNull();
    const pack = loadPackFile(packPath!);
    expect(pack).not.toBeNull();
    expect(pack!.id).toBe('strict-pack');
  });

  it('severity levels follow risk ordering', () => {
    const strict = loadPack('strict');
    const enterprise = loadPack('enterprise');
    const ciSafe = loadPack('ci-safe');
    const openSource = loadPack('open-source');

    expect(strict.severity).toBeGreaterThan(enterprise.severity);
    expect(enterprise.severity).toBeGreaterThan(ciSafe.severity);
    expect(ciSafe.severity).toBeGreaterThan(openSource.severity);
  });
});

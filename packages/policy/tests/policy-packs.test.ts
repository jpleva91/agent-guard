// Tests for prebuilt policy packs — verifies all seven packs load correctly,
// have valid structure, and produce expected governance decisions.
import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePackPath, loadPackFile } from '@red-codes/policy';
import { evaluate } from '@red-codes/policy';
import type { LoadedPolicy, NormalizedIntent } from '@red-codes/policy';

const __dirname = dirname(fileURLToPath(import.meta.url));
const POLICIES_DIR = resolve(__dirname, '../../../policies');

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
// All pack names for parameterized tests
// ---------------------------------------------------------------------------

const ALL_PACKS = [
  'strict',
  'open-source',
  'enterprise',
  'ci-safe',
  'soc2',
  'hipaa',
  'engineering-standards',
];

// ---------------------------------------------------------------------------
// Pack resolution and loading
// ---------------------------------------------------------------------------

describe('policy packs — resolution and loading', () => {
  it.each(ALL_PACKS)('resolves %s pack by directory name', (name) => {
    const packPath = resolvePackPath(`./${name}`, POLICIES_DIR);
    expect(packPath).not.toBeNull();
    expect(packPath!).toContain('agentguard-pack.yaml');
  });

  it.each(ALL_PACKS)('loads %s pack successfully', (name) => {
    const pack = loadPack(name);
    expect(pack.id).toBeTruthy();
    expect(pack.name).toBeTruthy();
    expect(pack.description).toBeTruthy();
    expect(pack.rules.length).toBeGreaterThan(0);
    expect(pack.severity).toBeGreaterThanOrEqual(1);
    expect(pack.severity).toBeLessThanOrEqual(5);
  });

  it('each pack has a unique ID', () => {
    const packs = ALL_PACKS.map(loadPack);
    const ids = packs.map((p) => p.id);
    expect(new Set(ids).size).toBe(ALL_PACKS.length);
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
// SOC2 pack behavior
// ---------------------------------------------------------------------------

describe('soc2 pack — governance decisions', () => {
  const pack = loadPack('soc2');
  const policies = [pack];

  it('has severity 4', () => {
    expect(pack.severity).toBe(4);
  });

  it('denies force push (CC7.1 — change traceability)', () => {
    const result = evaluate(intent({ action: 'git.force-push' }), policies);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('CC7.1');
  });

  it('denies git reset (CC7.1)', () => {
    const result = evaluate(intent({ action: 'git.reset' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies push without tests passing (CC7.1 — test-before-push)', () => {
    const result = evaluate(intent({ action: 'git.push', branch: 'feature/x' }), policies);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('CC7.1');
  });

  it('denies .env modification (CC6.1 — access control)', () => {
    const result = evaluate(intent({ action: 'file.write', target: '.env' }), policies);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('CC6.1');
  });

  it('denies secret file modification (CC6.1)', () => {
    const result = evaluate(intent({ action: 'file.write', target: 'config.secret' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies curl from shell (CC6.6 — external threats)', () => {
    const result = evaluate(intent({ action: 'shell.exec', target: 'curl' }), policies);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('CC6.6');
  });

  it('denies wget from shell (CC6.6)', () => {
    const result = evaluate(intent({ action: 'shell.exec', target: 'wget' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies infra apply (CC8.1 — infrastructure authorization)', () => {
    const result = evaluate(intent({ action: 'infra.apply' }), policies);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('CC8.1');
  });

  it('denies deploy trigger (CC8.1)', () => {
    const result = evaluate(intent({ action: 'deploy.trigger' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies npm publish (CC7.1)', () => {
    const result = evaluate(intent({ action: 'npm.publish' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('allows push to feature branch when tests pass', () => {
    const result = evaluate(
      intent({
        action: 'git.push',
        branch: 'feature/soc2-update',
        metadata: { testsPass: true },
      }),
      policies
    );
    expect(result.allowed).toBe(true);
  });

  it('allows file reads', () => {
    const result = evaluate(intent({ action: 'file.read' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows file writes to safe paths', () => {
    const result = evaluate(intent({ action: 'file.write', target: 'src/index.ts' }), policies);
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
// HIPAA pack behavior
// ---------------------------------------------------------------------------

describe('hipaa pack — governance decisions', () => {
  const pack = loadPack('hipaa');
  const policies = [pack];

  it('has severity 5', () => {
    expect(pack.severity).toBe(5);
  });

  it('denies force push (164.312(c)(1) — integrity)', () => {
    const result = evaluate(intent({ action: 'git.force-push' }), policies);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('164.312(c)(1)');
  });

  it('denies git reset (164.312(c)(1))', () => {
    const result = evaluate(intent({ action: 'git.reset' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies branch deletion (164.312(c)(1) — history preservation)', () => {
    const result = evaluate(intent({ action: 'git.branch.delete' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies .env modification (164.312(a)(1) — PHI connection strings)', () => {
    const result = evaluate(intent({ action: 'file.write', target: '.env' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies secret file modification', () => {
    const result = evaluate(intent({ action: 'file.write', target: 'config.secret' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies curl from shell (164.312(e)(1) — transmission security)', () => {
    const result = evaluate(intent({ action: 'shell.exec', target: 'curl' }), policies);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('164.312(e)(1)');
  });

  it('denies HTTP requests (164.312(e)(1))', () => {
    const result = evaluate(intent({ action: 'http.request' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies file deletion (164.312(c)(1) — data integrity)', () => {
    const result = evaluate(
      intent({ action: 'file.delete', target: 'data/records.csv' }),
      policies
    );
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

  it('denies npm publish', () => {
    const result = evaluate(intent({ action: 'npm.publish' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('allows push to feature branch', () => {
    const result = evaluate(intent({ action: 'git.push', branch: 'feature/hipaa-fix' }), policies);
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

  it('allows file writes to safe paths', () => {
    const result = evaluate(intent({ action: 'file.write', target: 'src/index.ts' }), policies);
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Engineering standards pack behavior
// ---------------------------------------------------------------------------

describe('engineering-standards pack — governance decisions', () => {
  const pack = loadPack('engineering-standards');
  const policies = [pack];

  it('has severity 3', () => {
    expect(pack.severity).toBe(3);
  });

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

  it('denies rm -rf', () => {
    const result = evaluate(intent({ action: 'shell.exec', target: 'rm -rf' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies npm publish', () => {
    const result = evaluate(intent({ action: 'npm.publish' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies infra destroy', () => {
    const result = evaluate(intent({ action: 'infra.destroy' }), policies);
    expect(result.allowed).toBe(false);
  });

  it('denies push without tests passing (test-before-push gate)', () => {
    const result = evaluate(
      intent({ action: 'git.push', branch: 'feature/new-feature' }),
      policies
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('test');
  });

  it('allows push to feature branch when tests and format pass', () => {
    const result = evaluate(
      intent({
        action: 'git.push',
        branch: 'feature/new-feature',
        metadata: { testsPass: true, formatPass: true },
      }),
      policies
    );
    expect(result.allowed).toBe(true);
  });

  it('allows file reads', () => {
    const result = evaluate(intent({ action: 'file.read' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows file writes to safe paths', () => {
    const result = evaluate(intent({ action: 'file.write', target: 'src/index.ts' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows file deletion', () => {
    const result = evaluate(intent({ action: 'file.delete', target: 'tmp/file.ts' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows test runs', () => {
    const result = evaluate(intent({ action: 'test.run' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows branch creation', () => {
    const result = evaluate(intent({ action: 'git.branch.create' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows deploy trigger', () => {
    const result = evaluate(intent({ action: 'deploy.trigger' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows infra apply', () => {
    const result = evaluate(intent({ action: 'infra.apply' }), policies);
    expect(result.allowed).toBe(true);
  });

  it('allows npm install', () => {
    const result = evaluate(intent({ action: 'npm.install' }), policies);
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cross-pack integration — extends usage
// ---------------------------------------------------------------------------

describe('policy packs — extends integration', () => {
  it('can be loaded as extends references from project root', () => {
    const projectRoot = resolve(__dirname, '../../..');
    const packPath = resolvePackPath('./policies/strict', projectRoot);
    expect(packPath).not.toBeNull();
    const pack = loadPackFile(packPath!);
    expect(pack).not.toBeNull();
    expect(pack!.id).toBe('strict-pack');
  });

  it('severity levels follow risk ordering', () => {
    const hipaa = loadPack('hipaa');
    const strict = loadPack('strict');
    const soc2 = loadPack('soc2');
    const enterprise = loadPack('enterprise');
    const engStandards = loadPack('engineering-standards');
    const ciSafe = loadPack('ci-safe');
    const openSource = loadPack('open-source');

    // Maximum safety tier (severity 5)
    expect(hipaa.severity).toBe(5);
    expect(strict.severity).toBe(5);

    // Compliance tier (severity 4)
    expect(soc2.severity).toBe(4);
    expect(enterprise.severity).toBe(4);

    // Standards tier (severity 3)
    expect(engStandards.severity).toBe(3);
    expect(ciSafe.severity).toBe(3);

    // Permissive tier (severity 2)
    expect(openSource.severity).toBe(2);

    // Cross-tier ordering
    expect(hipaa.severity).toBeGreaterThan(soc2.severity);
    expect(soc2.severity).toBeGreaterThan(engStandards.severity);
    expect(engStandards.severity).toBeGreaterThan(openSource.severity);
  });

  it.each(['soc2', 'hipaa', 'engineering-standards'])(
    'compliance pack %s can be loaded from project root',
    (name) => {
      const projectRoot = resolve(__dirname, '../../..');
      const packPath = resolvePackPath(`./policies/${name}`, projectRoot);
      expect(packPath).not.toBeNull();
      const pack = loadPackFile(packPath!);
      expect(pack).not.toBeNull();
      expect(pack!.id).toContain(name.replace('-', '-'));
    }
  );
});

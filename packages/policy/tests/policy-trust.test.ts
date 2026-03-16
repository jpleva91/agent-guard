// Tests for policy trust verification with risk analysis
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

// On Windows, tmpdir() is under homedir() (C:\Users\<user>\AppData\Local\Temp).
// To avoid tempDir paths being classified as 'implicitly_trusted' in tests,
// we mock node:os so that homedir() returns a distinct fake path.
vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return {
    ...original,
    homedir: () => '/fake-home',
  };
});

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'ag-policy-trust-'));
  vi.stubEnv('AGENTGUARD_HOME', tempDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// analyzePolicyRisk
// ---------------------------------------------------------------------------

describe('analyzePolicyRisk', () => {
  async function load() {
    return await import('../src/policy-trust.js');
  }

  it('flags allow: "*" as danger', async () => {
    const { analyzePolicyRisk } = await load();
    const flags = analyzePolicyRisk('rules:\n  - action: "*"\n    allow: "*"');
    const dangers = flags.filter((f) => f.level === 'danger');
    expect(dangers.length).toBeGreaterThan(0);
    expect(dangers[0].message).toBeTruthy();
  });

  it('flags disabled security invariants as danger', async () => {
    const { analyzePolicyRisk } = await load();
    const flags = analyzePolicyRisk(
      'invariants:\n  - secret_exposure: false\n    enabled: false',
    );
    const dangers = flags.filter((f) => f.level === 'danger');
    expect(dangers.length).toBeGreaterThan(0);
  });

  it('flags broad scope as warning', async () => {
    const { analyzePolicyRisk } = await load();
    const flags = analyzePolicyRisk('scope: "**"\nrules: []');
    const warnings = flags.filter((f) => f.level === 'warning');
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('returns empty for safe policy', async () => {
    const { analyzePolicyRisk } = await load();
    const flags = analyzePolicyRisk(
      'id: safe\nname: Safe Policy\nrules:\n  - action: file.write\n    effect: deny',
    );
    expect(flags).toHaveLength(0);
  });

  it('flags high lockdown threshold as warning', async () => {
    const { analyzePolicyRisk } = await load();
    const flags = analyzePolicyRisk('lockdownThreshold: 100\nrules: []');
    const warnings = flags.filter((f) => f.level === 'warning');
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('flags files: ["**"] as warning', async () => {
    const { analyzePolicyRisk } = await load();
    const flags = analyzePolicyRisk('files: ["**"]\nrules: []');
    const warnings = flags.filter((f) => f.level === 'warning');
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('includes pattern in each flag', async () => {
    const { analyzePolicyRisk } = await load();
    const flags = analyzePolicyRisk('allow: "*"\nrules: []');
    expect(flags.length).toBeGreaterThan(0);
    for (const flag of flags) {
      expect(flag.pattern).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// classifyPolicyLocation
// ---------------------------------------------------------------------------

describe('classifyPolicyLocation', () => {
  async function load() {
    return await import('../src/policy-trust.js');
  }

  it('classifies home dir as implicitly_trusted', async () => {
    const { classifyPolicyLocation } = await load();
    // homedir() is mocked to '/fake-home'
    const homePolicy = '/fake-home/.agentguard/policy.yaml';
    expect(classifyPolicyLocation(homePolicy)).toBe('implicitly_trusted');
  });

  it('classifies path with ~ as implicitly_trusted', async () => {
    const { classifyPolicyLocation } = await load();
    expect(classifyPolicyLocation('~/.agentguard/policy.yaml')).toBe('implicitly_trusted');
  });

  it('classifies path with $HOME as implicitly_trusted', async () => {
    const { classifyPolicyLocation } = await load();
    expect(classifyPolicyLocation('$HOME/.agentguard/policy.yaml')).toBe('implicitly_trusted');
  });

  it('classifies CLI flag as implicitly_trusted', async () => {
    const { classifyPolicyLocation } = await load();
    expect(classifyPolicyLocation('./agentguard.yaml', { isExplicitCliFlag: true })).toBe(
      'implicitly_trusted',
    );
  });

  it('classifies project-local as trust_gated', async () => {
    const { classifyPolicyLocation } = await load();
    expect(classifyPolicyLocation('./agentguard.yaml')).toBe('trust_gated');
    expect(classifyPolicyLocation('agentguard.yaml')).toBe('trust_gated');
    // tempDir paths are NOT under /fake-home so they are trust_gated
    expect(classifyPolicyLocation(join(tempDir, 'policy.yaml'))).toBe('trust_gated');
  });

  it('classifies real homedir path as implicitly_trusted', async () => {
    const { classifyPolicyLocation } = await load();
    // This uses the real homedir() from node:os before mocking
    // Since we mocked it to '/fake-home', paths starting with /fake-home are implicitly trusted
    expect(classifyPolicyLocation('/fake-home/policy.yaml')).toBe('implicitly_trusted');
  });
});

// ---------------------------------------------------------------------------
// verifyPolicyTrust
// ---------------------------------------------------------------------------

describe('verifyPolicyTrust', () => {
  async function load() {
    return await import('../src/policy-trust.js');
  }

  it('returns trusted for implicitly trusted locations', async () => {
    const { verifyPolicyTrust } = await load();
    const fp = join(tempDir, 'home-policy.yaml');
    writeFileSync(fp, 'id: home\nname: Home\nrules: []');
    // Use explicit CLI flag to make it implicitly trusted
    const result = await verifyPolicyTrust(fp, { isExplicitCliFlag: true });
    expect(result.trustClass).toBe('implicitly_trusted');
    expect(result.status).toBe('trusted');
  });

  it('delegates to trust store for trust-gated locations', async () => {
    const { verifyPolicyTrust } = await load();
    const { trustFile } = await import('@red-codes/core');
    // tempDir is not under /fake-home, so it's trust_gated
    const fp = join(tempDir, 'project-policy.yaml');
    writeFileSync(fp, 'id: project\nname: Project\nrules: []');
    await trustFile(fp);
    const result = await verifyPolicyTrust(fp);
    expect(result.trustClass).toBe('trust_gated');
    expect(result.status).toBe('trusted');
  });

  it('returns untrusted when trust store has no entry', async () => {
    const { verifyPolicyTrust } = await load();
    const fp = join(tempDir, 'unknown-policy.yaml');
    writeFileSync(fp, 'id: unknown\nname: Unknown\nrules: []');
    const result = await verifyPolicyTrust(fp);
    expect(result.trustClass).toBe('trust_gated');
    expect(result.status).toBe('untrusted');
  });

  it('detects content change via trust store', async () => {
    const { verifyPolicyTrust } = await load();
    const { trustFile } = await import('@red-codes/core');
    const fp = join(tempDir, 'changed-policy.yaml');
    writeFileSync(fp, 'id: original\nname: Original\nrules: []');
    await trustFile(fp);
    // Modify the file
    writeFileSync(fp, 'id: changed\nname: Changed\nrules: []\nallow: "*"');
    const result = await verifyPolicyTrust(fp);
    expect(result.trustClass).toBe('trust_gated');
    expect(result.status).toBe('content_changed');
  });

  it('trusts when CI override is active', async () => {
    vi.stubEnv('AGENTGUARD_TRUST_PROJECT_POLICY', '1');
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    const { verifyPolicyTrust } = await load();
    const fp = join(tempDir, 'ci-policy.yaml');
    writeFileSync(fp, 'id: ci\nname: CI\nrules: []');
    // This file is NOT in the trust store, but CI override should make it trusted
    const result = await verifyPolicyTrust(fp);
    expect(result.status).toBe('trusted');
  });

  it('includes risk flags in result', async () => {
    const { verifyPolicyTrust } = await load();
    const { trustFile } = await import('@red-codes/core');
    const fp = join(tempDir, 'risky-policy.yaml');
    writeFileSync(fp, 'allow: "*"\nrules: []');
    await trustFile(fp);
    const result = await verifyPolicyTrust(fp);
    expect(result.riskFlags.length).toBeGreaterThan(0);
  });

  it('returns risk flags even for implicitly trusted locations', async () => {
    const { verifyPolicyTrust } = await load();
    const fp = join(tempDir, 'risky-home-policy.yaml');
    writeFileSync(fp, 'allow: "*"\nrules: []');
    const result = await verifyPolicyTrust(fp, { isExplicitCliFlag: true });
    expect(result.status).toBe('trusted');
    expect(result.riskFlags.length).toBeGreaterThan(0);
  });
});

// Ensure the real homedir from the import at the top is used in assertions
// (not the mocked one — this is just for documentation purposes)
const _realHomedir = homedir;
export { _realHomedir };

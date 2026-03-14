import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyPolicyFix, loadPolicyFromFile } from '../src/commands/policy-verify.js';

describe('Policy fix verification', () => {
  let tmpDir: string;
  let eventsDir: string;
  let policyPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ag-verify-'));
    eventsDir = join(tmpDir, 'events');
    mkdirSync(eventsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writePolicy(rules: Array<Record<string, unknown>>): string {
    const policy = {
      id: 'test-policy',
      name: 'Test Policy',
      severity: 3,
      rules,
    };
    policyPath = join(tmpDir, 'test-policy.json');
    writeFileSync(policyPath, JSON.stringify(policy));
    return policyPath;
  }

  function writeYamlPolicy(yaml: string): string {
    policyPath = join(tmpDir, 'test-policy.yaml');
    writeFileSync(policyPath, yaml);
    return policyPath;
  }

  function writeSessionEvents(sessionId: string, events: Array<Record<string, unknown>>): void {
    const lines = events.map((e) => JSON.stringify(e)).join('\n');
    writeFileSync(join(eventsDir, `${sessionId}.jsonl`), lines);
  }

  // ── No violations ────────────────────────────────────────────────────

  it('returns zero counts when no sessions exist', () => {
    const path = writePolicy([{ action: '*', effect: 'allow' }]);
    const result = verifyPolicyFix(path, tmpDir);

    expect(result.sessionsAnalyzed).toBe(0);
    expect(result.totalViolations).toBe(0);
    expect(result.resolvedCount).toBe(0);
    expect(result.remainingCount).toBe(0);
    expect(result.regressionCount).toBe(0);
  });

  it('returns zero violations when sessions have no violation events', () => {
    writeSessionEvents('session-1', [
      {
        id: 'evt-1',
        kind: 'ActionExecuted',
        timestamp: 1000,
        fingerprint: 'fp1',
        actionType: 'file.read',
        target: 'src/index.ts',
      },
    ]);

    const path = writePolicy([{ action: '*', effect: 'allow' }]);
    const result = verifyPolicyFix(path, tmpDir);

    expect(result.sessionsAnalyzed).toBe(1);
    expect(result.totalViolations).toBe(0);
  });

  // ── Resolved violations ──────────────────────────────────────────────

  it('detects resolved violations when new policy allows previously denied actions', () => {
    writeSessionEvents('session-1', [
      {
        id: 'evt-1',
        kind: 'PolicyDenied',
        timestamp: 1000,
        fingerprint: 'fp1',
        actionType: 'git.push',
        target: 'origin/main',
        reason: 'Denied by old policy',
      },
    ]);

    // New policy allows git.push
    const path = writePolicy([{ action: 'git.push', effect: 'allow' }]);
    const result = verifyPolicyFix(path, tmpDir);

    expect(result.totalViolations).toBe(1);
    expect(result.resolvedCount).toBe(1);
    expect(result.remainingCount).toBe(0);
    expect(result.resolved[0].actionType).toBe('git.push');
    expect(result.resolved[0].newDecision).toBe('allow');
  });

  // ── Remaining violations ─────────────────────────────────────────────

  it('detects remaining violations when new policy still denies', () => {
    writeSessionEvents('session-1', [
      {
        id: 'evt-1',
        kind: 'ActionDenied',
        timestamp: 1000,
        fingerprint: 'fp1',
        actionType: 'git.force-push',
        target: 'origin/main',
        reason: 'Force push blocked',
      },
    ]);

    // New policy also denies force push
    const path = writePolicy([
      { action: 'git.force-push', effect: 'deny', reason: 'Still blocked' },
    ]);
    const result = verifyPolicyFix(path, tmpDir);

    expect(result.totalViolations).toBe(1);
    expect(result.resolvedCount).toBe(0);
    expect(result.remainingCount).toBe(1);
    expect(result.remaining[0].actionType).toBe('git.force-push');
    expect(result.remaining[0].newDecision).toBe('deny');
  });

  // ── Regressions ──────────────────────────────────────────────────────

  it('detects regressions when new policy denies previously allowed actions', () => {
    writeSessionEvents('session-1', [
      {
        id: 'evt-1',
        kind: 'ActionAllowed',
        timestamp: 1000,
        fingerprint: 'fp1',
        actionType: 'file.write',
        target: 'src/app.ts',
      },
    ]);

    // New policy denies file.write
    const path = writePolicy([
      { action: 'file.write', effect: 'deny', reason: 'No file writes allowed' },
    ]);
    const result = verifyPolicyFix(path, tmpDir);

    expect(result.regressionCount).toBe(1);
    expect(result.regressions[0].actionType).toBe('file.write');
    expect(result.regressions[0].target).toBe('src/app.ts');
  });

  it('detects regressions from ActionExecuted events', () => {
    writeSessionEvents('session-1', [
      {
        id: 'evt-1',
        kind: 'ActionExecuted',
        timestamp: 1000,
        fingerprint: 'fp1',
        actionType: 'shell.exec',
        target: 'npm test',
      },
    ]);

    const path = writePolicy([
      { action: 'shell.exec', effect: 'deny', reason: 'Shell execution blocked' },
    ]);
    const result = verifyPolicyFix(path, tmpDir);

    expect(result.regressionCount).toBe(1);
    expect(result.regressions[0].actionType).toBe('shell.exec');
  });

  // ── Mixed scenarios ──────────────────────────────────────────────────

  it('handles mixed resolved, remaining, and regression events', () => {
    writeSessionEvents('session-1', [
      // Violation that will be resolved
      {
        id: 'evt-1',
        kind: 'PolicyDenied',
        timestamp: 1000,
        fingerprint: 'fp1',
        actionType: 'git.push',
        target: 'origin/dev',
        reason: 'Push denied',
      },
      // Violation that will remain
      {
        id: 'evt-2',
        kind: 'ActionDenied',
        timestamp: 1001,
        fingerprint: 'fp2',
        actionType: 'git.force-push',
        target: 'origin/main',
        reason: 'Force push blocked',
      },
      // Allowed action that will regress
      {
        id: 'evt-3',
        kind: 'ActionAllowed',
        timestamp: 1002,
        fingerprint: 'fp3',
        actionType: 'file.delete',
        target: 'tmp/cache.json',
      },
    ]);

    const path = writePolicy([
      { action: 'git.force-push', effect: 'deny', reason: 'Force push forbidden' },
      { action: 'file.delete', effect: 'deny', reason: 'No deletes allowed' },
      { action: '*', effect: 'allow' },
    ]);

    const result = verifyPolicyFix(path, tmpDir);

    expect(result.totalViolations).toBe(2);
    expect(result.resolvedCount).toBe(1);
    expect(result.remainingCount).toBe(1);
    expect(result.regressionCount).toBe(1);

    expect(result.resolved[0].actionType).toBe('git.push');
    expect(result.remaining[0].actionType).toBe('git.force-push');
    expect(result.regressions[0].actionType).toBe('file.delete');
  });

  // ── Multiple sessions ────────────────────────────────────────────────

  it('aggregates violations across multiple sessions', () => {
    writeSessionEvents('session-1', [
      {
        id: 'evt-1',
        kind: 'PolicyDenied',
        timestamp: 1000,
        fingerprint: 'fp1',
        actionType: 'git.push',
        target: 'origin/main',
        reason: 'Push denied',
      },
    ]);

    writeSessionEvents('session-2', [
      {
        id: 'evt-2',
        kind: 'PolicyDenied',
        timestamp: 2000,
        fingerprint: 'fp2',
        actionType: 'git.push',
        target: 'origin/staging',
        reason: 'Push denied',
      },
    ]);

    const path = writePolicy([{ action: 'git.push', effect: 'allow' }]);
    const result = verifyPolicyFix(path, tmpDir);

    expect(result.sessionsAnalyzed).toBe(2);
    expect(result.totalViolations).toBe(2);
    expect(result.resolvedCount).toBe(2);
  });

  // ── Events without actionType ────────────────────────────────────────

  it('skips violation events without reconstructable intent', () => {
    writeSessionEvents('session-1', [
      {
        id: 'evt-1',
        kind: 'PolicyDenied',
        timestamp: 1000,
        fingerprint: 'fp1',
        // No actionType, action, or syscall — cannot reconstruct
        target: 'something',
        reason: 'Unknown',
      },
    ]);

    const path = writePolicy([{ action: '*', effect: 'allow' }]);
    const result = verifyPolicyFix(path, tmpDir);

    // Violation is counted but not classified as resolved or remaining
    expect(result.totalViolations).toBe(1);
    expect(result.resolvedCount).toBe(0);
    expect(result.remainingCount).toBe(0);
  });

  // ── YAML policy loading ──────────────────────────────────────────────

  it('works with YAML policy files', () => {
    writeSessionEvents('session-1', [
      {
        id: 'evt-1',
        kind: 'PolicyDenied',
        timestamp: 1000,
        fingerprint: 'fp1',
        actionType: 'git.push',
        target: 'origin/main',
        reason: 'Push denied',
      },
    ]);

    const yaml = `id: yaml-test
name: YAML Test Policy
severity: 3
rules:
  - action: git.push
    effect: allow
    reason: Allow pushes
`;
    const path = writeYamlPolicy(yaml);
    const result = verifyPolicyFix(path, tmpDir);

    expect(result.totalViolations).toBe(1);
    expect(result.resolvedCount).toBe(1);
  });

  // ── No regressions with permissive policy ────────────────────────────

  it('reports no regressions for fully permissive policy', () => {
    writeSessionEvents('session-1', [
      {
        id: 'evt-1',
        kind: 'ActionAllowed',
        timestamp: 1000,
        fingerprint: 'fp1',
        actionType: 'file.write',
        target: 'src/index.ts',
      },
      {
        id: 'evt-2',
        kind: 'ActionExecuted',
        timestamp: 1001,
        fingerprint: 'fp2',
        actionType: 'shell.exec',
        target: 'npm test',
      },
    ]);

    const path = writePolicy([{ action: '*', effect: 'allow' }]);
    const result = verifyPolicyFix(path, tmpDir);

    expect(result.regressionCount).toBe(0);
  });
});

describe('loadPolicyFromFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ag-load-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads a JSON policy file', () => {
    const policy = {
      id: 'test',
      name: 'Test',
      severity: 3,
      rules: [{ action: '*', effect: 'allow' }],
    };
    const path = join(tmpDir, 'policy.json');
    writeFileSync(path, JSON.stringify(policy));

    const policies = loadPolicyFromFile(path);
    expect(policies).toHaveLength(1);
    expect(policies[0].id).toBe('test');
  });

  it('loads a YAML policy file', () => {
    const yaml = `id: yaml-test
name: YAML Test
severity: 2
rules:
  - action: git.push
    effect: deny
    reason: No pushes
`;
    const path = join(tmpDir, 'policy.yaml');
    writeFileSync(path, yaml);

    const policies = loadPolicyFromFile(path);
    expect(policies).toHaveLength(1);
    expect(policies[0].id).toBe('yaml-test');
    expect(policies[0].rules).toHaveLength(1);
    expect(policies[0].rules[0].effect).toBe('deny');
  });

  it('throws for invalid JSON policy', () => {
    const path = join(tmpDir, 'bad.json');
    writeFileSync(path, '{"invalid": true}');

    expect(() => loadPolicyFromFile(path)).toThrow();
  });
});

import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolveConfig } from '../src/config.js';
import { registerGovernanceTools } from '../src/tools/governance.js';
import { checkAllInvariants, buildSystemState, DEFAULT_INVARIANTS } from '@red-codes/invariants';
import { normalizeIntent, createKernel } from '@red-codes/kernel';
import { evaluate } from '@red-codes/policy';
import type { LoadedPolicy } from '@red-codes/policy';

function createTestServer() {
  const config = resolveConfig();
  const server = new McpServer({ name: 'test', version: '0.0.1' }, { capabilities: { tools: {} } });
  registerGovernanceTools(server, config);
  return server;
}

describe('Governance tools registration', () => {
  it('registers all governance tools', () => {
    const server = createTestServer();
    expect(server).toBeDefined();
  });
});

describe('check_invariants via kernel', () => {
  it('detects force push violation', () => {
    const state = buildSystemState({
      forcePush: true,
      isPush: true,
      targetBranch: 'main',
    });
    const result = checkAllInvariants(DEFAULT_INVARIANTS, state);
    expect(result.allHold).toBe(false);
    const forcePushViolation = result.violations.find((v) => v.invariant.id === 'no-force-push');
    expect(forcePushViolation).toBeDefined();
  });

  it('passes with safe state', () => {
    const state = buildSystemState({
      modifiedFiles: ['src/foo.ts'],
      targetBranch: 'feature',
      filesAffected: 1,
    });
    const result = checkAllInvariants(DEFAULT_INVARIANTS, state);
    expect(result.allHold).toBe(true);
  });
});

describe('evaluate_policy via kernel', () => {
  it('evaluates action against policy', () => {
    const policies: LoadedPolicy[] = [
      {
        id: 'test-deny-push',
        name: 'No Push',
        rules: [{ action: 'git.push', effect: 'deny' as const, reason: 'No pushing allowed' }],
        severity: 5,
      },
    ];

    const intent = normalizeIntent({ tool: 'Bash', command: 'git push origin main' });
    const result = evaluate(intent, policies);
    expect(result.allowed).toBe(false);
    expect(result.decision).toBe('deny');
  });

  it('allows action with explicit allow rule', () => {
    const policies: LoadedPolicy[] = [
      {
        id: 'test-mixed',
        name: 'Mixed',
        rules: [
          { action: 'git.push', effect: 'deny' as const, reason: 'No pushing' },
          { action: 'file.read', effect: 'allow' as const, reason: 'Reads OK' },
        ],
        severity: 5,
      },
    ];

    const intent = normalizeIntent({ tool: 'Read', file: 'README.md' });
    const result = evaluate(intent, policies);
    expect(result.allowed).toBe(true);
  });
});

describe('propose_action via kernel', () => {
  it('proposes and evaluates an action', async () => {
    const kernel = createKernel({
      policyDefs: [
        {
          id: 'test',
          name: 'Test',
          rules: [{ action: 'git.push', effect: 'deny', reason: 'No push' }],
          severity: 5,
        },
      ],
      invariants: DEFAULT_INVARIANTS,
      dryRun: true,
    });

    const result = await kernel.propose({
      tool: 'Bash',
      command: 'git push origin main',
    });

    expect(result.allowed).toBe(false);
    expect(result.executed).toBe(false);
    kernel.shutdown();
  });
});

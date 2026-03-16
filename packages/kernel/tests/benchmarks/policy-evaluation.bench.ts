// Benchmark: Policy evaluation latency per action type.
// Measures p50/p95/p99 for the policy evaluator across canonical action types.

import { bench, describe } from 'vitest';
import { evaluate } from '@red-codes/policy';
import type { LoadedPolicy, NormalizedIntent } from '@red-codes/policy';

const samplePolicy: LoadedPolicy = {
  id: 'bench-policy',
  name: 'Benchmark Policy',
  description: 'Policy with mixed deny/allow rules for benchmarking',
  severity: 3,
  rules: [
    {
      action: 'git.push',
      effect: 'deny',
      conditions: { branches: ['main', 'master'] },
      reason: 'No push to protected branches',
    },
    {
      action: 'file.delete',
      effect: 'deny',
      conditions: { scope: ['packages/kernel/'] },
      reason: 'No kernel deletions',
    },
    { action: 'infra.destroy', effect: 'deny', reason: 'No infra destroy' },
    {
      action: 'deploy.trigger',
      effect: 'deny',
      conditions: { requireTests: true },
      // Note: requireTests gate means this deny fires when testsPass is not true
      // in intent.metadata. Since bench intents don't set testsPass, this always denies.
      reason: 'Tests required before deploy',
    },
    { action: 'file.*', effect: 'allow', conditions: { scope: ['src/', 'tests/'] } },
    { action: 'test.*', effect: 'allow' },
    { action: 'git.*', effect: 'allow' },
    { action: 'shell.exec', effect: 'allow' },
    { action: 'npm.*', effect: 'allow' },
    { action: '*', effect: 'allow', reason: 'Default allow' },
  ],
};

const multiPolicies: LoadedPolicy[] = [
  samplePolicy,
  {
    id: 'strict-policy',
    name: 'Strict Override',
    severity: 5,
    rules: [
      { action: 'npm.publish', effect: 'deny', reason: 'No publishing' },
      { action: 'http.request', effect: 'deny', reason: 'No HTTP in CI' },
      { action: 'infra.*', effect: 'deny', reason: 'No infra changes' },
    ],
  },
];

function makeIntent(action: string, target: string = 'src/index.ts'): NormalizedIntent {
  return {
    action,
    target,
    agent: 'bench-agent',
    branch: 'feature/bench',
    destructive: false,
  };
}

describe('Policy evaluation — single policy', () => {
  bench('file.write (allowed)', () => {
    evaluate(makeIntent('file.write', 'src/foo.ts'), [samplePolicy]);
  });

  bench('file.read (allowed)', () => {
    evaluate(makeIntent('file.read', 'src/bar.ts'), [samplePolicy]);
  });

  bench('git.push (denied — branch match)', () => {
    evaluate({ ...makeIntent('git.push'), branch: 'main' }, [samplePolicy]);
  });

  bench('shell.exec (allowed)', () => {
    evaluate(makeIntent('shell.exec', 'npm test'), [samplePolicy]);
  });

  bench('test.run (allowed)', () => {
    evaluate(makeIntent('test.run'), [samplePolicy]);
  });

  bench('infra.destroy (denied)', () => {
    evaluate(makeIntent('infra.destroy', 'prod-cluster'), [samplePolicy]);
  });

  bench('deploy.trigger (denied)', () => {
    evaluate(makeIntent('deploy.trigger', 'production'), [samplePolicy]);
  });

  bench('unknown action (default allow)', () => {
    evaluate(makeIntent('custom.unknown'), [samplePolicy]);
  });
});

describe('Policy evaluation — multiple policies', () => {
  bench('file.write (2 policies)', () => {
    evaluate(makeIntent('file.write', 'src/foo.ts'), multiPolicies);
  });

  bench('npm.publish (denied by strict)', () => {
    evaluate(makeIntent('npm.publish'), multiPolicies);
  });

  bench('http.request (denied by strict)', () => {
    evaluate(makeIntent('http.request', 'https://api.example.com'), multiPolicies);
  });

  bench('git.commit (2 policies, allowed)', () => {
    evaluate(makeIntent('git.commit'), multiPolicies);
  });
});

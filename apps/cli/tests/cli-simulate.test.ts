// Tests for CLI simulate command — standalone impact analysis
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock child_process to avoid real npm dry-run calls in package simulator
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(() => 'added 1 package in 0.5s\n+ express@4.21.0\n'),
}));

// Static import — vi.mock() is hoisted by vitest, so the mock is applied before
// this import resolves. This avoids per-test dynamic import() overhead that caused
// flaky CI timeouts (issue #590) when cold-loading the entire dependency tree
// (@red-codes/kernel, policy, invariants, core) inside the test timeout window.
import { simulate } from '../src/commands/simulate.js';

// Mock process.exit, stderr, stdout to capture output
const _mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
const stderrChunks: string[] = [];
const stdoutChunks: string[] = [];
const _mockStderr = vi
  .spyOn(process.stderr, 'write')
  .mockImplementation((chunk: string | Uint8Array) => {
    stderrChunks.push(chunk.toString());
    return true;
  });
const _mockStdout = vi
  .spyOn(process.stdout, 'write')
  .mockImplementation((chunk: string | Uint8Array) => {
    stdoutChunks.push(chunk.toString());
    return true;
  });

beforeEach(() => {
  vi.clearAllMocks();
  stderrChunks.length = 0;
  stdoutChunks.length = 0;
});

describe('simulate command', () => {
  it('simulates a file.write action via structured flags', async () => {
    const code = await simulate(['--action', 'file.write', '--target', 'src/index.ts']);
    expect(code).toBe(0);
    const output = stderrChunks.join('');
    expect(output).toContain('filesystem-simulator');
    expect(output).toContain('Write: src/index.ts');
  });

  it('simulates a sensitive file write as high risk', async () => {
    const code = await simulate(['--action', 'file.write', '--target', '.env']);
    expect(code).toBe(0);
    const output = stderrChunks.join('');
    expect(output).toContain('HIGH');
    expect(output).toContain('Sensitive file');
  });

  it('simulates a file.delete action', async () => {
    const code = await simulate(['--action', 'file.delete', '--target', 'package-lock.json']);
    expect(code).toBe(0);
    const output = stderrChunks.join('');
    expect(output).toContain('Delete: package-lock.json');
    expect(output).toContain('Lockfile');
  });

  it('outputs JSON when --json flag is set', async () => {
    const code = await simulate(['--action', 'file.write', '--target', 'readme.md', '--json']);
    expect(code).toBe(0);
    const output = stdoutChunks.join('');
    const result = JSON.parse(output.trim());
    expect(result.simulatorId).toBe('filesystem-simulator');
    expect(result.riskLevel).toBe('low');
    expect(result.blastRadius).toBeTypeOf('number');
    expect(result.predictedChanges).toBeInstanceOf(Array);
    expect(result.durationMs).toBeTypeOf('number');
  });

  it('accepts JSON action descriptor as positional argument', async () => {
    const json = JSON.stringify({ tool: 'Write', file: '.env.production' });
    const code = await simulate([json]);
    expect(code).toBe(0);
    const output = stderrChunks.join('');
    expect(output).toContain('HIGH');
  });

  it('returns error for unsupported action type', async () => {
    const code = await simulate(['--action', 'http.request', '--target', 'https://example.com']);
    expect(code).toBe(1);
    const output = stderrChunks.join('');
    expect(output).toContain('No simulator available');
  });

  it('returns error when no action is provided', async () => {
    const code = await simulate([]);
    expect(code).toBe(1);
    const output = stderrChunks.join('');
    expect(output).toContain('No action provided');
  });

  it('returns JSON error when no action provided with --json', async () => {
    const code = await simulate(['--json']);
    expect(code).toBe(1);
    const output = stdoutChunks.join('');
    const result = JSON.parse(output.trim());
    expect(result.error).toBe('No action provided');
  });

  it('validates unknown action types with --action flag', async () => {
    const code = await simulate(['--action', 'not.a.real.action', '--target', 'foo']);
    expect(code).toBe(1);
    const output = stderrChunks.join('');
    expect(output).toContain('Unknown action type');
  });

  it('simulates npm install via shell.exec command', async () => {
    const json = JSON.stringify({ tool: 'Bash', command: 'npm install express' });
    const code = await simulate([json, '--json']);
    expect(code).toBe(0);
    const output = stdoutChunks.join('');
    const result = JSON.parse(output.trim());
    expect(result.simulatorId).toBe('package-simulator');
  });

  it('passes json option from SimulateOptions', async () => {
    const code = await simulate(['--action', 'file.write', '--target', 'src/a.ts'], {
      json: true,
    });
    expect(code).toBe(0);
    const output = stdoutChunks.join('');
    const result = JSON.parse(output.trim());
    expect(result.simulatorId).toBe('filesystem-simulator');
  });
});

describe('simulate with --policy flag', () => {
  const testDir = join(tmpdir(), 'agentguard-simulate-test-' + Date.now());

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('returns exit code 2 when policy denies the action', async () => {
    const policyFile = join(testDir, 'deny-env.yaml');
    writeFileSync(
      policyFile,
      `id: test-deny
name: Test Deny Policy
severity: 4
rules:
  - action: file.write
    effect: deny
    target: .env
    reason: Secrets files must not be modified
`
    );

    const code = await simulate(
      ['--action', 'file.write', '--target', '.env', '--policy', policyFile],
      {}
    );
    expect(code).toBe(2);
    const output = stderrChunks.join('');
    expect(output).toContain('DENY');
    expect(output).toContain('Secrets files');
    expect(output).toContain('DENIED');
  });

  it('returns exit code 0 when policy allows the action', async () => {
    const policyFile = join(testDir, 'allow-all.yaml');
    writeFileSync(
      policyFile,
      `id: test-allow
name: Test Allow Policy
severity: 1
rules:
  - action: file.write
    effect: allow
    reason: All writes allowed
`
    );

    const code = await simulate(
      ['--action', 'file.write', '--target', 'src/index.ts', '--policy', policyFile],
      {}
    );
    expect(code).toBe(0);
    const output = stderrChunks.join('');
    expect(output).toContain('ALLOW');
    expect(output).toContain('ALLOWED');
  });

  it('returns exit code 3 when invariants are violated', async () => {
    const policyFile = join(testDir, 'allow-push.yaml');
    writeFileSync(
      policyFile,
      `id: test-allow-push
name: Test Allow Push Policy
severity: 1
rules:
  - action: git.push
    effect: allow
    reason: Push allowed for testing
`
    );

    // git.push to main triggers the protected-branch invariant (directPush to protected branch)
    const code = await simulate(
      ['--action', 'git.push', '--branch', 'main', '--policy', policyFile],
      {}
    );
    expect(code).toBe(3);
    const output = stderrChunks.join('');
    expect(output).toContain('FAIL');
    expect(output).toContain('Protected Branch');
  });

  it('includes governance data in JSON output with --policy', async () => {
    const policyFile = join(testDir, 'deny-json.yaml');
    writeFileSync(
      policyFile,
      `id: test-deny-json
name: Test Deny JSON Policy
severity: 3
rules:
  - action: file.write
    effect: deny
    target: .env
    reason: Env files blocked
`
    );

    const code = await simulate(
      ['--action', 'file.write', '--target', '.env', '--json', '--policy', policyFile],
      {}
    );
    expect(code).toBe(2);
    const output = stdoutChunks.join('');
    const result = JSON.parse(output.trim());
    expect(result.governance).toBeDefined();
    expect(result.governance.allowed).toBe(false);
    expect(result.governance.policy.decision).toBe('deny');
    expect(result.governance.policy.reason).toContain('Env files blocked');
  });

  it('shows governance allowed in JSON output when policy allows', async () => {
    const policyFile = join(testDir, 'allow-json.yaml');
    writeFileSync(
      policyFile,
      `id: test-allow-json
name: Test Allow JSON Policy
severity: 1
rules:
  - action: file.write
    effect: allow
    reason: Writes allowed
`
    );

    const code = await simulate(
      ['--action', 'file.write', '--target', 'src/foo.ts', '--json', '--policy', policyFile],
      {}
    );
    expect(code).toBe(0);
    const output = stdoutChunks.join('');
    const result = JSON.parse(output.trim());
    expect(result.governance).toBeDefined();
    expect(result.governance.allowed).toBe(true);
    expect(result.governance.invariantViolations).toEqual([]);
  });

  it('passes policy option from SimulateOptions', async () => {
    const policyFile = join(testDir, 'opts-policy.yaml');
    writeFileSync(
      policyFile,
      `id: opts-test
name: Options Test Policy
severity: 3
rules:
  - action: file.write
    effect: deny
    target: .env
    reason: Blocked via options
`
    );

    const code = await simulate(['--action', 'file.write', '--target', '.env', '--json'], {
      policy: policyFile,
    });
    expect(code).toBe(2);
    const output = stdoutChunks.join('');
    const result = JSON.parse(output.trim());
    expect(result.governance.policy.reason).toContain('Blocked via options');
  });

  it('policy denial takes priority over invariant violation in exit code', async () => {
    const policyFile = join(testDir, 'deny-priority.yaml');
    writeFileSync(
      policyFile,
      `id: test-deny-priority
name: Test Deny Priority Policy
severity: 4
rules:
  - action: git.push
    effect: deny
    branches: [main]
    reason: Push to main denied by policy
`
    );

    // Both policy deny (push to main) AND invariant violation (direct push to protected branch)
    const code = await simulate(
      ['--action', 'git.push', '--branch', 'main', '--policy', policyFile],
      {}
    );
    // Policy denial (exit 2) takes priority over invariant violation (exit 3)
    expect(code).toBe(2);
  });

  it('does not include governance output when --policy is not provided', async () => {
    const code = await simulate(['--action', 'file.write', '--target', '.env', '--json']);
    expect(code).toBe(0);
    const output = stdoutChunks.join('');
    const result = JSON.parse(output.trim());
    expect(result.governance).toBeUndefined();
  });

  describe('plan simulation (--plan flag)', () => {
    const planDir = join(tmpdir(), 'agentguard-plan-test-' + Date.now());

    beforeEach(() => {
      mkdirSync(planDir, { recursive: true });
    });

    afterAll(() => {
      try {
        rmSync(planDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    });

    it('simulates a plan file with multiple actions', async () => {
      const planFile = join(planDir, 'plan.json');
      writeFileSync(
        planFile,
        JSON.stringify([
          { tool: 'Write', file: 'src/config.ts', label: 'Write config' },
          { tool: 'Write', file: 'src/utils.ts', label: 'Write utils' },
        ])
      );

        const code = await simulate([], { plan: planFile });
      expect(code).toBe(0);
      const output = stderrChunks.join('');
      expect(output).toContain('Plan Simulation Result');
      expect(output).toContain('Write config');
      expect(output).toContain('Write utils');
    });

    it('outputs plan simulation as JSON', async () => {
      const planFile = join(planDir, 'plan-json.json');
      writeFileSync(
        planFile,
        JSON.stringify([
          { tool: 'Write', file: 'src/a.ts', label: 'Step A' },
          { tool: 'Write', file: 'src/b.ts', label: 'Step B' },
        ])
      );

        const code = await simulate(['--json'], { plan: planFile });
      expect(code).toBe(0);
      const output = stdoutChunks.join('');
      const result = JSON.parse(output.trim());
      expect(result.steps).toHaveLength(2);
      expect(result.compositeForecast).toBeDefined();
      expect(result.compositeForecast.totalSteps).toBe(2);
      expect(result.interactions).toBeInstanceOf(Array);
      expect(result.durationMs).toBeTypeOf('number');
    });

    it('returns error for invalid plan file', async () => {
      const planFile = join(planDir, 'bad-plan.json');
      writeFileSync(planFile, '{ not valid json }');

        const code = await simulate([], { plan: planFile });
      expect(code).toBe(1);
      const output = stderrChunks.join('');
      expect(output).toContain('Failed to load plan');
    });

    it('returns error for empty plan array', async () => {
      const planFile = join(planDir, 'empty-plan.json');
      writeFileSync(planFile, '[]');

        const code = await simulate([], { plan: planFile });
      expect(code).toBe(1);
      const output = stderrChunks.join('');
      expect(output).toContain('non-empty JSON array');
    });

    it('returns error for missing plan file', async () => {
        const code = await simulate([], { plan: '/nonexistent/plan.json' });
      expect(code).toBe(1);
      const output = stderrChunks.join('');
      expect(output).toContain('Failed to load plan');
    });

    it('evaluates governance for each plan step with --policy', async () => {
      const planFile = join(planDir, 'gov-plan.json');
      writeFileSync(
        planFile,
        JSON.stringify([
          { tool: 'Write', file: '.env', label: 'Write secrets' },
          { tool: 'Write', file: 'src/safe.ts', label: 'Write safe file' },
        ])
      );

      const policyFile = join(planDir, 'deny-env-plan.yaml');
      writeFileSync(
        policyFile,
        `id: plan-deny
name: Plan Deny Policy
severity: 4
rules:
  - action: file.write
    effect: deny
    target: .env
    reason: Env files blocked in plan
`
      );

        const code = await simulate(['--json'], { plan: planFile, policy: policyFile });
      expect(code).toBe(2); // policy denial
      const output = stdoutChunks.join('');
      const result = JSON.parse(output.trim());
      expect(result.governance).toBeDefined();
      expect(result.governance.allowed).toBe(false);
    });
  });

  describe('readStdin', () => {
    let origIsTTY: boolean | undefined;

    beforeEach(() => {
      origIsTTY = process.stdin.isTTY;
    });

    afterEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.stdin as any).isTTY = origIsTTY;
    });

    it('reads valid JSON from non-TTY stdin and runs simulation', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.stdin as any).isTTY = undefined;

      // Use file.write so the filesystem simulator can handle it
      const payload = JSON.stringify({ tool: 'Write', file: 'src/index.ts' });
      setImmediate(() => {
        process.stdin.emit('data', Buffer.from(payload));
        process.stdin.emit('end');
      });

        const code = await simulate([]);

      expect(code).toBe(0);
      expect(stderrChunks.join('')).toContain('filesystem-simulator');
    });

    it('returns error code 1 for invalid JSON on stdin', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.stdin as any).isTTY = undefined;

      setImmediate(() => {
        process.stdin.emit('data', Buffer.from('{ not valid json'));
        process.stdin.emit('end');
      });

        const code = await simulate([]);

      expect(code).toBe(1);
      expect(stderrChunks.join('')).toContain('Invalid JSON on stdin');
    });

    it('resolves null on stdin error event and shows No action provided', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.stdin as any).isTTY = undefined;

      setImmediate(() => {
        process.stdin.emit('error', new Error('stdin error'));
      });

        const code = await simulate([]);

      expect(code).toBe(1);
      expect(stderrChunks.join('')).toContain('No action provided');
    });
  });
});

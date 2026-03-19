import { describe, it, expect } from 'vitest';
import { CommandScanner } from '../src/command-scanner.js';
import { PathMatcher } from '../src/path-matcher.js';

// Import the actual governance data to benchmark with real pattern counts
import { DESTRUCTIVE_PATTERNS_DATA, GIT_ACTION_PATTERNS_DATA } from '@red-codes/core';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeUs(fn: () => void, iterations: number): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const elapsed = performance.now() - start;
  return (elapsed / iterations) * 1000; // microseconds per call
}

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const scanner = CommandScanner.create(DESTRUCTIVE_PATTERNS_DATA, GIT_ACTION_PATTERNS_DATA);

const pathMatcher = PathMatcher.create([
  { glob: '**/.env*', id: 'env-file', description: 'Environment file' },
  { glob: '**/credentials*', id: 'credentials', description: 'Credentials file' },
  { glob: '**/*.key', id: 'key-file', description: 'Private key file' },
  { glob: '**/.ssh/**', id: 'ssh-dir', description: 'SSH directory' },
  { glob: '.github/workflows/**', id: 'gh-workflows', description: 'GitHub workflows' },
]);

// ─── Benchmarks ───────────────────────────────────────────────────────────────

describe('Performance benchmarks', () => {
  it('CommandScanner.scanDestructive — safe command (1000 iterations)', () => {
    const ITERATIONS = 1000;
    const usPerCall = timeUs(() => {
      scanner.scanDestructive('ls -la /home/user/documents');
    }, ITERATIONS);

    const msPerCall = usPerCall / 1000;
    console.log(
      `  CommandScanner.scanDestructive (safe): ${usPerCall.toFixed(1)} µs/call (${ITERATIONS} iterations)`
    );

    // Generous threshold for CI runners (local: ~1ms, GitHub Actions: ~3-6ms)
    expect(msPerCall).toBeLessThan(10);
  });

  it('CommandScanner.scanDestructive — destructive command (1000 iterations)', () => {
    const ITERATIONS = 1000;
    const usPerCall = timeUs(() => {
      scanner.scanDestructive('sudo rm -rf /var/log');
    }, ITERATIONS);

    const msPerCall = usPerCall / 1000;
    console.log(
      `  CommandScanner.scanDestructive (destructive): ${usPerCall.toFixed(1)} µs/call (${ITERATIONS} iterations)`
    );

    // Generous threshold for CI runners (local: ~1ms, GitHub Actions: ~3-6ms)
    expect(msPerCall).toBeLessThan(10);
  });

  it('PathMatcher.match — non-matching path (10000 iterations)', () => {
    const ITERATIONS = 10000;
    const usPerCall = timeUs(() => {
      pathMatcher.match('src/components/Button.tsx');
    }, ITERATIONS);

    const msPerCall = usPerCall / 1000;
    console.log(
      `  PathMatcher.match (non-matching): ${usPerCall.toFixed(2)} µs/call (${ITERATIONS} iterations)`
    );

    expect(msPerCall).toBeLessThan(0.1);
  });

  it('Set.has vs Array.includes (100000 iterations)', () => {
    const ITERATIONS = 100000;

    // Build array and set of 100 branch names
    const branches: string[] = [];
    for (let i = 0; i < 100; i++) {
      branches.push(`feature/branch-${i}`);
    }
    const branchSet = new Set(branches);

    // Lookup target near end of array (worst-case for Array.includes)
    const target = 'feature/branch-99';

    // Time Array.includes
    const arrayUs = timeUs(() => {
      branches.includes(target);
    }, ITERATIONS);

    // Time Set.has
    const setUs = timeUs(() => {
      branchSet.has(target);
    }, ITERATIONS);

    console.log(
      `  Array.includes: ${arrayUs.toFixed(3)} µs/call | Set.has: ${setUs.toFixed(3)} µs/call (${ITERATIONS} iterations)`
    );
    console.log(`  Set.has is ${(arrayUs / setUs).toFixed(1)}x faster`);

    expect(setUs).toBeLessThan(arrayUs);
  });

  it('CommandScanner cold construction (10 iterations)', () => {
    const ITERATIONS = 10;
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      CommandScanner.create(DESTRUCTIVE_PATTERNS_DATA, GIT_ACTION_PATTERNS_DATA);
    }
    const elapsed = performance.now() - start;
    const msPerConstruction = elapsed / ITERATIONS;

    console.log(
      `  CommandScanner.create: ${msPerConstruction.toFixed(1)} ms/construction (${ITERATIONS} iterations)`
    );

    expect(msPerConstruction).toBeLessThan(100);
  });
});

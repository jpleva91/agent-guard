#!/usr/bin/env node

// Tests for the benchmark report generator (scripts/bench-report.mjs).
// Uses node:assert — no vitest dependency needed.

import assert from 'node:assert/strict';
import {
  parseArgs,
  formatLatency,
  formatHz,
  generateReport,
  checkThreshold,
  extractCategory,
  extractFile,
} from '../scripts/bench-report.mjs';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failed++;
    console.log(`  \x1b[31m✗ ${name}\x1b[0m`);
    console.log(`    ${err.message}`);
  }
}

function suite(name, fn) {
  console.log(`\n\x1b[1m${name}\x1b[0m`);
  fn();
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SAMPLE_BENCH_DATA = {
  files: [
    {
      filepath: '/path/to/policy-evaluation.bench.ts',
      groups: [
        {
          fullName:
            'tests/benchmarks/policy-evaluation.bench.ts > Policy evaluation — single policy',
          benchmarks: [
            {
              id: 'test_0_0',
              name: 'file.write (allowed)',
              rank: 1,
              rme: 0.05,
              totalTime: 500,
              min: 0.001,
              max: 0.05,
              hz: 500000,
              period: 0.002,
              mean: 0.002,
              p75: 0.003,
              p99: 0.005,
              p995: 0.006,
              p999: 0.008,
              sampleCount: 250000,
              median: 0.002,
            },
            {
              id: 'test_0_1',
              name: 'git.push (denied)',
              rank: 2,
              rme: 0.03,
              totalTime: 500,
              min: 0.0005,
              max: 0.01,
              hz: 1000000,
              period: 0.001,
              mean: 0.001,
              p75: 0.001,
              p99: 0.002,
              p995: 0.003,
              p999: 0.004,
              sampleCount: 500000,
              median: 0.001,
            },
          ],
        },
      ],
    },
    {
      filepath: '/path/to/kernel-loop.bench.ts',
      groups: [
        {
          fullName: 'tests/benchmarks/kernel-loop.bench.ts > Kernel propose — dry run',
          benchmarks: [
            {
              id: 'test_1_0',
              name: 'file.write (allowed)',
              rank: 1,
              rme: 0.1,
              totalTime: 500,
              min: 0.1,
              max: 2.0,
              hz: 5000,
              period: 0.2,
              mean: 0.2,
              p75: 0.25,
              p99: 0.5,
              p995: 0.6,
              p999: 1.0,
              sampleCount: 2500,
              median: 0.18,
            },
          ],
        },
      ],
    },
  ],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

suite('parseArgs', () => {
  test('returns defaults with no arguments', () => {
    const args = parseArgs(['node', 'script.mjs']);
    assert.equal(args.json, 'packages/kernel/bench-results.json');
    assert.equal(args.threshold, 0);
    assert.equal(args.output, '');
  });

  test('parses --json flag', () => {
    const args = parseArgs(['node', 'script.mjs', '--json', 'custom.json']);
    assert.equal(args.json, 'custom.json');
  });

  test('parses --threshold flag', () => {
    const args = parseArgs(['node', 'script.mjs', '--threshold', '50']);
    assert.equal(args.threshold, 50);
  });

  test('parses --output flag', () => {
    const args = parseArgs(['node', 'script.mjs', '--output', 'report.md']);
    assert.equal(args.output, 'report.md');
  });

  test('parses all flags together', () => {
    const args = parseArgs([
      'node',
      'script.mjs',
      '--json',
      'data.json',
      '--threshold',
      '25',
      '--output',
      'out.md',
    ]);
    assert.equal(args.json, 'data.json');
    assert.equal(args.threshold, 25);
    assert.equal(args.output, 'out.md');
  });
});

suite('formatLatency', () => {
  test('formats nanoseconds', () => {
    assert.equal(formatLatency(0.0001), '100ns');
  });

  test('formats microseconds', () => {
    assert.equal(formatLatency(0.005), '5.0µs');
  });

  test('formats milliseconds', () => {
    assert.equal(formatLatency(1.5), '1.50ms');
  });

  test('formats sub-nanosecond as 0ns', () => {
    assert.equal(formatLatency(0.0000001), '0ns');
  });
});

suite('formatHz', () => {
  test('formats millions', () => {
    assert.equal(formatHz(7250000), '7.25M');
  });

  test('formats thousands', () => {
    assert.equal(formatHz(5000), '5.0K');
  });

  test('formats small numbers', () => {
    assert.equal(formatHz(37), '37');
  });
});

suite('extractCategory', () => {
  test('extracts category from full name', () => {
    const result = extractCategory(
      'tests/benchmarks/policy-evaluation.bench.ts > Policy evaluation — single policy'
    );
    assert.equal(result, 'Policy evaluation — single policy');
  });

  test('returns full name when no separator', () => {
    assert.equal(extractCategory('standalone'), 'standalone');
  });
});

suite('extractFile', () => {
  test('extracts file key from bench path', () => {
    const result = extractFile('tests/benchmarks/policy-evaluation.bench.ts > Policy evaluation');
    assert.equal(result, 'policy-evaluation');
  });

  test('extracts kernel-loop file key', () => {
    const result = extractFile('tests/benchmarks/kernel-loop.bench.ts > Kernel propose');
    assert.equal(result, 'kernel-loop');
  });
});

suite('generateReport', () => {
  test('generates markdown with header', () => {
    const { markdown } = generateReport(SAMPLE_BENCH_DATA);
    assert.ok(markdown.includes('# AgentGuard Governance Pipeline'));
    assert.ok(markdown.includes('**Engine**: vitest bench'));
  });

  test('includes summary table', () => {
    const { markdown } = generateReport(SAMPLE_BENCH_DATA);
    assert.ok(markdown.includes('## Summary'));
    assert.ok(markdown.includes('| Component |'));
  });

  test('extracts all benchmarks', () => {
    const { allBenchmarks } = generateReport(SAMPLE_BENCH_DATA);
    assert.equal(allBenchmarks.length, 3);
  });

  test('includes benchmark data in table rows', () => {
    const { markdown } = generateReport(SAMPLE_BENCH_DATA);
    assert.ok(markdown.includes('file.write (allowed)'));
    assert.ok(markdown.includes('git.push (denied)'));
  });

  test('groups benchmarks by file', () => {
    const { markdown } = generateReport(SAMPLE_BENCH_DATA);
    assert.ok(markdown.includes('## Policy Evaluation'));
    assert.ok(markdown.includes('## Full Kernel Loop'));
  });
});

suite('checkThreshold', () => {
  test('returns empty array when all within threshold', () => {
    const { allBenchmarks } = generateReport(SAMPLE_BENCH_DATA);
    const regressions = checkThreshold(allBenchmarks, 50);
    assert.equal(regressions.length, 0);
  });

  test('detects regressions above threshold', () => {
    const { allBenchmarks } = generateReport(SAMPLE_BENCH_DATA);
    // p99 of kernel loop benchmark is 0.5ms
    const regressions = checkThreshold(allBenchmarks, 0.001);
    assert.ok(regressions.length > 0);
  });

  test('regression includes name and values', () => {
    const { allBenchmarks } = generateReport(SAMPLE_BENCH_DATA);
    const regressions = checkThreshold(allBenchmarks, 0.001);
    assert.ok(regressions[0].name);
    assert.ok(regressions[0].p99 > 0);
    assert.equal(regressions[0].threshold, 0.001);
  });
});

// ─── Report ──────────────────────────────────────────────────────────────────

console.log(`\n\x1b[1mResults: ${passed} passed, ${failed} failed\x1b[0m`);
if (failed > 0) process.exit(1);

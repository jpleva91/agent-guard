#!/usr/bin/env node

// Benchmark report generator — reads vitest bench JSON output and produces
// a formatted markdown report with p50/p75/p99 latencies per benchmark.
// Also supports a --threshold flag for CI regression gating.
//
// Usage:
//   node scripts/bench-report.mjs [--json <path>] [--threshold <ms>] [--output <path>]
//
// Options:
//   --json <path>       Path to bench-results.json (default: packages/kernel/bench-results.json)
//   --threshold <ms>    Fail if any p99 latency exceeds this value in ms (CI gate)
//   --output <path>     Write markdown report to file instead of stdout

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const args = { json: 'packages/kernel/bench-results.json', threshold: 0, output: '' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--json' && argv[i + 1]) {
      args.json = argv[++i];
    } else if (argv[i] === '--threshold' && argv[i + 1]) {
      args.threshold = Number(argv[++i]);
    } else if (argv[i] === '--output' && argv[i + 1]) {
      args.output = argv[++i];
    }
  }
  return args;
}

function formatLatency(ms) {
  if (ms < 0.001) return `${(ms * 1_000_000).toFixed(0)}ns`;
  if (ms < 1) return `${(ms * 1000).toFixed(1)}µs`;
  return `${ms.toFixed(2)}ms`;
}

function formatHz(hz) {
  if (hz >= 1_000_000) return `${(hz / 1_000_000).toFixed(2)}M`;
  if (hz >= 1_000) return `${(hz / 1_000).toFixed(1)}K`;
  return hz.toFixed(0);
}

function extractCategory(fullName) {
  const parts = fullName.split(' > ');
  return parts.length > 1 ? parts[parts.length - 1] : fullName;
}

function extractFile(fullName) {
  const parts = fullName.split(' > ');
  if (parts.length === 0) return 'unknown';
  const filePart = parts[0];
  const match = filePart.match(/([^/]+)\.bench\.ts$/);
  return match ? match[1] : filePart;
}

function generateReport(data) {
  const lines = [];
  const timestamp = new Date().toISOString().split('T')[0];

  lines.push('# AgentGuard Governance Pipeline — Benchmark Report');
  lines.push('');
  lines.push(`**Generated**: ${timestamp}`);
  lines.push(`**Engine**: vitest bench (tinybench)`);
  lines.push('');
  lines.push('---');
  lines.push('');

  const allBenchmarks = [];
  let regressions = [];

  for (const file of data.files) {
    for (const group of file.groups) {
      const category = extractCategory(group.fullName);
      const fileKey = extractFile(group.fullName);

      for (const bench of group.benchmarks) {
        allBenchmarks.push({
          fileKey,
          category,
          name: bench.name,
          hz: bench.hz,
          p50: bench.median,
          p75: bench.p75,
          p99: bench.p99,
          p995: bench.p995,
          mean: bench.mean,
          min: bench.min,
          max: bench.max,
          samples: bench.sampleCount,
          rme: bench.rme,
        });
      }
    }
  }

  // Group by file
  const byFile = new Map();
  for (const b of allBenchmarks) {
    const key = b.fileKey;
    if (!byFile.has(key)) byFile.set(key, new Map());
    const categories = byFile.get(key);
    if (!categories.has(b.category)) categories.set(b.category, []);
    categories.get(b.category).push(b);
  }

  const FILE_TITLES = {
    'policy-evaluation': 'Policy Evaluation',
    'invariant-checking': 'Invariant Checking',
    'kernel-loop': 'Full Kernel Loop',
    simulation: 'Simulation Overhead',
  };

  for (const [fileKey, categories] of byFile) {
    const title = FILE_TITLES[fileKey] || fileKey;
    lines.push(`## ${title}`);
    lines.push('');

    for (const [category, benchmarks] of categories) {
      lines.push(`### ${category}`);
      lines.push('');
      lines.push('| Benchmark | ops/sec | p50 | p75 | p99 | samples | rme |');
      lines.push('|-----------|---------|-----|-----|-----|---------|-----|');

      for (const b of benchmarks) {
        lines.push(
          `| ${b.name} | ${formatHz(b.hz)} | ${formatLatency(b.p50)} | ${formatLatency(b.p75)} | ${formatLatency(b.p99)} | ${b.samples.toLocaleString()} | ±${b.rme.toFixed(2)}% |`
        );
      }
      lines.push('');
    }
  }

  // Summary statistics
  lines.push('## Summary');
  lines.push('');

  const policyBenches = allBenchmarks.filter((b) => b.fileKey === 'policy-evaluation');
  const invariantBenches = allBenchmarks.filter((b) => b.fileKey === 'invariant-checking');
  const kernelBenches = allBenchmarks.filter((b) => b.fileKey === 'kernel-loop');
  const simBenches = allBenchmarks.filter((b) => b.fileKey === 'simulation');

  const summarize = (benches, label) => {
    if (benches.length === 0) return null;
    const p99s = benches.map((b) => b.p99);
    const maxP99 = Math.max(...p99s);
    const avgP99 = p99s.reduce((a, b) => a + b, 0) / p99s.length;
    return { label, maxP99, avgP99, count: benches.length };
  };

  const summaries = [
    summarize(policyBenches, 'Policy evaluation'),
    summarize(invariantBenches, 'Invariant checking'),
    summarize(kernelBenches, 'Full kernel loop'),
    summarize(simBenches, 'Simulation'),
  ].filter(Boolean);

  lines.push('| Component | Benchmarks | Avg p99 | Max p99 |');
  lines.push('|-----------|------------|---------|---------|');
  for (const s of summaries) {
    lines.push(
      `| ${s.label} | ${s.count} | ${formatLatency(s.avgP99)} | ${formatLatency(s.maxP99)} |`
    );
  }
  lines.push('');

  return { markdown: lines.join('\n'), allBenchmarks, regressions };
}

function checkThreshold(allBenchmarks, thresholdMs) {
  const regressions = [];
  for (const b of allBenchmarks) {
    if (b.p99 > thresholdMs) {
      regressions.push({
        name: `${b.category} > ${b.name}`,
        p99: b.p99,
        threshold: thresholdMs,
      });
    }
  }
  return regressions;
}

function main() {
  const args = parseArgs(process.argv);
  const jsonPath = resolve(args.json);

  let raw;
  try {
    raw = readFileSync(jsonPath, 'utf8');
  } catch {
    console.error(`Error: Cannot read benchmark results at ${jsonPath}`);
    console.error('Run benchmarks first: pnpm --filter=@red-codes/kernel run bench');
    process.exit(1);
  }

  const data = JSON.parse(raw);
  const { markdown, allBenchmarks } = generateReport(data);

  if (args.output) {
    writeFileSync(resolve(args.output), markdown, 'utf8');
    console.log(`Benchmark report written to ${args.output}`);
  } else {
    console.log(markdown);
  }

  if (args.threshold > 0) {
    const regressions = checkThreshold(allBenchmarks, args.threshold);
    if (regressions.length > 0) {
      console.error('\n--- BENCHMARK REGRESSION DETECTED ---');
      for (const r of regressions) {
        console.error(
          `  FAIL: ${r.name} — p99 ${formatLatency(r.p99)} exceeds threshold ${formatLatency(r.threshold)}`
        );
      }
      console.error(
        `\n${regressions.length} benchmark(s) exceeded the p99 threshold of ${formatLatency(args.threshold)}`
      );
      process.exit(1);
    } else {
      console.log(
        `\nAll ${allBenchmarks.length} benchmarks within p99 threshold of ${formatLatency(args.threshold)}`
      );
    }
  }
}

// Export for testing
export {
  parseArgs,
  formatLatency,
  formatHz,
  generateReport,
  checkThreshold,
  extractCategory,
  extractFile,
};

// Only run when invoked directly (not when imported by tests)
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
if (
  process.argv[1] === __filename ||
  process.argv[1]?.replace(/\\/g, '/') === __filename.replace(/\\/g, '/')
) {
  main();
}

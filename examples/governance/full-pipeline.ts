/**
 * Scenario: Multi-Agent Pipeline with Audit Gate
 *
 * Demonstrates the 5-stage orchestration pipeline:
 * plan → build → test → optimize → audit
 *
 * The build stage deliberately modifies files outside its declared scope,
 * triggering the file scope validation gate.
 *
 * Run: npx tsx examples/governance/full-pipeline.ts
 * Requires: npm run build:ts
 */

import { runPipeline, getPipelineSummary } from '../../dist/orchestration/orchestrator.js';

console.log('=== Scenario: Multi-Agent Pipeline ===\n');

// --- Run 1: Successful pipeline ---
console.log('--- Run 1: Successful Pipeline ---\n');

const successRun = runPipeline('Refactor auth module', {
  plan(_context) {
    return {
      files: ['src/auth/session.ts', 'src/auth/token.ts'],
      constraints: ['no-breaking-changes'],
    };
  },
  build(_context) {
    return {
      changes: {
        'src/auth/session.ts': 'updated session handling',
        'src/auth/token.ts': 'updated token refresh',
      },
    };
  },
  test(_context) {
    return {
      testResults: { passed: true, count: 12, failures: 0 },
      coverageReport: { lines: 87, branches: 82 },
    };
  },
  optimize(_context) {
    return {
      changes: { 'src/auth/session.ts': 'optimized session handling' },
      refactorNotes: 'removed dead code, inlined constants',
    };
  },
  audit(_context) {
    return {
      auditResult: { passed: true, violationCount: 0 },
      violations: [],
    };
  },
});

const successSummary = getPipelineSummary(successRun);
console.log(`Pipeline: ${successSummary.task}`);
console.log(`Status: ${successSummary.status}`);
console.log(`Stages:`);
for (const stage of successSummary.stages) {
  console.log(
    `  ${stage.stage}: ${stage.status}${stage.errors.length > 0 ? ' — ' + stage.errors.join(', ') : ''}`
  );
}

// --- Run 2: File scope violation ---
console.log('\n--- Run 2: File Scope Violation ---\n');

const violationRun = runPipeline('Fix login bug', {
  plan(_context) {
    return {
      files: ['src/auth/login.ts'],
      constraints: [],
    };
  },
  build(_context) {
    // Builder modifies a file OUTSIDE the declared scope
    return {
      changes: {
        'src/auth/login.ts': 'fixed login bug',
        'src/database/connection.ts': 'also modified this (unauthorized!)',
      },
      linesChanged: 30,
    };
  },
  test(_context) {
    return { passed: true, coverage: 92, testCount: 8 };
  },
});

const violationSummary = getPipelineSummary(violationRun);
console.log(`Pipeline: ${violationSummary.task}`);
console.log(`Status: ${violationSummary.status}`);
console.log(`Stages:`);
for (const stage of violationSummary.stages) {
  console.log(
    `  ${stage.stage}: ${stage.status}${stage.errors.length > 0 ? ' — ' + stage.errors.join(', ') : ''}`
  );
}

// --- Run 3: Role authorization failure ---
console.log('\n--- Run 3: Missing Handler (Stage Skipped) ---\n');

const skipRun = runPipeline('Quick hotfix', {
  plan(_context) {
    return { files: ['src/utils/helpers.ts'], constraints: [] };
  },
  build(context) {
    return {
      changes: { 'src/utils/helpers.ts': 'hotfix applied' },
      linesChanged: 5,
    };
  },
  // test, optimize, audit handlers omitted → stages skipped
});

const skipSummary = getPipelineSummary(skipRun);
console.log(`Pipeline: ${skipSummary.task}`);
console.log(`Status: ${skipSummary.status}`);
console.log(`Stages:`);
for (const stage of skipSummary.stages) {
  console.log(`  ${stage.stage}: ${stage.status}`);
}

// Verify
console.log('\n--- Verification ---');
console.log(
  `Successful pipeline completed: ${successRun.status === 'completed' ? 'PASS' : 'FAIL'}`
);
console.log(`File scope violation caught: ${violationRun.status === 'failed' ? 'PASS' : 'FAIL'}`);
console.log(
  `Build stage failed on scope: ${violationRun.results.find((r) => r.stageId === 'build')?.errors.some((e) => e.includes('scope')) ? 'PASS' : 'FAIL'}`
);
console.log(`Skipped stages handled: ${skipRun.status === 'completed' ? 'PASS' : 'FAIL'}`);

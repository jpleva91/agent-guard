// CLI command: agentguard audit-verify — verify tamper-resistant audit chain
// and generate enforcement audit report.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyChainedJsonl, getChainedEventFilePath } from '@red-codes/events';
import { getDecisionFilePath } from '@red-codes/events';
import { generateEnforcementAudit, formatEnforcementAudit } from '@red-codes/kernel';
import type { GovernanceDecisionRecord } from '@red-codes/core';

const BASE_DIR = '.agentguard';
const EVENTS_DIR = join(BASE_DIR, 'events');

function listChainedRuns(): string[] {
  if (!existsSync(EVENTS_DIR)) return [];
  return readdirSync(EVENTS_DIR)
    .filter((f) => f.endsWith('.chained.jsonl'))
    .map((f) => f.replace('.chained.jsonl', ''))
    .sort();
}

function findLastChainedRun(): string | null {
  const runs = listChainedRuns();
  return runs.length > 0 ? runs[runs.length - 1] : null;
}

function loadDecisions(runId: string): GovernanceDecisionRecord[] {
  const filePath = getDecisionFilePath(runId);
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf8');
  const records: GovernanceDecisionRecord[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed) as GovernanceDecisionRecord);
    } catch {
      // skip malformed
    }
  }
  return records;
}

export async function auditVerify(args: string[]): Promise<number> {
  const wantsJson = args.includes('--json');
  const wantsReport = args.includes('--report');
  const wantsList = args.includes('--list');
  const wantsLast = args.includes('--last');

  // List available chained runs
  if (wantsList) {
    const runs = listChainedRuns();
    if (runs.length === 0) {
      console.log('  No chained audit trails found.');
      return 0;
    }
    console.log(`\n  Chained audit trails (${runs.length}):\n`);
    for (const r of runs) {
      console.log(`    ${r}`);
    }
    console.log('');
    return 0;
  }

  // Resolve run ID
  let runId: string | null = null;
  if (wantsLast) {
    runId = findLastChainedRun();
    if (!runId) {
      console.error('  No chained audit trails found.');
      return 1;
    }
  } else {
    // First positional argument that isn't a flag
    runId = args.find((a) => !a.startsWith('--')) || null;
    if (!runId) {
      runId = findLastChainedRun();
      if (!runId) {
        console.error('  Usage: agentguard audit-verify [runId] [--last] [--report] [--json]');
        return 1;
      }
    }
  }

  // Verify chain integrity
  const chainPath = getChainedEventFilePath(runId);
  const verification = verifyChainedJsonl(chainPath);

  if (wantsJson && !wantsReport) {
    console.log(JSON.stringify(verification, null, 2));
    return verification.valid ? 0 : 1;
  }

  if (!wantsReport) {
    // Just show verification result
    console.log('');
    console.log('  Audit Chain Verification');
    console.log('  ========================');
    console.log(`  Run:      ${runId}`);
    console.log(`  File:     ${chainPath}`);
    console.log(`  Records:  ${verification.totalRecords}`);
    console.log(`  Verified: ${verification.verifiedRecords}`);

    if (verification.valid) {
      console.log(`  Status:   \x1b[32mINTEGRITY VERIFIED\x1b[0m`);
    } else {
      console.log(`  Status:   \x1b[31mINTEGRITY FAILURE\x1b[0m`);
      if (verification.brokenAt) {
        console.log(
          `  Broken at seq ${verification.brokenAt.seq}: ${verification.brokenAt.reason}`
        );
      }
    }

    if (verification.timeRange) {
      const first = new Date(verification.timeRange.first).toISOString();
      const last = new Date(verification.timeRange.last).toISOString();
      console.log(`  From:     ${first}`);
      console.log(`  To:       ${last}`);
    }

    console.log('');
    return verification.valid ? 0 : 1;
  }

  // Full enforcement audit report
  const decisions = loadDecisions(runId);
  const report = generateEnforcementAudit({
    runId,
    decisions,
    chainVerified: verification.valid,
  });

  if (wantsJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatEnforcementAudit(report));
  }

  return verification.valid ? 0 : 1;
}

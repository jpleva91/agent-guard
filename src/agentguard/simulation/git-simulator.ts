// Git simulator — predicts impact of git operations.
// Runs git commands to assess risk without modifying state.

import { execSync } from 'node:child_process';
import type { NormalizedIntent } from '../policies/evaluator.js';
import type { ActionSimulator, SimulationResult } from './types.js';

const GIT_ACTIONS = new Set(['git.push', 'git.force-push', 'git.merge', 'git.branch.delete']);

export function createGitSimulator(): ActionSimulator {
  return {
    id: 'git-simulator',

    supports(intent: NormalizedIntent): boolean {
      return GIT_ACTIONS.has(intent.action);
    },

    async simulate(
      intent: NormalizedIntent,
      context: Record<string, unknown>
    ): Promise<SimulationResult> {
      const start = Date.now();
      const predictedChanges: string[] = [];
      const details: Record<string, unknown> = {};
      let blastRadius = 0;
      let riskLevel: 'low' | 'medium' | 'high' = 'low';

      // Force push is always high risk
      if (intent.action === 'git.force-push') {
        riskLevel = 'high';
        predictedChanges.push('Force push will rewrite remote history');
        details.forcePush = true;
        blastRadius = 100; // Maximum blast radius signal
      }

      // Count unpushed commits
      const branch = intent.branch || intent.target || '';
      if (branch && (intent.action === 'git.push' || intent.action === 'git.force-push')) {
        try {
          const count = execSync(`git rev-list --count origin/${branch}..HEAD`, {
            encoding: 'utf8',
            timeout: 5000,
          }).trim();
          const unpushed = parseInt(count, 10);
          if (!isNaN(unpushed)) {
            details.unpushedCommits = unpushed;
            blastRadius = Math.max(blastRadius, unpushed);
            predictedChanges.push(`${unpushed} unpushed commit(s) to ${branch}`);
            if (unpushed > 10) riskLevel = riskLevel === 'high' ? 'high' : 'medium';
          }
        } catch {
          // Branch may not have a remote — not an error
          details.remoteTrackingError = true;
        }
      }

      // Check for protected branch push
      const protectedBranches = (context.protectedBranches as string[]) || ['main', 'master'];
      if (branch && protectedBranches.includes(branch)) {
        riskLevel = riskLevel === 'low' ? 'medium' : riskLevel;
        predictedChanges.push(`Push targets protected branch: ${branch}`);
        details.protectedBranch = true;
      }

      // Git merge: check for conflicts
      if (intent.action === 'git.merge' && branch) {
        try {
          const diffStat = execSync(`git diff --stat HEAD...${branch}`, {
            encoding: 'utf8',
            timeout: 5000,
          }).trim();
          const fileCount = (diffStat.match(/\d+ files? changed/)?.[0] || '').match(/\d+/)?.[0];
          if (fileCount) {
            const count = parseInt(fileCount, 10);
            blastRadius = Math.max(blastRadius, count);
            predictedChanges.push(`Merge would affect ${count} file(s)`);
            if (count > 20) riskLevel = riskLevel === 'high' ? 'high' : 'medium';
          }
        } catch {
          details.mergeSimError = true;
        }
      }

      // Branch delete
      if (intent.action === 'git.branch.delete') {
        predictedChanges.push(`Delete branch: ${branch}`);
        riskLevel = protectedBranches.includes(branch) ? 'high' : 'low';
        blastRadius = protectedBranches.includes(branch) ? 100 : 1;
      }

      return {
        predictedChanges,
        blastRadius,
        riskLevel,
        details,
        simulatorId: 'git-simulator',
        durationMs: Date.now() - start,
      };
    },
  };
}

// Filesystem simulator — predicts impact of file operations.
// Evaluates path sensitivity without touching the filesystem.

import type { NormalizedIntent } from '@red-codes/policy';
import type { ActionSimulator, SimulationResult } from './types.js';

const FILE_ACTIONS = new Set(['file.write', 'file.delete']);

// Reuses sensitive path patterns from no-secret-exposure invariant
const SENSITIVE_PATTERNS = ['.env', 'credentials', '.pem', '.key', 'secret', 'token'];

const CONFIG_PATTERNS = [
  'package.json',
  'tsconfig.json',
  'eslint',
  '.prettierrc',
  'webpack.config',
  'vite.config',
  'next.config',
  'jest.config',
  'vitest.config',
  '.babelrc',
  'babel.config',
];

const LOCKFILE_PATTERNS = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

const CI_PATTERNS = ['.github/', '.gitlab-ci', 'Jenkinsfile', '.circleci/', 'Dockerfile'];

function assessPathRisk(target: string): {
  riskLevel: 'low' | 'medium' | 'high';
  reasons: string[];
} {
  const lower = target.toLowerCase();
  const reasons: string[] = [];
  let riskLevel: 'low' | 'medium' | 'high' = 'low';

  // Check sensitive files (highest risk)
  if (SENSITIVE_PATTERNS.some((p) => lower.includes(p))) {
    riskLevel = 'high';
    reasons.push(`Sensitive file: ${target}`);
  }

  // Check lockfiles
  if (LOCKFILE_PATTERNS.some((p) => lower.includes(p))) {
    riskLevel = riskLevel === 'high' ? 'high' : 'medium';
    reasons.push(`Lockfile modification: ${target}`);
  }

  // Check CI/CD configs
  if (CI_PATTERNS.some((p) => lower.includes(p))) {
    riskLevel = riskLevel === 'high' ? 'high' : 'medium';
    reasons.push(`CI/CD config: ${target}`);
  }

  // Check project configs
  if (CONFIG_PATTERNS.some((p) => lower.includes(p))) {
    riskLevel = riskLevel === 'low' ? 'medium' : riskLevel;
    reasons.push(`Project config: ${target}`);
  }

  return { riskLevel, reasons };
}

export function createFilesystemSimulator(): ActionSimulator {
  return {
    id: 'filesystem-simulator',

    supports(intent: NormalizedIntent): boolean {
      return FILE_ACTIONS.has(intent.action);
    },

    async simulate(intent: NormalizedIntent): Promise<SimulationResult> {
      const start = Date.now();
      const target = intent.target || '';
      const { riskLevel, reasons } = assessPathRisk(target);

      const predictedChanges: string[] = [];
      const details: Record<string, unknown> = {};

      if (intent.action === 'file.delete') {
        predictedChanges.push(`Delete: ${target}`);
        details.operation = 'delete';
      } else {
        predictedChanges.push(`Write: ${target}`);
        details.operation = 'write';
      }

      predictedChanges.push(...reasons);
      details.pathRisk = riskLevel;
      details.sensitiveMatch = SENSITIVE_PATTERNS.some((p) => target.toLowerCase().includes(p));

      return {
        predictedChanges,
        blastRadius: intent.filesAffected || 1,
        riskLevel,
        details,
        simulatorId: 'filesystem-simulator',
        durationMs: Date.now() - start,
      };
    },
  };
}

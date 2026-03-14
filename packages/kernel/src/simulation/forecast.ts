// Impact forecast builder — composes structured forecasts from simulation results.
// Post-processes SimulationResult + NormalizedIntent into a typed ImpactForecast
// suitable for predictive policy rules and governance reporting.

import type { NormalizedIntent } from '@red-codes/policy';
import { computeBlastRadius } from '../blast-radius.js';
import type { ImpactForecast, SimulationResult } from './types.js';

/** Known module directories and their downstream dependents */
const MODULE_DEPENDENCY_MAP: Record<string, string[]> = {
  'src/kernel': ['src/cli', 'src/adapters'],
  'src/events': ['src/kernel', 'src/cli', 'src/adapters', 'src/plugins', 'src/renderers'],
  'src/policy': ['src/kernel', 'src/cli'],
  'src/invariants': ['src/kernel'],
  'src/adapters': ['src/cli'],
  'src/core': [
    'src/kernel',
    'src/events',
    'src/policy',
    'src/invariants',
    'src/adapters',
    'src/cli',
    'src/plugins',
    'src/renderers',
  ],
  'src/plugins': ['src/cli'],
  'src/renderers': ['src/cli'],
  'src/telemetry': ['src/cli'],
  'src/cli': [],
};

/** Test-relevant path patterns that increase test risk */
const TEST_SENSITIVE_PATTERNS = [
  { pattern: 'test', weight: 20 },
  { pattern: '.test.', weight: 15 },
  { pattern: '.spec.', weight: 15 },
  { pattern: 'src/core/', weight: 15 },
  { pattern: 'src/kernel/', weight: 12 },
  { pattern: 'src/events/', weight: 10 },
  { pattern: 'src/policy/', weight: 10 },
  { pattern: 'src/invariants/', weight: 10 },
  { pattern: 'package.json', weight: 8 },
  { pattern: 'tsconfig', weight: 5 },
];

/** Extract predicted file paths from a simulation result and intent */
function extractPredictedFiles(intent: NormalizedIntent, result: SimulationResult): string[] {
  const files: string[] = [];

  // The target is the primary predicted file
  if (intent.target) {
    files.push(intent.target);
  }

  // Extract additional paths from simulation details
  if (result.details.affectedPackages && Array.isArray(result.details.affectedPackages)) {
    files.push('package.json', 'package-lock.json');
  }

  // For git merges, diff-stat may have indicated file count
  if (result.details.mergeFiles && Array.isArray(result.details.mergeFiles)) {
    files.push(...(result.details.mergeFiles as string[]));
  }

  return [...new Set(files)];
}

/** Identify downstream modules affected by changes to the given file paths */
function identifyDependencies(filePaths: string[]): string[] {
  const affected = new Set<string>();

  for (const filePath of filePaths) {
    // Normalize to forward slashes for matching
    const normalized = filePath.replace(/\\/g, '/');

    for (const [moduleDir, dependents] of Object.entries(MODULE_DEPENDENCY_MAP)) {
      if (normalized.startsWith(moduleDir) || normalized.includes(`/${moduleDir}`)) {
        // The module itself is affected
        affected.add(moduleDir);
        // All dependents are downstream-affected
        for (const dep of dependents) {
          affected.add(dep);
        }
      }
    }

    // Package changes affect the entire dependency tree
    if (normalized.includes('package.json') || normalized.includes('package-lock.json')) {
      affected.add('node_modules');
    }
  }

  return [...affected].sort();
}

/** Compute a test risk score (0–100) based on the predicted changes */
function computeTestRisk(
  filePaths: string[],
  dependenciesAffected: string[],
  blastRadius: number
): number {
  let score = 0;

  // Base score from blast radius (clamped to 0-40 range)
  score += Math.min(40, Math.round((blastRadius / 50) * 40));

  // Path sensitivity contribution
  for (const filePath of filePaths) {
    const lower = filePath.toLowerCase().replace(/\\/g, '/');
    for (const { pattern, weight } of TEST_SENSITIVE_PATTERNS) {
      if (lower.includes(pattern)) {
        score += weight;
        break; // Only apply the highest-weight pattern per file
      }
    }
  }

  // Dependency breadth contribution (more modules affected = higher risk)
  score += Math.min(15, dependenciesAffected.length * 3);

  return Math.min(100, score);
}

/**
 * Build a structured impact forecast from a simulation result.
 *
 * Composes the SimulationResult with blast-radius computation and
 * dependency analysis to produce a typed ImpactForecast.
 *
 * @param intent  The normalized action intent
 * @param result  The simulation result from an ActionSimulator
 * @param threshold  Blast radius threshold for score computation (default: 50)
 */
export function buildImpactForecast(
  intent: NormalizedIntent,
  result: SimulationResult,
  threshold = 50
): ImpactForecast {
  // 1. Predicted files
  const predictedFiles = extractPredictedFiles(intent, result);

  // 2. Dependencies affected
  const dependenciesAffected = identifyDependencies(predictedFiles);

  // 3. Blast radius score via the existing computation engine
  const brResult = computeBlastRadius(intent, threshold);

  // 4. Test risk score
  const testRiskScore = computeTestRisk(predictedFiles, dependenciesAffected, result.blastRadius);

  // 5. Risk level — take the worst of simulation and blast radius assessment
  const riskLevels: Array<'low' | 'medium' | 'high'> = [result.riskLevel, brResult.riskLevel];
  const riskLevel = riskLevels.includes('high')
    ? 'high'
    : riskLevels.includes('medium')
      ? 'medium'
      : 'low';

  return {
    predictedFiles,
    dependenciesAffected,
    testRiskScore,
    blastRadiusScore: brResult.weightedScore,
    riskLevel,
    blastRadiusFactors: brResult.factors.map((f) => ({
      name: f.name,
      multiplier: f.multiplier,
      reason: f.reason,
    })),
  };
}

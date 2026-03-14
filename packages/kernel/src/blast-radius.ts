// Blast radius computation engine — Phase 2 implementation.
// Pure domain logic: computes a weighted blast radius score from action metadata.
// No I/O, no Node.js-specific APIs. Suitable for use inside the synchronous authorize() flow.

import type { NormalizedIntent } from '@red-codes/policy';
import {
  BLAST_RADIUS_DEFAULT_WEIGHTS,
  BLAST_RADIUS_SENSITIVE_PATTERNS,
  BLAST_RADIUS_CONFIG_PATTERNS,
  BLAST_RADIUS_RISK_THRESHOLDS,
} from '@red-codes/core';

/** Weights applied to different action categories */
export interface BlastRadiusWeights {
  /** Multiplier for delete operations (default: 3.0) */
  delete: number;
  /** Multiplier for write operations (default: 1.5) */
  write: number;
  /** Multiplier for read operations (default: 0.1) */
  read: number;
  /** Multiplier for git operations (default: 2.0) */
  git: number;
  /** Multiplier for shell exec (default: 1.0) */
  shell: number;
  /** Multiplier for sensitive path matches (default: 5.0) */
  sensitivePath: number;
  /** Multiplier for config file matches (default: 2.0) */
  configPath: number;
  /** Multiplier for destructive shell commands (default: 4.0) */
  destructive: number;
}

/** Result of blast radius computation */
export interface BlastRadiusResult {
  /** Raw count of files/entities affected */
  rawCount: number;
  /** Weighted score after applying action and path multipliers */
  weightedScore: number;
  /** Risk level derived from weighted score */
  riskLevel: 'low' | 'medium' | 'high';
  /** Which factors contributed to the score */
  factors: BlastRadiusFactor[];
  /** Whether the weighted score exceeds the given threshold */
  exceeded: boolean;
  /** The threshold that was checked against */
  threshold: number;
}

/** A single factor contributing to the blast radius score */
export interface BlastRadiusFactor {
  name: string;
  multiplier: number;
  reason: string;
}

const DEFAULT_WEIGHTS: BlastRadiusWeights =
  BLAST_RADIUS_DEFAULT_WEIGHTS as BlastRadiusWeights;

const SENSITIVE_PATTERNS: string[] = BLAST_RADIUS_SENSITIVE_PATTERNS;

const CONFIG_PATTERNS: string[] = BLAST_RADIUS_CONFIG_PATTERNS;

/** Determine the action weight multiplier based on action type */
function getActionMultiplier(
  action: string,
  weights: BlastRadiusWeights
): BlastRadiusFactor | null {
  if (action.startsWith('file.delete')) {
    return { name: 'delete-action', multiplier: weights.delete, reason: 'File deletion' };
  }
  if (action.startsWith('file.write') || action === 'file.move') {
    return { name: 'write-action', multiplier: weights.write, reason: 'File write/move' };
  }
  if (action.startsWith('file.read')) {
    return { name: 'read-action', multiplier: weights.read, reason: 'File read (low impact)' };
  }
  if (action.startsWith('git.')) {
    if (action === 'git.force-push') {
      return {
        name: 'force-push',
        multiplier: weights.git * 2,
        reason: 'Git force push (history rewrite)',
      };
    }
    if (action === 'git.branch.delete') {
      return {
        name: 'branch-delete',
        multiplier: weights.git * 1.5,
        reason: 'Git branch deletion',
      };
    }
    return { name: 'git-action', multiplier: weights.git, reason: `Git operation: ${action}` };
  }
  if (action === 'shell.exec') {
    return { name: 'shell-exec', multiplier: weights.shell, reason: 'Shell execution' };
  }
  return null;
}

/** Check if the target path matches sensitive patterns */
function getSensitivePathFactor(
  target: string,
  weights: BlastRadiusWeights
): BlastRadiusFactor | null {
  if (!target) return null;
  const lower = target.toLowerCase();
  if (SENSITIVE_PATTERNS.some((p) => lower.includes(p))) {
    return {
      name: 'sensitive-path',
      multiplier: weights.sensitivePath,
      reason: `Sensitive file path: ${target}`,
    };
  }
  return null;
}

/** Check if the target path matches config file patterns */
function getConfigPathFactor(
  target: string,
  weights: BlastRadiusWeights
): BlastRadiusFactor | null {
  if (!target) return null;
  const lower = target.toLowerCase();
  if (CONFIG_PATTERNS.some((p) => lower.includes(p))) {
    return {
      name: 'config-path',
      multiplier: weights.configPath,
      reason: `Config/CI file: ${target}`,
    };
  }
  return null;
}

/** Check if the intent is a destructive shell command */
function getDestructiveCommandFactor(
  intent: NormalizedIntent,
  weights: BlastRadiusWeights
): BlastRadiusFactor | null {
  if (!intent.destructive) return null;
  return {
    name: 'destructive-command',
    multiplier: weights.destructive,
    reason: 'Destructive shell command detected',
  };
}

/** Derive risk level from a weighted score */
function deriveRiskLevel(weightedScore: number): 'low' | 'medium' | 'high' {
  if (weightedScore >= BLAST_RADIUS_RISK_THRESHOLDS.high) return 'high';
  if (weightedScore >= BLAST_RADIUS_RISK_THRESHOLDS.medium) return 'medium';
  return 'low';
}

/**
 * Compute the blast radius for a normalized intent.
 *
 * The engine applies multipliers for:
 *   - Action type (delete > write > git > shell > read)
 *   - Destructive command detection (sudo, rm -rf, DROP TABLE, etc.)
 *   - Path sensitivity (secrets, credentials)
 *   - Config file impact (package.json, CI configs, etc.)
 *
 * The final weighted score is the raw file count multiplied by
 * the highest applicable multiplier from each factor category.
 *
 * @param intent     The normalized action intent
 * @param threshold  The policy limit to check against
 * @param weights    Optional custom weights (defaults provided)
 */
export function computeBlastRadius(
  intent: NormalizedIntent,
  threshold: number,
  weights: BlastRadiusWeights = DEFAULT_WEIGHTS
): BlastRadiusResult {
  const rawCount = intent.filesAffected ?? 1;
  const factors: BlastRadiusFactor[] = [];

  // Collect applicable factors
  const actionFactor = getActionMultiplier(intent.action, weights);
  if (actionFactor) factors.push(actionFactor);

  const destructiveFactor = getDestructiveCommandFactor(intent, weights);
  if (destructiveFactor) factors.push(destructiveFactor);

  const sensitiveFactor = getSensitivePathFactor(intent.target, weights);
  if (sensitiveFactor) factors.push(sensitiveFactor);

  const configFactor = getConfigPathFactor(intent.target, weights);
  if (configFactor) factors.push(configFactor);

  // Compute weighted score: raw count * product of all factor multipliers
  // Each factor category contributes independently (multiplicative)
  const totalMultiplier = factors.reduce((acc, f) => acc * f.multiplier, 1);
  const weightedScore = Math.round(rawCount * totalMultiplier * 100) / 100;

  const riskLevel = deriveRiskLevel(weightedScore);
  const exceeded = weightedScore > threshold;

  return {
    rawCount,
    weightedScore,
    riskLevel,
    factors,
    exceeded,
    threshold,
  };
}

export { DEFAULT_WEIGHTS, SENSITIVE_PATTERNS, CONFIG_PATTERNS };

// Governance data loader — typed access to shared JSON data files.
// These JSON files are the canonical source of truth for governance constants,
// consumable by both TypeScript and a future Rust implementation.

import actionsData from './data/actions.json' with { type: 'json' };
import toolActionMapData from './data/tool-action-map.json' with { type: 'json' };
import destructivePatternsData from './data/destructive-patterns.json' with { type: 'json' };
import gitActionPatternsData from './data/git-action-patterns.json' with { type: 'json' };
import githubActionPatternsData from './data/github-action-patterns.json' with { type: 'json' };
import blastRadiusData from './data/blast-radius.json' with { type: 'json' };
import escalationData from './data/escalation.json' with { type: 'json' };
import invariantPatternsData from './data/invariant-patterns.json' with { type: 'json' };

// --- Actions ---

export const ACTION_CLASS_DATA = actionsData.classes;
export const ACTION_TYPES_DATA = actionsData.types;
export const DECISION_DATA = actionsData.decisions;

// --- Tool → Action mapping ---

export const TOOL_ACTION_MAP_DATA: Record<string, string> = toolActionMapData;

// --- Destructive patterns ---

export interface DestructivePatternData {
  pattern: string;
  description: string;
  riskLevel: 'high' | 'critical';
  category: string;
  flags?: string;
}

export interface CompiledDestructivePattern {
  pattern: RegExp;
  description: string;
  riskLevel: 'high' | 'critical';
  category: string;
}

const compiledDestructivePatterns: CompiledDestructivePattern[] | null = null;

export function getDestructivePatterns(): CompiledDestructivePattern[] {
  if (compiledDestructivePatterns) return compiledDestructivePatterns;
  return (destructivePatternsData as DestructivePatternData[]).map((p) => ({
    pattern: new RegExp(p.pattern, p.flags),
    description: p.description,
    riskLevel: p.riskLevel,
    category: p.category,
  }));
}

export const DESTRUCTIVE_PATTERNS_DATA: DestructivePatternData[] =
  destructivePatternsData as DestructivePatternData[];

// --- Git action patterns ---

export interface GitActionPatternData {
  patterns: string[];
  actionType: string;
}

export interface CompiledGitActionPattern {
  patterns: RegExp[];
  actionType: string;
}

export function getGitActionPatterns(): CompiledGitActionPattern[] {
  return (gitActionPatternsData as GitActionPatternData[]).map((p) => ({
    patterns: p.patterns.map((s) => new RegExp(s)),
    actionType: p.actionType,
  }));
}

export const GIT_ACTION_PATTERNS_DATA: GitActionPatternData[] =
  gitActionPatternsData as GitActionPatternData[];

// --- GitHub action patterns ---

export interface GithubActionPatternData {
  patterns: string[];
  actionType: string;
}

export interface CompiledGithubActionPattern {
  patterns: RegExp[];
  actionType: string;
}

export function getGithubActionPatterns(): CompiledGithubActionPattern[] {
  return (githubActionPatternsData as GithubActionPatternData[]).map((p) => ({
    patterns: p.patterns.map((s) => new RegExp(s)),
    actionType: p.actionType,
  }));
}

export const GITHUB_ACTION_PATTERNS_DATA: GithubActionPatternData[] =
  githubActionPatternsData as GithubActionPatternData[];

// --- Blast radius ---

export const BLAST_RADIUS_DEFAULT_WEIGHTS = blastRadiusData.defaultWeights;
export const BLAST_RADIUS_SENSITIVE_PATTERNS: string[] = blastRadiusData.sensitivePatterns;
export const BLAST_RADIUS_CONFIG_PATTERNS: string[] = blastRadiusData.configPatterns;
export const BLAST_RADIUS_RISK_THRESHOLDS = blastRadiusData.riskThresholds;

// --- Escalation ---

export const ESCALATION_LEVELS = escalationData.levels;
export const ESCALATION_DEFAULTS = escalationData.defaults;

// --- Invariant patterns ---

export const INVARIANT_SENSITIVE_FILE_PATTERNS: string[] =
  invariantPatternsData.sensitiveFilePatterns;
export const INVARIANT_CREDENTIAL_PATH_PATTERNS: string[] =
  invariantPatternsData.credentialPathPatterns;
export const INVARIANT_CREDENTIAL_BASENAME_PATTERNS: string[] =
  invariantPatternsData.credentialBasenamePatterns;
export const INVARIANT_CONTAINER_CONFIG_BASENAMES: string[] =
  invariantPatternsData.containerConfigBasenames;
export const INVARIANT_LIFECYCLE_SCRIPTS: string[] = invariantPatternsData.lifecycleScripts;
export const INVARIANT_IDE_CONTEXT_ENV_VARS: string[] = invariantPatternsData.ideContextEnvVars;
export const INVARIANT_IDE_SOCKET_PATH_PATTERNS: string[] =
  invariantPatternsData.ideSocketPathPatterns;
export const INVARIANT_ENV_FILE_REGEX_SOURCE: string = invariantPatternsData.envFileRegex;
export const INVARIANT_DOCKERFILE_SUFFIX_REGEX_SOURCE: string =
  invariantPatternsData.dockerfileSuffixRegex;

export interface InvariantMetadata {
  id: string;
  name: string;
  description: string;
  severity: number;
}

export const INVARIANT_METADATA: InvariantMetadata[] = invariantPatternsData.invariants;

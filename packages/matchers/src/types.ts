/** Match type classification — what kind of matcher produced this result. */
export type MatchType = 'EXACT' | 'PREFIX' | 'SUFFIX' | 'GLOB' | 'KEYWORD' | 'REGEX' | 'SET';

/** Structured result returned by all matchers instead of a boolean. */
export interface MatchResult {
  matched: boolean;
  code: number;
  matchType: MatchType;
  patternId: string;
  description?: string;
  severity?: number;
  category?: string;
}

/** Metadata attached to a pattern at compile time. */
export interface PatternMeta {
  patternId: string;
  description: string;
  severity?: number;
  category?: string;
  riskLevel?: 'high' | 'critical';
}

/** A destructive pattern from JSON with its metadata. */
export interface DestructivePatternInput {
  pattern: string;
  description: string;
  riskLevel: 'high' | 'critical';
  category: string;
  flags?: string;
}

/** A git action pattern from JSON with its metadata. */
export interface GitActionPatternInput {
  patterns: string[];
  actionType: string;
}

/** A GitHub action pattern from JSON with its metadata. */
export interface GithubActionPatternInput {
  patterns: string[];
  actionType: string;
}

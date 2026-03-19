import { Trie } from '@tanishiking/aho-corasick';
import { RE2JS } from 're2js';
import type { DestructivePatternInput, GitActionPatternInput, MatchResult } from './types.js';
import { categoryToReasonCode } from './reason-codes.js';

// ─── Internal types ─────────────────────────────────────────────────────────

/** A pattern classified as keyword-extractable (Aho-Corasick fast path). */
interface KeywordEntry {
  keyword: string;
  patternId: string;
  description: string;
  riskLevel: 'high' | 'critical';
  category: string;
  caseInsensitive: boolean;
  /** The original regex pattern for word-boundary verification. */
  verifyRegex: RE2JS;
}

/** A pattern that requires full RE2 regex matching (complex path). */
interface RegexEntry {
  regex: RE2JS;
  patternId: string;
  description: string;
  riskLevel: 'high' | 'critical';
  category: string;
}

/** A compiled git action with its patterns and action type. */
interface GitActionEntry {
  regexes: RE2JS[];
  actionType: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Determine whether a regex pattern is simple enough to extract a literal
 * keyword for Aho-Corasick. Simple patterns use only `\b` anchors and `\s+`
 * whitespace matchers around literal text.
 *
 * Returns the extracted literal (with `\s+` replaced by a single space) or
 * `null` if the pattern is too complex.
 */
function extractLiteral(pattern: string): string | null {
  // Strip leading/trailing word-boundary anchors
  let p = pattern;
  if (p.startsWith('\\b')) p = p.slice(2);
  if (p.endsWith('\\b')) p = p.slice(0, -2);

  // Reject patterns with complex regex features:
  // alternation |, groups (), quantifiers *+?{}, character classes [],
  // lookahead/lookbehind, dot wildcard
  if (/[|()[\]*+?{}.]/.test(p.replace(/\\s\+/g, '').replace(/\\b/g, ''))) {
    return null;
  }

  // After stripping, the remaining should only have literal chars and \s+
  // Replace \s+ with a single space
  const literal = p.replace(/\\s\+/g, ' ');

  // Final sanity: remaining backslashes other than known safe ones indicate complexity
  if (/\\(?!s\+)/.test(literal)) {
    return null;
  }

  return literal.length > 0 ? literal : null;
}

/**
 * Build a unique pattern ID from the category and index.
 */
function makePatternId(category: string, index: number): string {
  return `destructive:${category}:${index}`;
}

/**
 * Compile a RE2JS pattern with optional flags string.
 * Supports 'i' flag for case-insensitive matching.
 */
function compileRe2(pattern: string, flags?: string): RE2JS {
  let flagBits = 0;
  if (flags?.includes('i')) {
    flagBits |= RE2JS.CASE_INSENSITIVE;
  }
  return RE2JS.compile(pattern, flagBits);
}

// ─── CommandScanner ─────────────────────────────────────────────────────────

/**
 * Two-tier command matching system: Aho-Corasick keyword scanning (fast path)
 * with RE2 regex fallback (complex patterns).
 */
export class CommandScanner {
  private readonly keywordTrie: Trie | null;
  private readonly keywordEntries: Map<string, KeywordEntry[]>;
  private readonly regexEntries: RegexEntry[];
  private readonly gitActions: GitActionEntry[];

  private constructor(
    keywordTrie: Trie | null,
    keywordEntries: Map<string, KeywordEntry[]>,
    regexEntries: RegexEntry[],
    gitActions: GitActionEntry[],
  ) {
    this.keywordTrie = keywordTrie;
    this.keywordEntries = keywordEntries;
    this.regexEntries = regexEntries;
    this.gitActions = gitActions;
  }

  /**
   * Create a CommandScanner from destructive and git action patterns.
   *
   * Classifies each destructive pattern as keyword-extractable or complex,
   * builds an Aho-Corasick automaton for keywords, and compiles complex
   * patterns with RE2.
   */
  static create(
    destructive: DestructivePatternInput[],
    git: GitActionPatternInput[],
  ): CommandScanner {
    const keywords: string[] = [];
    const keywordEntries = new Map<string, KeywordEntry[]>();
    const regexEntries: RegexEntry[] = [];

    for (let i = 0; i < destructive.length; i++) {
      const p = destructive[i]!;
      const patternId = makePatternId(p.category, i);
      const isCaseInsensitive = p.flags?.includes('i') ?? false;
      const literal = extractLiteral(p.pattern);

      if (literal !== null) {
        // Aho-Corasick fast path
        const normalizedKeyword = isCaseInsensitive ? literal.toLowerCase() : literal;
        const entry: KeywordEntry = {
          keyword: normalizedKeyword,
          patternId,
          description: p.description,
          riskLevel: p.riskLevel,
          category: p.category,
          caseInsensitive: isCaseInsensitive,
          verifyRegex: compileRe2(p.pattern, p.flags),
        };

        keywords.push(normalizedKeyword);
        const existing = keywordEntries.get(normalizedKeyword);
        if (existing) {
          existing.push(entry);
        } else {
          keywordEntries.set(normalizedKeyword, [entry]);
        }
      } else {
        // Complex pattern — RE2 fallback
        regexEntries.push({
          regex: compileRe2(p.pattern, p.flags),
          patternId,
          description: p.description,
          riskLevel: p.riskLevel,
          category: p.category,
        });
      }
    }

    // Build Aho-Corasick trie from extracted keywords
    const trie =
      keywords.length > 0
        ? new Trie(keywords, { caseInsensitive: true, allowOverlaps: true, onlyWholeWords: false })
        : null;

    // Compile git action patterns
    const gitActions: GitActionEntry[] = git.map((g) => ({
      regexes: g.patterns.map((pat) => compileRe2(pat)),
      actionType: g.actionType,
    }));

    return new CommandScanner(trie, keywordEntries, regexEntries, gitActions);
  }

  /**
   * Scan a command for destructive patterns using the two-tier approach.
   *
   * - Tier 1: Aho-Corasick keyword scan — single O(n) pass over the input
   * - Tier 2: RE2 regex fallback for complex patterns
   *
   * Returns all matches as structured MatchResult objects.
   */
  scanDestructive(command: string): MatchResult[] {
    if (!command) return [];

    const results: MatchResult[] = [];
    const seenPatterns = new Set<string>();

    // ─── Tier 1: Aho-Corasick keyword scan ────────────────────────────────
    if (this.keywordTrie) {
      const emits = this.keywordTrie.parseText(command);
      for (const emit of emits) {
        const keyword = emit.keyword.toLowerCase();
        const entries = this.keywordEntries.get(keyword);
        if (!entries) continue;

        for (const entry of entries) {
          if (seenPatterns.has(entry.patternId)) continue;

          // Verify with the original regex for word-boundary accuracy
          const matcher = entry.verifyRegex.matcher(command);
          if (matcher.find()) {
            seenPatterns.add(entry.patternId);
            results.push({
              matched: true,
              code: categoryToReasonCode(entry.category, 0),
              matchType: 'KEYWORD',
              patternId: entry.patternId,
              description: entry.description,
              severity: entry.riskLevel === 'critical' ? 10 : 7,
              category: entry.category,
            });
          }
        }
      }
    }

    // ─── Tier 1.5: keyword entries missed by Aho-Corasick ────────────────
    // Handles cases where the input has variable whitespace (e.g. "rm  -rf")
    // that doesn't match the normalized keyword literal ("rm -rf").
    for (const entries of this.keywordEntries.values()) {
      for (const entry of entries) {
        if (seenPatterns.has(entry.patternId)) continue;

        const matcher = entry.verifyRegex.matcher(command);
        if (matcher.find()) {
          seenPatterns.add(entry.patternId);
          results.push({
            matched: true,
            code: categoryToReasonCode(entry.category, 0),
            matchType: 'KEYWORD',
            patternId: entry.patternId,
            description: entry.description,
            severity: entry.riskLevel === 'critical' ? 10 : 7,
            category: entry.category,
          });
        }
      }
    }

    // ─── Tier 2: RE2 regex fallback for complex patterns ──────────────────
    for (const entry of this.regexEntries) {
      if (seenPatterns.has(entry.patternId)) continue;

      const matcher = entry.regex.matcher(command);
      if (matcher.find()) {
        seenPatterns.add(entry.patternId);
        results.push({
          matched: true,
          code: categoryToReasonCode(entry.category, 0),
          matchType: 'REGEX',
          patternId: entry.patternId,
          description: entry.description,
          severity: entry.riskLevel === 'critical' ? 10 : 7,
          category: entry.category,
        });
      }
    }

    return results;
  }

  /** Convenience: returns true if the command matches any destructive pattern. */
  isDestructive(command: string): boolean {
    return this.scanDestructive(command).length > 0;
  }

  /**
   * Backward-compatible API: returns the description, riskLevel, and category
   * of the first matched destructive pattern, or null if none matched.
   */
  getDestructiveDetails(
    command: string,
  ): { description: string; riskLevel: 'high' | 'critical'; category: string } | null {
    const results = this.scanDestructive(command);
    if (results.length === 0) return null;

    const first = results[0]!;
    return {
      description: first.description ?? '',
      riskLevel: first.severity === 10 ? 'critical' : 'high',
      category: first.category ?? '',
    };
  }

  /**
   * Scan a command for git action patterns. Returns the first matching action
   * type and its match result, or null if no git action is detected.
   *
   * Patterns are checked in order — more specific patterns (e.g. force-push)
   * should appear before general ones (e.g. push) in the input.
   */
  scanGitAction(
    command: string,
  ): { actionType: string; matchResult: MatchResult } | null {
    if (!command) return null;

    for (const action of this.gitActions) {
      for (const regex of action.regexes) {
        const matcher = regex.matcher(command);
        if (matcher.find()) {
          return {
            actionType: action.actionType,
            matchResult: {
              matched: true,
              code: categoryToReasonCode('git-operation', 0),
              matchType: 'REGEX',
              patternId: `git:${action.actionType}`,
              description: action.actionType,
              category: 'git-operation',
            },
          };
        }
      }
    }

    return null;
  }
}

import { Trie } from '@tanishiking/aho-corasick';
import type {
  DestructivePatternInput,
  GitActionPatternInput,
  GithubActionPatternInput,
  MatchResult,
} from './types.js';
import { categoryToReasonCode } from './reason-codes.js';

// ─── Internal types ─────────────────────────────────────────────────────────

/** A pattern classified as keyword-extractable (Aho-Corasick fast path). */
interface KeywordEntry {
  keyword: string;
  patternId: string;
  description: string;
  riskLevel: 'high' | 'critical';
  category: string;
  /** Native RegExp for word-boundary verification after Aho-Corasick hit. */
  verifyRegex: RegExp;
}

/** A pattern that requires full regex matching (complex path). */
interface RegexEntry {
  regex: RegExp;
  patternId: string;
  description: string;
  riskLevel: 'high' | 'critical';
  category: string;
}

/** A compiled git action with its patterns and action type. */
interface GitActionEntry {
  regexes: RegExp[];
  actionType: string;
}

/** A compiled GitHub action with its patterns and action type. */
interface GithubActionEntry {
  regexes: RegExp[];
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

// ─── Safe subshell stripping ─────────────────────────────────────────────────

/**
 * Known read-only, side-effect-free subshell commands whose substitution forms
 * are always safe to allow in governance scans.
 *
 * Security constraint: each pattern uses [^)(]* in the argument slot, which
 * rejects nested subshells (e.g. `$(date $(rm -rf /))`), preventing bypass.
 * The `(` and `)` characters in `[^)(]` are excluded so the pattern never
 * crosses subshell boundaries.
 *
 * Note: patterns intentionally avoid `(?:\s+[^)(]*)?\s*` constructs — these
 * create polynomial backtracking risk (ReDoS) by introducing ambiguous overlap
 * between whitespace consumers. Using `[^)(]*` directly is both simpler and safe.
 *
 * Included commands:
 *   date     — reads system clock; format strings (+%Y...) are safe
 *   pwd      — reads current working directory
 *   whoami   — reads effective username
 *   hostname — reads system hostname
 *   uname    — reads kernel/system info
 *   id       — reads user/group info
 *   arch     — reads CPU architecture
 *   uptime   — reads system uptime
 *   git rev-parse / git describe — reads git state (commit hash, tag, branch)
 */
const SAFE_SUBSHELL_PATTERNS: RegExp[] = [
  /\$\(\s*date[^)(]*\)/g,
  /\$\(\s*pwd\s*\)/g,
  /\$\(\s*whoami\s*\)/g,
  /\$\(\s*hostname[^)(]*\)/g,
  /\$\(\s*uname[^)(]*\)/g,
  /\$\(\s*id[^)(]*\)/g,
  /\$\(\s*arch\s*\)/g,
  /\$\(\s*uptime[^)(]*\)/g,
  /\$\(\s*git\s+(?:rev-parse|describe)[^)(]*\)/g,
];

/**
 * Strip known safe, read-only subshell expressions from a shell command before
 * destructive pattern scanning.
 *
 * Subshells like `$(date -u +%Y-%m-%dT%H:%M:%SZ)` are pure clock reads with
 * no side effects, but embedding them inside commands (e.g. inside `--body`
 * arguments to `gh pr comment`) can trigger false-positive matches against
 * destructive pattern keywords. This function removes them before scanning so
 * only the structural command content remains.
 *
 * Example:
 *   Input:  `gh pr comment 42 --body "reviewed on $(date -u +%Y-%m-%dT%H:%M:%SZ)"`
 *   Output: `gh pr comment 42 --body "reviewed on "`
 *
 * Destructive commands that contain safe subshells are still detected:
 *   Input:  `rm -rf /tmp/backup-$(date +%Y%m%d)`
 *   Output: `rm -rf /tmp/backup-`   ← rm -rf is still caught
 */
export function stripSafeSubshells(command: string): string {
  if (!command.includes('$(')) return command;
  let result = command;
  for (const pattern of SAFE_SUBSHELL_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result;
}

// ─── Heredoc stripping ──────────────────────────────────────────────────────

/**
 * Strip heredoc bodies from a shell command string before destructive pattern scanning.
 *
 * Heredoc bodies contain file content (not executable shell commands), so scanning
 * them causes false positives when agents write reports or documents that mention
 * blocked command patterns as examples.
 *
 * Given: `cat > /tmp/file.md << 'EOF'\nrm -rf would be bad\nEOF`
 * Returns: `cat > /tmp/file.md << 'EOF'`
 *
 * Handles all heredoc forms: `<<`, `<<-`, `<< 'WORD'`, `<< "WORD"`, `<< WORD`.
 */
export function stripHeredocBodies(command: string): string {
  if (!command.includes('<<')) return command;

  const lines = command.split('\n');
  const resultLines: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    // Match heredoc opener: <<[-] followed by optional whitespace and an optional-quoted delimiter
    const heredocMatch = line.match(/<<-?\s*(['"]?)(\w+)\1/);
    if (heredocMatch) {
      resultLines.push(line);
      const delimiter = heredocMatch[2]!;
      i++;
      // Skip lines until we find the closing delimiter (alone on a line, possibly with leading tabs for <<-)
      while (i < lines.length) {
        const bodyLine = lines[i]!;
        // Closing delimiter may have leading whitespace (for <<-) stripped
        if (bodyLine.trim() === delimiter) {
          // Include the closing delimiter to preserve heredoc structure for downstream parsing
          resultLines.push(bodyLine);
          i++;
          break;
        }
        i++;
      }
    } else {
      resultLines.push(line);
      i++;
    }
  }

  return resultLines.join('\n');
}

// ─── CommandScanner ─────────────────────────────────────────────────────────

/**
 * Two-tier command matching system: Aho-Corasick keyword scanning (fast path)
 * with native RegExp fallback (complex patterns).
 *
 * Uses V8's native RegExp engine for speed while maintaining structured
 * MatchResult output with reason codes and pattern classification.
 */
export class CommandScanner {
  private readonly keywordTrie: Trie | null;
  private readonly keywordEntries: Map<string, KeywordEntry[]>;
  private readonly regexEntries: RegexEntry[];
  private readonly gitActions: GitActionEntry[];
  private readonly githubActions: GithubActionEntry[];

  private constructor(
    keywordTrie: Trie | null,
    keywordEntries: Map<string, KeywordEntry[]>,
    regexEntries: RegexEntry[],
    gitActions: GitActionEntry[],
    githubActions: GithubActionEntry[]
  ) {
    this.keywordTrie = keywordTrie;
    this.keywordEntries = keywordEntries;
    this.regexEntries = regexEntries;
    this.gitActions = gitActions;
    this.githubActions = githubActions;
  }

  /**
   * Create a CommandScanner from destructive and git action patterns.
   *
   * Classifies each destructive pattern as keyword-extractable or complex,
   * builds an Aho-Corasick automaton for keywords, and compiles complex
   * patterns with native RegExp.
   */
  static create(
    destructive: DestructivePatternInput[],
    git: GitActionPatternInput[],
    github: GithubActionPatternInput[] = []
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
          verifyRegex: new RegExp(p.pattern, p.flags ?? ''),
        };

        keywords.push(normalizedKeyword);
        const existing = keywordEntries.get(normalizedKeyword);
        if (existing) {
          existing.push(entry);
        } else {
          keywordEntries.set(normalizedKeyword, [entry]);
        }
      } else {
        // Complex pattern — native RegExp
        regexEntries.push({
          regex: new RegExp(p.pattern, p.flags ?? ''),
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

    // Compile git action patterns with native RegExp
    const gitActions: GitActionEntry[] = git.map((g) => ({
      regexes: g.patterns.map((pat) => new RegExp(pat)),
      actionType: g.actionType,
    }));

    // Compile GitHub action patterns with native RegExp
    const githubActions: GithubActionEntry[] = github.map((g) => ({
      regexes: g.patterns.map((pat) => new RegExp(pat)),
      actionType: g.actionType,
    }));

    return new CommandScanner(trie, keywordEntries, regexEntries, gitActions, githubActions);
  }

  /**
   * Scan a command for destructive patterns using the two-tier approach.
   *
   * - Tier 1: Aho-Corasick keyword scan — single O(n) pass, then verify
   *   word boundaries with native RegExp
   * - Tier 1.5: Regex sweep for keyword entries missed by Aho-Corasick
   *   (e.g. variable whitespace "rm  -rf" vs "rm -rf")
   * - Tier 2: Native RegExp for complex patterns
   *
   * Returns all matches as structured MatchResult objects.
   */
  scanDestructive(command: string): MatchResult[] {
    if (!command) return [];

    // Strip heredoc bodies then safe subshells — both contain content that is
    // not executable shell structure and would cause false positives.
    const scanTarget = stripSafeSubshells(stripHeredocBodies(command));

    const results: MatchResult[] = [];
    const seenPatterns = new Set<string>();

    // ─── Tier 1: Aho-Corasick keyword scan ────────────────────────────────
    if (this.keywordTrie) {
      const emits = this.keywordTrie.parseText(scanTarget);
      for (const emit of emits) {
        const keyword = emit.keyword.toLowerCase();
        const entries = this.keywordEntries.get(keyword);
        if (!entries) continue;

        for (const entry of entries) {
          if (seenPatterns.has(entry.patternId)) continue;

          // Verify with the original regex for word-boundary accuracy
          if (entry.verifyRegex.test(scanTarget)) {
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

        if (entry.verifyRegex.test(scanTarget)) {
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

    // ─── Tier 2: Native RegExp for complex patterns ──────────────────────
    for (const entry of this.regexEntries) {
      if (seenPatterns.has(entry.patternId)) continue;

      if (entry.regex.test(scanTarget)) {
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
    command: string
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
  scanGitAction(command: string): { actionType: string; matchResult: MatchResult } | null {
    if (!command) return null;

    for (const action of this.gitActions) {
      for (const regex of action.regexes) {
        if (regex.test(command)) {
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

  /**
   * Scan a command for GitHub action patterns. Returns the first matching action
   * type and its match result, or null if no GitHub action is detected.
   *
   * Patterns are checked in order — more specific patterns should appear before
   * general ones in the input.
   */
  scanGithubAction(command: string): { actionType: string; matchResult: MatchResult } | null {
    if (!command) return null;

    for (const action of this.githubActions) {
      for (const regex of action.regexes) {
        if (regex.test(command)) {
          return {
            actionType: action.actionType,
            matchResult: {
              matched: true,
              code: categoryToReasonCode('github-operation', 0),
              matchType: 'REGEX',
              patternId: `github:${action.actionType}`,
              description: action.actionType,
              category: 'github-operation',
            },
          };
        }
      }
    }

    return null;
  }
}

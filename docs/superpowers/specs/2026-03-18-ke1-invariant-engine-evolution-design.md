# KE-1: Invariant Engine Evolution — Design Spec

**Date**: 2026-03-18
**Status**: Approved
**Author**: Human + Claude
**Phase**: Kernel Evolution Sprint — Phase 1 of 6

---

## Problem

AgentGuard's enforcement hot path uses 150+ regex patterns for security decisions:
- **AAB** (`aab.ts`): 93 destructive command patterns + 5 git patterns tested sequentially via `RegExp.test()`
- **Invariants** (`definitions.ts`): 52+ regex patterns for transitive effects, permission escalation, network detection, SQL injection
- **Policy evaluator** (`evaluator.ts`): 15+ `array.includes()` set membership checks (no regex, but O(n) scans)

### Risks with current approach
1. **ReDoS vulnerability** — Patterns with alternation can cause catastrophic backtracking on crafted inputs
2. **O(n×m) scanning** — 98 sequential `.test()` calls per command in AAB (n=patterns, m=input length)
3. **Uncached compilation** — Invariant regex (env file, dockerfile) recompiled on every check
4. **No structured results** — Match results are boolean; no machine-readable reason codes for downstream consumers

---

## Solution

New package `packages/matchers/` providing three compiled matcher types, backed by proven OSS libraries:

| Matcher | Backing Library | Replaces | Hot Path Location |
|---------|----------------|----------|-------------------|
| `CommandScanner` | `@tanishiking/aho-corasick` + `re2js` | Sequential `RegExp.test()` loops | `aab.ts` |
| `PathMatcher` | `picomatch` | `.startsWith()` / `.endsWith()` / `.includes()` chains | `definitions.ts`, `evaluator.ts` |
| `PolicyMatcher` | Built-in `Set` / `Map` | `array.includes()` membership checks | `evaluator.ts` |

### Dependencies

| Package | Version | Size | Purpose |
|---------|---------|------|---------|
| `re2js` | ^1.x | ~45KB | Linear-time regex (Google RE2 port), ReDoS-safe |
| `picomatch` | ^4.x | ~15KB | Glob pattern compilation, zero deps |
| `@tanishiking/aho-corasick` | ^1.x | ~8KB | Multi-pattern string matching in O(n) |

All three are pure JavaScript with zero native bindings (no build step, no platform issues).

---

## Architecture

### Package Structure

```
packages/matchers/
├── src/
│   ├── index.ts              # Public API re-exports
│   ├── command-scanner.ts    # Aho-Corasick + RE2 command matching
│   ├── path-matcher.ts       # picomatch-based file path matching
│   ├── policy-matcher.ts     # Set/Map for policy membership checks
│   ├── reason-codes.ts       # Machine-readable reason code registry
│   └── types.ts              # MatchResult, MatchType, ReasonCode types
├── tests/
│   ├── command-scanner.test.ts
│   ├── path-matcher.test.ts
│   ├── policy-matcher.test.ts
│   └── benchmark.test.ts     # Performance regression tests
├── package.json
└── tsconfig.json
```

### Match Result Contract

Every matcher returns a structured `MatchResult` instead of a boolean:

```typescript
interface MatchResult {
  matched: boolean;
  code: number;           // Machine-readable reason code (e.g., 4001)
  matchType: MatchType;   // 'EXACT' | 'PREFIX' | 'GLOB' | 'KEYWORD' | 'REGEX'
  patternId: string;      // Which pattern triggered (e.g., 'destructive:rm-rf')
  description?: string;   // Human-readable reason
  severity?: number;      // Risk severity (1-5)
}

type MatchType = 'EXACT' | 'PREFIX' | 'SUFFIX' | 'GLOB' | 'KEYWORD' | 'REGEX' | 'SET';
```

---

## Component Design

### 1. CommandScanner

Replaces sequential regex scanning in AAB with a two-tier matching system.

**Tier 1 — Aho-Corasick keyword scan (fast path)**:
- Extract literal keywords from destructive patterns (e.g., `rm -rf` from `\brm\s+-rf\b`)
- Build Aho-Corasick automaton from all extracted keywords at module load
- On each command: single O(n) scan finds all keyword hits
- Post-match: verify word boundaries (check chars before/after each hit are non-word chars or whitespace)
- Expected to resolve ~70% of patterns without any regex

**Tier 2 — RE2 regex fallback (complex patterns)**:
- Patterns with alternation, quantifiers, or capture groups that can't be reduced to keywords
- Compiled as `RE2` instances (linear-time, ReDoS-safe) instead of `RegExp`
- Only invoked if Tier 1 doesn't match (short-circuit on first Tier 1 hit for deny decisions)

```typescript
class CommandScanner {
  private automaton: AhoCorasick;
  private regexFallbacks: Array<{ pattern: RE2; meta: PatternMeta }>;

  constructor(patterns: DestructivePattern[]) {
    const { keywords, complex } = classifyPatterns(patterns);
    this.automaton = new AhoCorasick(keywords.map(k => k.literal));
    this.regexFallbacks = complex.map(p => ({
      pattern: new RE2(p.pattern, p.flags),
      meta: p.meta,
    }));
  }

  scan(command: string): MatchResult[] {
    const results: MatchResult[] = [];
    // Tier 1: Aho-Corasick keyword scan
    const hits = this.automaton.search(command.toLowerCase());
    for (const hit of hits) {
      if (verifyWordBoundary(command, hit)) {
        results.push(toMatchResult(hit, 'KEYWORD'));
      }
    }
    // Tier 2: RE2 fallback for complex patterns (only if needed)
    if (results.length === 0) {
      for (const { pattern, meta } of this.regexFallbacks) {
        if (pattern.test(command)) {
          results.push(toMatchResult(meta, 'REGEX'));
          break; // First match sufficient for deny
        }
      }
    }
    return results;
  }
}
```

**Pattern classification heuristic** (`classifyPatterns`):
- If pattern is `\b<literal>\b` or `\b<literal>\s+<literal>\b` → extract literal, use Aho-Corasick
- If pattern contains `|`, `*`, `+`, `{`, `(` beyond simple word boundaries → RE2 fallback
- If pattern is case-insensitive (`i` flag) → lowercase the literal for Aho-Corasick

### 2. PathMatcher

Replaces manual string-based file path matching in invariant definitions with compiled glob matchers.

```typescript
class PathMatcher {
  private matchers: Array<{ test: (path: string) => boolean; meta: PatternMeta }>;

  constructor(patterns: PathPattern[]) {
    this.matchers = patterns.map(p => ({
      test: picomatch(p.glob, { dot: true }),
      meta: { patternId: p.id, description: p.description, severity: p.severity },
    }));
  }

  match(filePath: string): MatchResult | null {
    const normalized = filePath.replace(/\\/g, '/');
    for (const { test, meta } of this.matchers) {
      if (test(normalized)) {
        return toMatchResult(meta, 'GLOB');
      }
    }
    return null;
  }
}
```

**Pattern migration** (definitions.ts string patterns → globs):

| Current Pattern | Glob Equivalent |
|----------------|-----------------|
| `path.includes('.env')` | `**/.env*` |
| `path.endsWith('.key')` | `**/*.key` |
| `path.startsWith('.github/workflows/')` | `.github/workflows/**` |
| `path.includes('credentials')` | `**/*credentials*` |
| `lower.includes('dockerfile')` | `**/[Dd]ockerfile*` or `**/*.dockerfile` |
| `basename === 'agentguard.yaml'` | `**/agentguard.yaml` (EXACT via Set) |

### 3. PolicyMatcher

Replaces array scans with O(1) Set lookups in the policy evaluator.

```typescript
class PolicyMatcher {
  private branchSet: Set<string>;
  private roleSet: Set<string>;
  private trustTierSet: Set<string>;
  private scopeMatchers: Array<{ test: (path: string) => boolean; pattern: string }>;

  constructor(policy: PolicyRules) {
    this.branchSet = new Set(policy.branches ?? []);
    this.roleSet = new Set(policy.roles ?? []);
    this.trustTierSet = new Set(policy.trustTiers ?? []);
    this.scopeMatchers = (policy.scopes ?? []).map(s => ({
      test: picomatch(s, { dot: true }),
      pattern: s,
    }));
  }

  matchBranch(branch: string): boolean { return this.branchSet.has(branch); }
  matchRole(role: string): boolean { return this.roleSet.has(role); }
  matchScope(filePath: string): MatchResult | null { /* picomatch check */ }
}
```

---

## Integration Plan

### Phase A: Add `packages/matchers/` package (no behavioral changes)

1. Create package with `CommandScanner`, `PathMatcher`, `PolicyMatcher`
2. Define `MatchResult` types and reason code registry
3. Write comprehensive tests (correctness + benchmark)
4. Register in workspace (`pnpm-workspace.yaml`, `tsconfig.json` references)

### Phase B: Wire into AAB (`packages/kernel/src/aab.ts`)

1. Replace `getDestructivePatterns()` → `CommandScanner` in `normalizeIntent()`
2. Replace sequential `p.test(trimmed)` / `p.pattern.test(command)` loops with `scanner.scan(command)`
3. Propagate `MatchResult` through AAB return types (backward-compatible: existing boolean checks still work)
4. Update `governance-data.ts` to export pattern metadata alongside compiled patterns

### Phase C: Wire into invariants (`packages/invariants/src/definitions.ts`)

1. Replace uncached `new RegExp()` calls with precompiled `PathMatcher` instances
2. Replace `.includes()` / `.startsWith()` / `.endsWith()` chains with `PathMatcher.match()`
3. Replace transitive effect regex array with `CommandScanner` (reuse for script content scanning)
4. Cache all matchers at module level (compile once, reuse)

### Phase D: Wire into policy evaluator (`packages/policy/src/evaluator.ts`)

1. Replace `array.includes()` calls with `Set.has()` via `PolicyMatcher`
2. Replace `matchScope()` string operations with `PathMatcher`
3. Replace `matchAction()` prefix/suffix logic with compiled matchers

### Phase E: Benchmark and validate

1. Run existing test suite — all must pass (behavioral equivalence)
2. Run `benchmark_suite` — compare against baseline:
   - AAB destructive scan: target 50% reduction in p95
   - Invariant check: target 30% reduction in p95
   - Policy eval: target 20% reduction in p95
3. Overall enforcement hook: p50 < 0.25ms, p95 < 0.75ms, p99 < 1.5ms
4. Verify zero ReDoS vulnerability (re2js guarantees linear time)

---

## Reason Code Registry

Machine-readable codes for all match categories:

| Range | Category | Examples |
|-------|----------|---------|
| 1000-1999 | Destructive command | 1001: rm-rf, 1002: mkfs, 1003: dd |
| 2000-2999 | Git operation | 2001: force-push, 2002: branch-delete |
| 3000-3999 | File sensitivity | 3001: env-file, 3002: credential-file, 3003: ssh-key |
| 4000-4999 | Policy violation | 4001: protected-branch, 4002: scope-violation |
| 5000-5999 | Invariant trigger | 5001: secret-exposure, 5002: cicd-modification |
| 6000-6999 | Network/egress | 6001: curl, 6002: wget, 6003: netcat |
| 7000-7999 | Permission escalation | 7001: chmod-777, 7002: setuid, 7003: chown |
| 8000-8999 | Transitive effect | 8001: script-rm, 8002: script-curl, 8003: script-eval |
| 9000-9999 | Infrastructure | 9001: terraform-destroy, 9002: kubectl-delete |

---

## Performance Targets

| Metric | Current (estimated) | Target | Mechanism |
|--------|-------------------|--------|-----------|
| AAB destructive scan (93 patterns) | ~500µs p50 | < 100µs p50 | Aho-Corasick single-pass vs 93 sequential regex |
| Invariant regex compilation | ~200µs per check | 0µs (cached) | Precompiled at module load |
| Policy set membership | O(n) per check | O(1) | Set.has() vs array.includes() |
| ReDoS worst case | Unbounded | O(n) guaranteed | re2js linear-time engine |
| Cold start (pattern compilation) | ~5ms | < 15ms | One-time cost at startup |

---

## Backward Compatibility

- All existing tests must pass without modification
- `MatchResult` is additive — existing code that checks `boolean` continues to work
- Pattern JSON files (`destructive-patterns.json`, `invariant-patterns.json`) unchanged
- `governance-data.ts` exports remain the same; internal implementation changes only
- Policy YAML format unchanged

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Aho-Corasick keyword extraction misses patterns | Tier 2 RE2 fallback catches everything Aho-Corasick misses |
| re2js doesn't support a pattern feature | Audit confirmed: no backreferences or lookaheads in current patterns |
| picomatch glob semantics differ from manual string checks | Comprehensive test suite validates equivalence for every current pattern |
| Performance regression in edge cases | Benchmark suite runs in CI; regression > 10% blocks merge |
| New dependency supply chain risk | All three libs are pure JS, well-maintained, widely used (picomatch: 5M+ dependents) |

---

## Success Criteria

1. ✅ 90%+ of regex patterns replaced with structured matchers (Aho-Corasick keywords or compiled globs)
2. ✅ Zero ReDoS vulnerability (re2js for all remaining regex)
3. ✅ Machine-readable reason codes on all match results
4. ✅ All existing tests pass (behavioral equivalence)
5. ✅ Enforcement hook p50 < 0.25ms
6. ✅ Performance regression gate active in CI

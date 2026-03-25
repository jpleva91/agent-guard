// Educate-mode lesson system — captures governance learnings for agent memory
// When the kernel evaluates an action in educate mode, it generates a structured
// lesson instead of blocking. These lessons accumulate in squad learnings.json
// and get loaded into agent context on future sessions, creating a feedback loop
// where agents improve over time without hard governance blocks.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

/** A single lesson learned from an educate-mode evaluation */
export interface Lesson {
  /** Unique lesson ID (hash of pattern + action) */
  readonly id: string;
  /** What action was attempted */
  readonly action: string;
  /** What governance rule triggered the lesson */
  readonly rule: string;
  /** Why this action is risky — human-readable explanation */
  readonly why: string;
  /** What the agent should do instead */
  readonly instead: string;
  /** Corrected command if applicable */
  readonly correctedCommand?: string;
  /** Severity: how important is this lesson */
  readonly severity: 'info' | 'warning' | 'critical';
  /** Pattern tag for deduplication and categorization */
  readonly pattern: string;
  /** How many times this lesson has been triggered */
  readonly hitCount: number;
  /** First seen timestamp */
  readonly firstSeen: string;
  /** Last seen timestamp */
  readonly lastSeen: string;
  /** Agent identity that triggered it */
  readonly agentId: string;
  /** Squad this lesson belongs to */
  readonly squad: string;
}

/** Input for generating a lesson from a governance decision */
export interface LessonInput {
  readonly action: string;
  readonly actionType?: string;
  readonly tool?: string;
  readonly target?: string;
  readonly rule: string;
  readonly reason: string;
  readonly suggestion?: string;
  readonly correctedCommand?: string;
  readonly severity?: 'info' | 'warning' | 'critical';
  readonly agentId: string;
  readonly squad: string;
}

/** Lesson store — read/write learnings for a squad */
export interface LessonStore {
  readonly lessons: readonly Lesson[];
  readonly version: string;
  readonly lastUpdated: string;
}

/** Format used to inject lessons into agent context */
export interface LessonContext {
  /** Number of lessons loaded */
  readonly count: number;
  /** Formatted text block for agent consumption */
  readonly text: string;
  /** Top lessons by hit count */
  readonly topLessons: readonly Lesson[];
}

// ── Lesson generation ──

/** Generate a lesson ID from pattern + action (deterministic) */
function lessonId(pattern: string, action: string): string {
  let hash = 0;
  const str = `${pattern}:${action}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `lesson-${Math.abs(hash).toString(36)}`;
}

/** Derive a pattern tag from the action and rule */
function derivePattern(input: LessonInput): string {
  // Combine action class + rule name for grouping
  const actionClass = input.action.split('.')[0] ?? 'unknown';
  const ruleSlug = input.rule
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${actionClass}:${ruleSlug}`;
}

/** Infer severity from the rule reason and action type */
function inferSeverity(input: LessonInput): 'info' | 'warning' | 'critical' {
  if (input.severity) return input.severity;

  const reason = input.reason.toLowerCase();
  if (reason.includes('secret') || reason.includes('credential') || reason.includes('force push')) {
    return 'critical';
  }
  if (reason.includes('protected') || reason.includes('destructive') || reason.includes('deploy')) {
    return 'warning';
  }
  return 'info';
}

/** Generate a lesson from a governance decision */
export function generateLesson(input: LessonInput): Lesson {
  const pattern = derivePattern(input);
  const now = new Date().toISOString();

  return {
    id: lessonId(pattern, input.action),
    action: input.action,
    rule: input.rule,
    why: input.reason,
    instead: input.suggestion ?? 'Follow the governance policy for this action type.',
    correctedCommand: input.correctedCommand,
    severity: inferSeverity(input),
    pattern,
    hitCount: 1,
    firstSeen: now,
    lastSeen: now,
    agentId: input.agentId,
    squad: input.squad,
  };
}

// ── Lesson store operations ──

/** Merge a new lesson into an existing store (dedupe by ID, increment hitCount) */
export function mergeLesson(store: LessonStore, lesson: Lesson): LessonStore {
  const now = new Date().toISOString();
  const existing = store.lessons.find((l) => l.id === lesson.id);

  if (existing) {
    // Update hit count and last seen
    const updated = store.lessons.map((l) =>
      l.id === lesson.id ? { ...l, hitCount: l.hitCount + 1, lastSeen: now } : l
    );
    return { ...store, lessons: updated, lastUpdated: now };
  }

  // New lesson — append
  return {
    ...store,
    lessons: [...store.lessons, lesson],
    lastUpdated: now,
  };
}

/** Create an empty lesson store */
export function emptyLessonStore(): LessonStore {
  return {
    lessons: [],
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
  };
}

// ── Lesson context formatting ──

/** Format lessons for injection into agent context */
export function formatLessonContext(
  store: LessonStore,
  options?: {
    maxLessons?: number;
    minSeverity?: 'info' | 'warning' | 'critical';
  }
): LessonContext {
  const maxLessons = options?.maxLessons ?? 20;
  const minSeverity = options?.minSeverity ?? 'info';

  const severityOrder = { info: 0, warning: 1, critical: 2 };
  const minLevel = severityOrder[minSeverity];

  // Filter and sort: critical first, then by hit count
  const filtered = store.lessons
    .filter((l) => severityOrder[l.severity] >= minLevel)
    .sort((a, b) => {
      const sa = severityOrder[a.severity];
      const sb = severityOrder[b.severity];
      if (sa !== sb) return sb - sa;
      return b.hitCount - a.hitCount;
    })
    .slice(0, maxLessons);

  if (filtered.length === 0) {
    return { count: 0, text: '', topLessons: [] };
  }

  // Build formatted text block
  const lines: string[] = [
    '## Governance Learnings',
    '',
    'These are lessons from previous sessions. Follow them to avoid governance issues:',
    '',
  ];

  for (const lesson of filtered) {
    const icon =
      lesson.severity === 'critical'
        ? '[CRITICAL]'
        : lesson.severity === 'warning'
          ? '[WARNING]'
          : '[INFO]';
    lines.push(`- ${icon} **${lesson.rule}**: ${lesson.why}`);
    lines.push(`  Instead: ${lesson.instead}`);
    if (lesson.correctedCommand) {
      lines.push(`  Use: \`${lesson.correctedCommand}\``);
    }
    if (lesson.hitCount > 1) {
      lines.push(`  (triggered ${lesson.hitCount} times)`);
    }
    lines.push('');
  }

  return {
    count: filtered.length,
    text: lines.join('\n'),
    topLessons: filtered,
  };
}

// ── File I/O for lesson stores ──

/** Read a squad's learnings.json and parse as LessonStore */
export function readLessonStore(root: string, squad: string): LessonStore {
  const path = `${root}/.agentguard/squads/${squad}/learnings.json`;
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw);
    // Handle both old format (array) and new format (LessonStore)
    if (Array.isArray(parsed)) {
      return { lessons: parsed, version: '1.0.0', lastUpdated: new Date().toISOString() };
    }
    return parsed as LessonStore;
  } catch {
    return emptyLessonStore();
  }
}

/** Write a LessonStore to squad's learnings.json */
export function writeLessonStore(root: string, squad: string, store: LessonStore): void {
  const dir = `${root}/.agentguard/squads/${squad}`;
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(`${dir}/learnings.json`, JSON.stringify(store, null, 2), 'utf8');
}

// ── Bridge: denial-learner patterns → lessons ──

/** Shape of DenialPattern from @red-codes/storage denial-learner */
export interface DenialPatternLike {
  readonly actionType: string;
  readonly reason: string;
  readonly occurrences: number;
  readonly confidence: number;
  readonly resolution: string;
  readonly sessions: readonly string[];
  readonly suggestion?: string;
}

/** Convert denial patterns from the denial-learner into lessons for squad memory.
 *  High-confidence patterns (0.8+) become critical lessons. */
export function patternsToLessons(
  patterns: readonly DenialPatternLike[],
  context: { agentId: string; squad: string }
): Lesson[] {
  return patterns.map((p) => {
    // Map confidence to severity
    let severity: 'info' | 'warning' | 'critical';
    if (p.confidence >= 0.8) severity = 'critical';
    else if (p.confidence >= 0.5) severity = 'warning';
    else severity = 'info';

    return generateLesson({
      action: p.actionType,
      rule: p.reason,
      reason: p.reason,
      suggestion: p.suggestion,
      severity,
      agentId: context.agentId,
      squad: context.squad,
    });
  });
}

/** Run the full denial-learner → lesson pipeline: analyze patterns and merge into squad store */
export function learnFromDenials(
  patterns: readonly DenialPatternLike[],
  root: string,
  squad: string,
  agentId: string
): { lessonsAdded: number; totalLessons: number } {
  const lessons = patternsToLessons(patterns, { agentId, squad });
  let store = readLessonStore(root, squad);

  for (const lesson of lessons) {
    store = mergeLesson(store, lesson);
  }

  writeLessonStore(root, squad, store);

  return {
    lessonsAdded: lessons.length,
    totalLessons: store.lessons.length,
  };
}

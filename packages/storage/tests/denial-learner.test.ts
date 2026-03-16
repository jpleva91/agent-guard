import { describe, it, expect } from 'vitest';
import {
  groupDenialsByPattern,
  classifyResolution,
  scoreDenialConfidence,
  suggestPolicyChanges,
  analyzeDenialPatterns,
} from '@red-codes/storage';
import type { DenialEvent, DenialPattern } from '@red-codes/storage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDenial(
  actionType: string,
  reason: string,
  runId: string,
  timestamp = 1000,
  extra: Partial<DenialEvent> = {},
): DenialEvent {
  return { actionType, reason, timestamp, runId, ...extra };
}

// ---------------------------------------------------------------------------
// groupDenialsByPattern
// ---------------------------------------------------------------------------

describe('groupDenialsByPattern', () => {
  it('groups by actionType + reason composite key', () => {
    const events: DenialEvent[] = [
      makeDenial('git.push', 'protected branch', 'run1', 1000),
      makeDenial('git.push', 'protected branch', 'run2', 2000),
      makeDenial('file.write', 'credential file creation', 'run1', 3000),
    ];

    const groups = groupDenialsByPattern(events);

    expect(groups.size).toBe(2);
    expect(groups.get('git.push::protected branch')).toHaveLength(2);
    expect(groups.get('file.write::credential file creation')).toHaveLength(1);
  });

  it('handles a single event', () => {
    const events: DenialEvent[] = [makeDenial('shell.exec', 'blast radius exceeded', 'run1')];

    const groups = groupDenialsByPattern(events);

    expect(groups.size).toBe(1);
    expect(groups.get('shell.exec::blast radius exceeded')).toHaveLength(1);
  });

  it('handles empty array', () => {
    const groups = groupDenialsByPattern([]);
    expect(groups.size).toBe(0);
  });

  it('creates separate groups for same actionType with different reasons', () => {
    const events: DenialEvent[] = [
      makeDenial('git.push', 'protected branch', 'run1'),
      makeDenial('git.push', 'no force push', 'run1'),
    ];

    const groups = groupDenialsByPattern(events);

    expect(groups.size).toBe(2);
  });

  it('groups multiple events in same session under same key', () => {
    const events: DenialEvent[] = [
      makeDenial('file.write', '.env detected', 'run1', 1000),
      makeDenial('file.write', '.env detected', 'run1', 2000),
      makeDenial('file.write', '.env detected', 'run1', 3000),
    ];

    const groups = groupDenialsByPattern(events);

    expect(groups.size).toBe(1);
    expect(groups.get('file.write::.env detected')).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// classifyResolution
// ---------------------------------------------------------------------------

describe('classifyResolution', () => {
  it('detects retried_differently when ActionAllowed follows denial for same actionType', () => {
    const events: DenialEvent[] = [makeDenial('git.push', 'protected branch', 'run1', 1000)];

    const allEvents = [
      { kind: 'ActionDenied', actionType: 'git.push', timestamp: 1000, runId: 'run1' },
      { kind: 'ActionAllowed', actionType: 'git.push', timestamp: 3000, runId: 'run1' },
    ];

    const result = classifyResolution(events, allEvents);
    expect(result).toBe('retried_differently');
  });

  it('does not classify as retried_differently when allowed event is in a different session', () => {
    const events: DenialEvent[] = [makeDenial('git.push', 'protected branch', 'run1', 1000)];

    const allEvents = [
      { kind: 'ActionAllowed', actionType: 'git.push', timestamp: 3000, runId: 'run2' }, // different session
    ];

    const result = classifyResolution(events, allEvents);
    expect(result).toBe('session_abandoned');
  });

  it('detects session_abandoned when denial is the last significant action', () => {
    const events: DenialEvent[] = [makeDenial('git.push', 'protected branch', 'run1', 1000)];

    // No subsequent events after the denial
    const allEvents = [
      { kind: 'ActionDenied', actionType: 'git.push', timestamp: 1000, runId: 'run1' },
    ];

    const result = classifyResolution(events, allEvents);
    expect(result).toBe('session_abandoned');
  });

  it('detects escalation_granted when ActionEscalated follows denial', () => {
    const events: DenialEvent[] = [makeDenial('git.push', 'protected branch', 'run1', 1000)];

    const allEvents = [
      { kind: 'ActionDenied', actionType: 'git.push', timestamp: 1000, runId: 'run1' },
      { kind: 'ActionEscalated', actionType: 'git.push', timestamp: 2000, runId: 'run1' },
    ];

    const result = classifyResolution(events, allEvents);
    expect(result).toBe('escalation_granted');
  });

  it('prefers escalation_granted over retried_differently', () => {
    const events: DenialEvent[] = [makeDenial('git.push', 'protected branch', 'run1', 1000)];

    const allEvents = [
      { kind: 'ActionDenied', actionType: 'git.push', timestamp: 1000, runId: 'run1' },
      { kind: 'ActionEscalated', actionType: 'git.push', timestamp: 1500, runId: 'run1' },
      { kind: 'ActionAllowed', actionType: 'git.push', timestamp: 3000, runId: 'run1' },
    ];

    const result = classifyResolution(events, allEvents);
    expect(result).toBe('escalation_granted');
  });

  it('returns session_abandoned for empty events array', () => {
    const result = classifyResolution([], []);
    expect(result).toBe('session_abandoned');
  });

  it('checks cross-session for retried_differently', () => {
    const events: DenialEvent[] = [
      makeDenial('file.write', 'large file', 'run1', 1000),
      makeDenial('file.write', 'large file', 'run2', 2000),
    ];

    const allEvents = [
      { kind: 'ActionAllowed', actionType: 'file.write', timestamp: 3000, runId: 'run2' },
    ];

    const result = classifyResolution(events, allEvents);
    expect(result).toBe('retried_differently');
  });
});

// ---------------------------------------------------------------------------
// scoreDenialConfidence
// ---------------------------------------------------------------------------

describe('scoreDenialConfidence', () => {
  it('returns high confidence (0.8+) for 3+ occurrences across 2+ sessions', () => {
    const events: DenialEvent[] = [
      makeDenial('git.push', 'protected branch', 'run1', 1000),
      makeDenial('git.push', 'protected branch', 'run2', 2000),
      makeDenial('git.push', 'protected branch', 'run3', 3000),
    ];

    const score = scoreDenialConfidence(events);
    expect(score).toBeGreaterThanOrEqual(0.8);
  });

  it('returns low confidence (< 0.5) for single occurrence', () => {
    const events: DenialEvent[] = [makeDenial('git.push', 'protected branch', 'run1')];

    const score = scoreDenialConfidence(events);
    expect(score).toBeLessThan(0.5);
  });

  it('returns 0 for empty events array', () => {
    const score = scoreDenialConfidence([]);
    expect(score).toBe(0);
  });

  it('returns medium confidence for 2 occurrences in same session', () => {
    const events: DenialEvent[] = [
      makeDenial('file.write', 'credential file', 'run1', 1000),
      makeDenial('file.write', 'credential file', 'run1', 2000),
    ];

    const score = scoreDenialConfidence(events);
    expect(score).toBeGreaterThanOrEqual(0.5);
    expect(score).toBeLessThan(0.8);
  });

  it('returns medium confidence for 2 occurrences in 2 sessions', () => {
    const events: DenialEvent[] = [
      makeDenial('shell.exec', 'blast radius', 'run1', 1000),
      makeDenial('shell.exec', 'blast radius', 'run2', 2000),
    ];

    const score = scoreDenialConfidence(events);
    expect(score).toBeGreaterThanOrEqual(0.5);
    expect(score).toBeLessThan(0.8);
  });

  it('scales up confidence with more occurrences', () => {
    const few: DenialEvent[] = [
      makeDenial('git.push', 'protected branch', 'run1', 1000),
      makeDenial('git.push', 'protected branch', 'run2', 2000),
      makeDenial('git.push', 'protected branch', 'run3', 3000),
    ];

    const many: DenialEvent[] = [
      ...few,
      makeDenial('git.push', 'protected branch', 'run4', 4000),
      makeDenial('git.push', 'protected branch', 'run5', 5000),
      makeDenial('git.push', 'protected branch', 'run6', 6000),
    ];

    expect(scoreDenialConfidence(many)).toBeGreaterThanOrEqual(scoreDenialConfidence(few));
  });

  it('caps at 1.0', () => {
    const events: DenialEvent[] = Array.from({ length: 50 }, (_, i) =>
      makeDenial('git.push', 'protected branch', `run${i}`, i * 1000),
    );

    const score = scoreDenialConfidence(events);
    expect(score).toBeLessThanOrEqual(1.0);
  });
});

// ---------------------------------------------------------------------------
// suggestPolicyChanges
// ---------------------------------------------------------------------------

describe('suggestPolicyChanges', () => {
  it('suggests allow_rule for retried_differently with high confidence', () => {
    const patterns: DenialPattern[] = [
      {
        actionType: 'git.push',
        reason: 'protected branch',
        occurrences: 5,
        resolution: 'retried_differently',
        confidence: 0.85,
        sessions: ['run1', 'run2', 'run3'],
      },
    ];

    const suggestions = suggestPolicyChanges(patterns);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.type).toBe('allow_rule');
    expect(suggestions[0]!.actionType).toBe('git.push');
    expect(suggestions[0]!.confidence).toBeGreaterThan(0.5);
  });

  it('suggests scope_expansion for high-confidence session_abandoned', () => {
    const patterns: DenialPattern[] = [
      {
        actionType: 'file.write',
        reason: 'credential file creation',
        occurrences: 4,
        resolution: 'session_abandoned',
        confidence: 0.82,
        sessions: ['run1', 'run2'],
      },
    ];

    const suggestions = suggestPolicyChanges(patterns);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.type).toBe('scope_expansion');
  });

  it('notes working_as_intended for lower-confidence session_abandoned', () => {
    const patterns: DenialPattern[] = [
      {
        actionType: 'infra.destroy',
        reason: 'destructive operation',
        occurrences: 2,
        resolution: 'session_abandoned',
        confidence: 0.6,
        sessions: ['run1'],
      },
    ];

    const suggestions = suggestPolicyChanges(patterns);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.type).toBe('working_as_intended');
  });

  it('suggests threshold_adjustment for escalation_granted', () => {
    const patterns: DenialPattern[] = [
      {
        actionType: 'git.push',
        reason: 'blast radius exceeded',
        occurrences: 3,
        resolution: 'escalation_granted',
        confidence: 0.75,
        sessions: ['run1', 'run2'],
      },
    ];

    const suggestions = suggestPolicyChanges(patterns);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.type).toBe('threshold_adjustment');
  });

  it('skips low-confidence patterns (confidence <= 0.5)', () => {
    const patterns: DenialPattern[] = [
      {
        actionType: 'git.push',
        reason: 'protected branch',
        occurrences: 1,
        resolution: 'retried_differently',
        confidence: 0.35,
        sessions: ['run1'],
      },
    ];

    const suggestions = suggestPolicyChanges(patterns);

    expect(suggestions).toHaveLength(0);
  });

  it('skips exactly 0.5 confidence (boundary: must be strictly > 0.5)', () => {
    const patterns: DenialPattern[] = [
      {
        actionType: 'shell.exec',
        reason: 'blast radius',
        occurrences: 1,
        resolution: 'session_abandoned',
        confidence: 0.5,
        sessions: ['run1'],
      },
    ];

    const suggestions = suggestPolicyChanges(patterns);
    expect(suggestions).toHaveLength(0);
  });

  it('returns suggestions sorted by confidence descending', () => {
    const patterns: DenialPattern[] = [
      {
        actionType: 'file.write',
        reason: 'credential',
        occurrences: 3,
        resolution: 'retried_differently',
        confidence: 0.6,
        sessions: ['run1'],
      },
      {
        actionType: 'git.push',
        reason: 'protected',
        occurrences: 5,
        resolution: 'retried_differently',
        confidence: 0.9,
        sessions: ['run1', 'run2', 'run3'],
      },
    ];

    const suggestions = suggestPolicyChanges(patterns);

    expect(suggestions[0]!.confidence).toBeGreaterThanOrEqual(suggestions[1]!.confidence);
  });

  it('handles empty patterns array', () => {
    const suggestions = suggestPolicyChanges([]);
    expect(suggestions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// analyzeDenialPatterns (integration)
// ---------------------------------------------------------------------------

describe('analyzeDenialPatterns', () => {
  it('returns patterns and suggestions for a realistic scenario', () => {
    const denialEvents: DenialEvent[] = [
      makeDenial('git.push', 'protected branch', 'run1', 1000),
      makeDenial('git.push', 'protected branch', 'run2', 2000),
      makeDenial('git.push', 'protected branch', 'run3', 3000),
    ];

    const allEvents = [
      { kind: 'ActionDenied', actionType: 'git.push', timestamp: 1000, runId: 'run1' },
      { kind: 'ActionAllowed', actionType: 'git.push', timestamp: 2000, runId: 'run1' }, // retried
      { kind: 'ActionDenied', actionType: 'git.push', timestamp: 2000, runId: 'run2' },
      { kind: 'ActionDenied', actionType: 'git.push', timestamp: 3000, runId: 'run3' },
    ];

    const { patterns, suggestions } = analyzeDenialPatterns(denialEvents, allEvents);

    expect(patterns).toHaveLength(1);
    expect(patterns[0]!.actionType).toBe('git.push');
    expect(patterns[0]!.occurrences).toBe(3);
    expect(patterns[0]!.sessions).toHaveLength(3);

    // Should have at least one suggestion (retried_differently + high confidence)
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('handles empty denial events', () => {
    const { patterns, suggestions } = analyzeDenialPatterns([], []);
    expect(patterns).toHaveLength(0);
    expect(suggestions).toHaveLength(0);
  });

  it('sorts patterns by occurrences descending', () => {
    const denialEvents: DenialEvent[] = [
      makeDenial('file.write', 'credential', 'run1', 1000),
      makeDenial('git.push', 'protected branch', 'run1', 2000),
      makeDenial('git.push', 'protected branch', 'run2', 3000),
      makeDenial('git.push', 'protected branch', 'run3', 4000),
    ];

    const { patterns } = analyzeDenialPatterns(denialEvents, []);

    // git.push has 3 occurrences, file.write has 1 — git.push should be first
    expect(patterns[0]!.actionType).toBe('git.push');
    expect(patterns[0]!.occurrences).toBe(3);
  });
});

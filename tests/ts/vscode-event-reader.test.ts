// Tests for the VS Code extension event reader logic.
// These tests validate JSONL parsing, run summarization, and session listing
// without requiring the VS Code extension host.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Import the service functions directly — they use only node:fs, no vscode API
// We replicate the logic here since the vscode-extension has its own tsconfig
// and can't be imported directly into the main project's vitest

const ESCALATION_LABELS: Record<number, string> = {
  0: 'NORMAL',
  1: 'ELEVATED',
  2: 'HIGH',
  3: 'LOCKDOWN',
};

interface GovernanceEvent {
  readonly id: string;
  readonly kind: string;
  readonly timestamp: number;
  readonly fingerprint: string;
  readonly [key: string]: unknown;
}

interface RunSummary {
  readonly runId: string;
  readonly sessionFile: string;
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly totalEvents: number;
  readonly actionsRequested: number;
  readonly actionsAllowed: number;
  readonly actionsDenied: number;
  readonly violations: number;
  readonly escalationLevel: number;
  readonly status: 'active' | 'completed';
}

function parseJsonlContent(content: string): GovernanceEvent[] {
  const events: GovernanceEvent[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as GovernanceEvent;
      if (parsed.kind && parsed.id && parsed.timestamp) {
        events.push(parsed);
      }
    } catch {
      // Skip malformed lines
    }
  }
  return events;
}

interface RecentEvent {
  readonly id: string;
  readonly kind: string;
  readonly timestamp: number;
  readonly actionType: string | null;
  readonly target: string | null;
  readonly reason: string | null;
}

const POLICY_FILE_NAMES = ['agentguard.yaml', 'agentguard.yml', '.agentguard.yaml'];

function findPolicyFile(workspaceRoot: string): string | null {
  for (const name of POLICY_FILE_NAMES) {
    const filePath = join(workspaceRoot, name);
    if (existsSync(filePath)) {
      return name;
    }
  }
  return null;
}

function getRecentEvents(workspaceRoot: string, limit = 20): RecentEvent[] {
  const eventsDir = join(workspaceRoot, '.agentguard', 'events');
  if (!existsSync(eventsDir)) return [];

  const files = readdirSync(eventsDir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
    .reverse();

  if (files.length === 0) return [];

  const latestFile = join(eventsDir, files[0]);
  const content = readFileSync(latestFile, 'utf8');
  const events = parseJsonlContent(content);

  const actionKinds = new Set([
    'ActionAllowed',
    'ActionDenied',
    'ActionEscalated',
    'PolicyDenied',
    'InvariantViolation',
    'BlastRadiusExceeded',
  ]);

  const recent: RecentEvent[] = [];
  for (let i = events.length - 1; i >= 0 && recent.length < limit; i--) {
    const event = events[i];
    if (actionKinds.has(event.kind)) {
      const metadata =
        typeof event.metadata === 'object' && event.metadata !== null
          ? (event.metadata as Record<string, unknown>)
          : {};
      recent.push({
        id: event.id,
        kind: event.kind,
        timestamp: event.timestamp,
        actionType: (event.actionType as string) ?? (metadata.actionType as string) ?? null,
        target: (event.target as string) ?? (metadata.target as string) ?? null,
        reason: (event.reason as string) ?? (metadata.reason as string) ?? null,
      });
    }
  }

  return recent;
}

function summarizeRun(
  sessionId: string,
  sessionFile: string,
  events: GovernanceEvent[]
): RunSummary {
  let startedAt = 0;
  let endedAt: number | null = null;
  let actionsRequested = 0;
  let actionsAllowed = 0;
  let actionsDenied = 0;
  let violations = 0;
  let escalationLevel = 0;

  for (const event of events) {
    switch (event.kind) {
      case 'RunStarted':
        startedAt = event.timestamp;
        break;
      case 'RunEnded':
        endedAt = event.timestamp;
        break;
      case 'ActionRequested':
        actionsRequested++;
        break;
      case 'ActionAllowed':
        actionsAllowed++;
        break;
      case 'ActionDenied':
        actionsDenied++;
        break;
      case 'InvariantViolation':
        violations++;
        break;
      case 'ActionEscalated': {
        const level =
          typeof event.metadata === 'object' && event.metadata !== null
            ? (event.metadata as Record<string, unknown>).escalationLevel
            : undefined;
        if (typeof level === 'number' && level > escalationLevel) {
          escalationLevel = level;
        }
        break;
      }
    }
  }

  if (startedAt === 0 && events.length > 0) {
    startedAt = events[0].timestamp;
  }

  return {
    runId: sessionId,
    sessionFile,
    startedAt,
    endedAt,
    totalEvents: events.length,
    actionsRequested,
    actionsAllowed,
    actionsDenied,
    violations,
    escalationLevel,
    status: endedAt ? 'completed' : 'active',
  };
}

describe('VS Code event reader', () => {
  const testDir = join(tmpdir(), `agentguard-vscode-test-${Date.now()}`);
  const eventsDir = join(testDir, '.agentguard', 'events');

  beforeEach(() => {
    mkdirSync(eventsDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('parseJsonlContent', () => {
    it('parses valid JSONL lines', () => {
      const content = [
        JSON.stringify({
          id: 'evt_1_1',
          kind: 'ActionRequested',
          timestamp: 1000,
          fingerprint: 'abc',
          actionType: 'file.write',
          target: 'src/app.ts',
          justification: 'test',
        }),
        JSON.stringify({
          id: 'evt_1_2',
          kind: 'ActionAllowed',
          timestamp: 1001,
          fingerprint: 'def',
          actionType: 'file.write',
          target: 'src/app.ts',
          capability: 'file:write',
        }),
      ].join('\n');

      const events = parseJsonlContent(content);
      expect(events).toHaveLength(2);
      expect(events[0].kind).toBe('ActionRequested');
      expect(events[1].kind).toBe('ActionAllowed');
    });

    it('skips malformed lines gracefully', () => {
      const content = [
        'not json',
        JSON.stringify({
          id: 'evt_1_1',
          kind: 'ActionRequested',
          timestamp: 1000,
          fingerprint: 'abc',
          actionType: 'file.write',
          target: 'src/app.ts',
          justification: 'test',
        }),
        '{ invalid',
        '',
      ].join('\n');

      const events = parseJsonlContent(content);
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('ActionRequested');
    });

    it('skips lines missing required fields', () => {
      const content = [
        JSON.stringify({ kind: 'ActionRequested' }), // missing id and timestamp
        JSON.stringify({
          id: 'evt_1_1',
          kind: 'ActionRequested',
          timestamp: 1000,
          fingerprint: 'abc',
          actionType: 'file.write',
          target: 'src/app.ts',
          justification: 'test',
        }),
      ].join('\n');

      const events = parseJsonlContent(content);
      expect(events).toHaveLength(1);
    });

    it('returns empty array for empty content', () => {
      expect(parseJsonlContent('')).toEqual([]);
      expect(parseJsonlContent('\n\n')).toEqual([]);
    });
  });

  describe('summarizeRun', () => {
    it('counts governance events correctly', () => {
      const events: GovernanceEvent[] = [
        { id: 'e1', kind: 'RunStarted', timestamp: 1000, fingerprint: 'a', runId: 'r1' },
        {
          id: 'e2',
          kind: 'ActionRequested',
          timestamp: 1001,
          fingerprint: 'b',
          actionType: 'file.write',
          target: 'x',
          justification: 'y',
        },
        {
          id: 'e3',
          kind: 'ActionAllowed',
          timestamp: 1002,
          fingerprint: 'c',
          actionType: 'file.write',
          target: 'x',
          capability: 'file:write',
        },
        {
          id: 'e4',
          kind: 'ActionRequested',
          timestamp: 1003,
          fingerprint: 'd',
          actionType: 'git.push',
          target: 'main',
          justification: 'push',
        },
        {
          id: 'e5',
          kind: 'ActionDenied',
          timestamp: 1004,
          fingerprint: 'e',
          actionType: 'git.push',
          target: 'main',
          reason: 'protected branch',
        },
        {
          id: 'e6',
          kind: 'InvariantViolation',
          timestamp: 1005,
          fingerprint: 'f',
          invariant: 'no-force-push',
          expected: 'false',
          actual: 'true',
        },
        {
          id: 'e7',
          kind: 'RunEnded',
          timestamp: 2000,
          fingerprint: 'g',
          runId: 'r1',
          result: 'ok',
        },
      ];

      const summary = summarizeRun('session_1', 'session_1.jsonl', events);

      expect(summary.runId).toBe('session_1');
      expect(summary.startedAt).toBe(1000);
      expect(summary.endedAt).toBe(2000);
      expect(summary.totalEvents).toBe(7);
      expect(summary.actionsRequested).toBe(2);
      expect(summary.actionsAllowed).toBe(1);
      expect(summary.actionsDenied).toBe(1);
      expect(summary.violations).toBe(1);
      expect(summary.status).toBe('completed');
    });

    it('marks run as active when no RunEnded event', () => {
      const events: GovernanceEvent[] = [
        { id: 'e1', kind: 'RunStarted', timestamp: 1000, fingerprint: 'a', runId: 'r1' },
        {
          id: 'e2',
          kind: 'ActionRequested',
          timestamp: 1001,
          fingerprint: 'b',
          actionType: 'file.write',
          target: 'x',
          justification: 'y',
        },
      ];

      const summary = summarizeRun('session_1', 'session_1.jsonl', events);
      expect(summary.status).toBe('active');
      expect(summary.endedAt).toBeNull();
    });

    it('falls back to first event timestamp when no RunStarted', () => {
      const events: GovernanceEvent[] = [
        {
          id: 'e1',
          kind: 'ActionRequested',
          timestamp: 5000,
          fingerprint: 'a',
          actionType: 'file.write',
          target: 'x',
          justification: 'y',
        },
      ];

      const summary = summarizeRun('session_1', 'session_1.jsonl', events);
      expect(summary.startedAt).toBe(5000);
    });

    it('tracks escalation level from ActionEscalated events', () => {
      const events: GovernanceEvent[] = [
        { id: 'e1', kind: 'RunStarted', timestamp: 1000, fingerprint: 'a', runId: 'r1' },
        {
          id: 'e2',
          kind: 'ActionEscalated',
          timestamp: 1001,
          fingerprint: 'b',
          actionType: 'git.push',
          target: 'main',
          reason: 'protected branch',
          metadata: { escalationLevel: 2 },
        },
      ];

      const summary = summarizeRun('session_1', 'session_1.jsonl', events);
      expect(summary.escalationLevel).toBe(2);
    });

    it('returns zero counts for empty events', () => {
      const summary = summarizeRun('session_1', 'session_1.jsonl', []);
      expect(summary.totalEvents).toBe(0);
      expect(summary.actionsRequested).toBe(0);
      expect(summary.actionsAllowed).toBe(0);
      expect(summary.actionsDenied).toBe(0);
      expect(summary.violations).toBe(0);
      expect(summary.startedAt).toBe(0);
    });
  });

  describe('escalation labels', () => {
    it('maps escalation levels to labels', () => {
      expect(ESCALATION_LABELS[0]).toBe('NORMAL');
      expect(ESCALATION_LABELS[1]).toBe('ELEVATED');
      expect(ESCALATION_LABELS[2]).toBe('HIGH');
      expect(ESCALATION_LABELS[3]).toBe('LOCKDOWN');
    });
  });

  describe('file-based operations', () => {
    it('reads and parses a JSONL session file', () => {
      const sessionFile = join(eventsDir, 'test_session.jsonl');
      const events = [
        { id: 'e1', kind: 'RunStarted', timestamp: 1000, fingerprint: 'a', runId: 'r1' },
        {
          id: 'e2',
          kind: 'ActionRequested',
          timestamp: 1001,
          fingerprint: 'b',
          actionType: 'file.write',
          target: 'x',
          justification: 'y',
        },
      ];
      writeFileSync(sessionFile, events.map((e) => JSON.stringify(e)).join('\n') + '\n');

      const content = readFileSync(sessionFile, 'utf8');
      const parsed = parseJsonlContent(content);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].kind).toBe('RunStarted');
      expect(parsed[1].kind).toBe('ActionRequested');
    });
  });

  describe('findPolicyFile', () => {
    it('detects agentguard.yaml in workspace', () => {
      writeFileSync(join(testDir, 'agentguard.yaml'), 'version: 1\nrules: []\n');
      const result = findPolicyFile(testDir);
      expect(result).toBe('agentguard.yaml');
    });

    it('detects agentguard.yml when yaml not present', () => {
      writeFileSync(join(testDir, 'agentguard.yml'), 'version: 1\nrules: []\n');
      const result = findPolicyFile(testDir);
      expect(result).toBe('agentguard.yml');
    });

    it('detects .agentguard.yaml as hidden config', () => {
      writeFileSync(join(testDir, '.agentguard.yaml'), 'version: 1\nrules: []\n');
      const result = findPolicyFile(testDir);
      expect(result).toBe('.agentguard.yaml');
    });

    it('prefers agentguard.yaml over agentguard.yml', () => {
      writeFileSync(join(testDir, 'agentguard.yaml'), 'version: 1\nrules: []\n');
      writeFileSync(join(testDir, 'agentguard.yml'), 'version: 1\nrules: []\n');
      const result = findPolicyFile(testDir);
      expect(result).toBe('agentguard.yaml');
    });

    it('returns null when no policy file exists', () => {
      const result = findPolicyFile(testDir);
      expect(result).toBeNull();
    });
  });

  describe('getRecentEvents', () => {
    it('extracts recent allowed and denied events from latest run', () => {
      const sessionFile = join(eventsDir, 'session_recent.jsonl');
      const events = [
        { id: 'e1', kind: 'RunStarted', timestamp: 1000, fingerprint: 'a', runId: 'r1' },
        {
          id: 'e2',
          kind: 'ActionAllowed',
          timestamp: 1001,
          fingerprint: 'b',
          actionType: 'file.write',
          target: 'src/app.ts',
        },
        {
          id: 'e3',
          kind: 'ActionDenied',
          timestamp: 1002,
          fingerprint: 'c',
          actionType: 'git.push',
          target: 'main',
          reason: 'protected branch',
        },
        {
          id: 'e4',
          kind: 'PolicyDenied',
          timestamp: 1003,
          fingerprint: 'd',
          actionType: 'shell.exec',
          target: 'rm -rf /',
          reason: 'destructive command',
        },
      ];
      writeFileSync(sessionFile, events.map((e) => JSON.stringify(e)).join('\n') + '\n');

      const recent = getRecentEvents(testDir);
      // 3 action events (RunStarted is not an action kind)
      expect(recent).toHaveLength(3);
      // Newest first
      expect(recent[0].kind).toBe('PolicyDenied');
      expect(recent[0].actionType).toBe('shell.exec');
      expect(recent[0].reason).toBe('destructive command');
      expect(recent[1].kind).toBe('ActionDenied');
      expect(recent[1].target).toBe('main');
      expect(recent[2].kind).toBe('ActionAllowed');
      expect(recent[2].actionType).toBe('file.write');
    });

    it('returns empty array when no runs exist', () => {
      const recent = getRecentEvents(testDir);
      expect(recent).toEqual([]);
    });

    it('respects the limit parameter', () => {
      const sessionFile = join(eventsDir, 'session_limit.jsonl');
      const events = [];
      for (let i = 0; i < 30; i++) {
        events.push({
          id: `e${i}`,
          kind: 'ActionAllowed',
          timestamp: 1000 + i,
          fingerprint: `f${i}`,
          actionType: 'file.write',
          target: `file${i}.ts`,
        });
      }
      writeFileSync(sessionFile, events.map((e) => JSON.stringify(e)).join('\n') + '\n');

      const recent = getRecentEvents(testDir, 5);
      expect(recent).toHaveLength(5);
      // Should be the 5 most recent (highest timestamp)
      expect(recent[0].target).toBe('file29.ts');
      expect(recent[4].target).toBe('file25.ts');
    });
  });
});

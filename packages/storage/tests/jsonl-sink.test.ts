import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createJsonlEventSink, createJsonlDecisionSink } from '@red-codes/storage';
import type { DomainEvent } from '@red-codes/core';
import type { GovernanceDecisionRecord } from '@red-codes/core';

function makeEvent(id: string): DomainEvent {
  return {
    id,
    kind: 'ActionRequested',
    timestamp: Date.now(),
    fingerprint: 'fp_test',
  } as DomainEvent;
}

function makeDecision(recordId: string): GovernanceDecisionRecord {
  return {
    recordId,
    runId: 'run_1',
    timestamp: Date.now(),
    action: { type: 'shell.exec', target: '/bin/ls', agent: 'claude', destructive: false },
    outcome: 'allow',
    reason: 'Policy allows shell.exec',
    intervention: null,
    policy: { matchedPolicyId: 'p1', matchedPolicyName: 'default', severity: 0 },
    invariants: { allHold: true, violations: [] },
    simulation: null,
    evidencePackId: null,
    monitor: { escalationLevel: 0, totalEvaluations: 1, totalDenials: 0 },
    execution: { executed: true, success: true, durationMs: 10, error: null },
  } as unknown as GovernanceDecisionRecord;
}

function readLines(filePath: string): string[] {
  return readFileSync(filePath, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0);
}

describe('JSONL EventSink', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ag-jsonl-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes events as JSONL lines', () => {
    const sink = createJsonlEventSink(tempDir, 'run_1');
    sink.write(makeEvent('e1'));
    sink.write(makeEvent('e2'));

    const filePath = join(tempDir, 'run_1.events.jsonl');
    const lines = readLines(filePath);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).id).toBe('e1');
    expect(JSON.parse(lines[1]).id).toBe('e2');
  });

  it('preserves full event data in each line', () => {
    const sink = createJsonlEventSink(tempDir, 'run_1');
    const event = { ...makeEvent('e_full'), actionType: 'file.write' } as DomainEvent;
    sink.write(event);

    const filePath = join(tempDir, 'run_1.events.jsonl');
    const lines = readLines(filePath);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.id).toBe('e_full');
    expect(parsed.kind).toBe('ActionRequested');
    expect(parsed.actionType).toBe('file.write');
  });

  it('creates output directory if it does not exist', () => {
    const nested = join(tempDir, 'deep', 'nested');
    const sink = createJsonlEventSink(nested, 'run_1');
    sink.write(makeEvent('e1'));

    const filePath = join(nested, 'run_1.events.jsonl');
    const lines = readLines(filePath);
    expect(lines).toHaveLength(1);
  });

  it('does not throw on write errors', () => {
    // Use an invalid path that will cause write failures
    const sink = createJsonlEventSink('/dev/null/impossible/path', 'run_1');
    expect(() => sink.write(makeEvent('e1'))).not.toThrow();
  });

  it('calls onError callback on write failure', () => {
    const errors: Error[] = [];
    // Create a file where the sink expects a directory, forcing mkdirSync/appendFileSync to fail
    const blockerFile = join(tempDir, 'blocker');
    writeFileSync(blockerFile, 'occupied');
    const sink = createJsonlEventSink(join(blockerFile, 'nested'), 'run_1', (err) =>
      errors.push(err)
    );
    sink.write(makeEvent('e1'));
    expect(errors).toHaveLength(1);
  });

  it('flush is a no-op', () => {
    const sink = createJsonlEventSink(tempDir, 'run_1');
    expect(() => sink.flush?.()).not.toThrow();
  });

  it('appends to existing file across multiple writes', () => {
    const sink = createJsonlEventSink(tempDir, 'run_1');
    sink.write(makeEvent('e1'));
    sink.write(makeEvent('e2'));
    sink.write(makeEvent('e3'));

    const filePath = join(tempDir, 'run_1.events.jsonl');
    const lines = readLines(filePath);
    expect(lines).toHaveLength(3);
  });
});

describe('JSONL DecisionSink', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ag-jsonl-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes decision records as JSONL lines', () => {
    const sink = createJsonlDecisionSink(tempDir, 'run_1');
    sink.write(makeDecision('dec_1'));

    const filePath = join(tempDir, 'run_1.decisions.jsonl');
    const lines = readLines(filePath);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).recordId).toBe('dec_1');
  });

  it('preserves full decision record data', () => {
    const sink = createJsonlDecisionSink(tempDir, 'run_1');
    const record = makeDecision('dec_full');
    sink.write(record);

    const filePath = join(tempDir, 'run_1.decisions.jsonl');
    const lines = readLines(filePath);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.recordId).toBe('dec_full');
    expect(parsed.outcome).toBe('allow');
    expect(parsed.action.type).toBe('shell.exec');
    expect(parsed.reason).toBe('Policy allows shell.exec');
  });

  it('creates output directory if it does not exist', () => {
    const nested = join(tempDir, 'deep', 'nested');
    const sink = createJsonlDecisionSink(nested, 'run_1');
    sink.write(makeDecision('dec_1'));

    const filePath = join(nested, 'run_1.decisions.jsonl');
    const lines = readLines(filePath);
    expect(lines).toHaveLength(1);
  });

  it('does not throw on write errors', () => {
    const sink = createJsonlDecisionSink('/dev/null/impossible/path', 'run_1');
    expect(() => sink.write(makeDecision('dec_1'))).not.toThrow();
  });

  it('flush is a no-op', () => {
    const sink = createJsonlDecisionSink(tempDir, 'run_1');
    expect(() => sink.flush?.()).not.toThrow();
  });

  it('writes multiple decisions to the same file', () => {
    const sink = createJsonlDecisionSink(tempDir, 'run_1');
    sink.write(makeDecision('dec_1'));
    sink.write(makeDecision('dec_2'));
    sink.write(makeDecision('dec_3'));

    const filePath = join(tempDir, 'run_1.decisions.jsonl');
    const lines = readLines(filePath);
    expect(lines).toHaveLength(3);
  });
});

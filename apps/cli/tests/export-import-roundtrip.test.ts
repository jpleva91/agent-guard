// Round-trip integration tests for export/import across storage backends.
// Verifies that sessions exported from one backend can be imported into either backend
// and produce identical event/decision sequences.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@red-codes/storage';
import { createSqliteEventSink, createSqliteDecisionSink } from '@red-codes/storage';
import { loadRunEvents, loadRunDecisions } from '@red-codes/storage';
import { EXPORT_SCHEMA_VERSION } from '../src/commands/export.js';
import type { GovernanceExportHeader } from '../src/commands/export.js';
import type { DomainEvent } from '@red-codes/core';
import type { GovernanceDecisionRecord } from '@red-codes/core';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeEvent(id: string, kind = 'ActionRequested', ts = Date.now()): DomainEvent {
  return {
    id,
    kind,
    timestamp: ts,
    fingerprint: `fp_${id}`,
    actionType: 'file.read',
    target: 'src/test.ts',
    justification: 'roundtrip test',
  } as DomainEvent;
}

function makeDecision(recordId: string): GovernanceDecisionRecord {
  return {
    recordId,
    runId: 'roundtrip_run',
    timestamp: Date.now(),
    action: { type: 'shell.exec', target: '/bin/ls', agent: 'claude', destructive: false },
    outcome: 'allow',
    reason: 'Policy allows this action',
    intervention: null,
    policy: { matchedPolicyId: 'p1', matchedPolicyName: 'default', severity: 0 },
    invariants: { allHold: true, violations: [] },
    simulation: null,
    evidencePackId: null,
    monitor: { escalationLevel: 0, totalEvaluations: 1, totalDenials: 0 },
    execution: { executed: true, success: true, durationMs: 5, error: null },
  } as unknown as GovernanceDecisionRecord;
}

/**
 * Build a valid export JSONL string from events and decisions.
 */
function buildExportFile(
  runId: string,
  events: DomainEvent[],
  decisions: GovernanceDecisionRecord[],
  sourceBackend: 'sqlite' = 'sqlite'
): string {
  const header: GovernanceExportHeader = {
    __agentguard_export: true,
    version: 1,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    runId,
    exportedAt: Date.now(),
    eventCount: events.length,
    decisionCount: decisions.length,
    sourceBackend,
  };

  const lines = [
    JSON.stringify(header),
    ...events.map((e) => JSON.stringify(e)),
    ...decisions.map((d) => JSON.stringify(d)),
  ];

  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Export/Import Round-Trip', () => {
  const RUN_ID = 'roundtrip_run';

  describe('SQLite → export → import → verify identical', () => {
    it('preserves event order and content through export→import cycle', () => {
      // 1. Create events (simulating kernel output)
      const events = [
        makeEvent('evt_1', 'ActionRequested', 1000),
        makeEvent('evt_2', 'ActionAllowed', 2000),
        makeEvent('evt_3', 'ActionExecuted', 3000),
      ];
      const decisions = [makeDecision('dec_1')];

      // 2. Build export file
      const exportContent = buildExportFile(RUN_ID, events, decisions);

      // 3. Parse the export (simulating import)
      const lines = exportContent.trim().split('\n');
      const header = JSON.parse(lines[0]) as GovernanceExportHeader;

      expect(header.__agentguard_export).toBe(true);
      expect(header.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
      expect(header.eventCount).toBe(3);
      expect(header.decisionCount).toBe(1);

      // 4. Extract events and decisions
      const importedEvents = lines
        .slice(1, 1 + header.eventCount)
        .map((l) => JSON.parse(l) as DomainEvent);
      const importedDecisions = lines
        .slice(1 + header.eventCount)
        .map((l) => JSON.parse(l) as GovernanceDecisionRecord);

      // 5. Verify identical sequences
      expect(importedEvents).toHaveLength(events.length);
      expect(importedDecisions).toHaveLength(decisions.length);

      for (let i = 0; i < events.length; i++) {
        expect(importedEvents[i].id).toBe(events[i].id);
        expect(importedEvents[i].kind).toBe(events[i].kind);
        expect(importedEvents[i].timestamp).toBe(events[i].timestamp);
        expect(importedEvents[i].fingerprint).toBe(events[i].fingerprint);
      }

      expect(importedDecisions[0].recordId).toBe(decisions[0].recordId);
      expect(importedDecisions[0].outcome).toBe(decisions[0].outcome);
    });
  });

  describe('SQLite → export → import to SQLite → verify identical', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = new Database(':memory:');
      runMigrations(db);
    });

    afterEach(() => {
      db.close();
    });

    it('preserves events and decisions through SQLite → export → SQLite cycle', () => {
      // 1. Write original events to SQLite
      const eventSink = createSqliteEventSink(db, RUN_ID);
      const decisionSink = createSqliteDecisionSink(db, RUN_ID);

      const events = [
        makeEvent('evt_s1', 'ActionRequested', 1000),
        makeEvent('evt_s2', 'ActionAllowed', 2000),
        makeEvent('evt_s3', 'ActionExecuted', 3000),
      ];
      const decisions = [makeDecision('dec_s1')];

      for (const event of events) {
        eventSink.write(event);
      }
      for (const decision of decisions) {
        decisionSink.write(decision);
      }

      // 2. Read back from SQLite (simulating export)
      const exportedEvents = loadRunEvents(db, RUN_ID);
      const exportedDecisions = loadRunDecisions(db, RUN_ID);

      // 3. Build export file
      const exportContent = buildExportFile(RUN_ID, exportedEvents, exportedDecisions, 'sqlite');

      // 4. Parse and re-import to a fresh SQLite DB
      const db2 = new Database(':memory:');
      runMigrations(db2);

      const lines = exportContent.trim().split('\n');
      const header = JSON.parse(lines[0]) as GovernanceExportHeader;
      expect(header.sourceBackend).toBe('sqlite');

      const importedEvents = lines
        .slice(1, 1 + header.eventCount)
        .map((l) => JSON.parse(l) as DomainEvent);
      const importedDecisions = lines
        .slice(1 + header.eventCount)
        .map((l) => JSON.parse(l) as GovernanceDecisionRecord);

      const importEventSink = createSqliteEventSink(db2, RUN_ID);
      const importDecisionSink = createSqliteDecisionSink(db2, RUN_ID);

      for (const event of importedEvents) {
        importEventSink.write(event);
      }
      for (const decision of importedDecisions) {
        importDecisionSink.write(decision);
      }

      // 5. Read back from db2 and verify
      const finalEvents = loadRunEvents(db2, RUN_ID);
      const finalDecisions = loadRunDecisions(db2, RUN_ID);

      expect(finalEvents).toHaveLength(events.length);
      expect(finalDecisions).toHaveLength(decisions.length);

      for (let i = 0; i < events.length; i++) {
        expect(finalEvents[i].id).toBe(events[i].id);
        expect(finalEvents[i].kind).toBe(events[i].kind);
        expect(finalEvents[i].timestamp).toBe(events[i].timestamp);
        expect(finalEvents[i].fingerprint).toBe(events[i].fingerprint);
      }

      expect(finalDecisions[0].recordId).toBe(decisions[0].recordId);
      expect(finalDecisions[0].outcome).toBe(decisions[0].outcome);

      db2.close();
    });
  });

  describe('Cross-format: SQLite → export → parse → re-export → import to SQLite', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = new Database(':memory:');
      runMigrations(db);
    });

    afterEach(() => {
      db.close();
    });

    it('preserves data integrity across export/import transitions', () => {
      // 1. Populate SQLite
      const eventSink = createSqliteEventSink(db, RUN_ID);
      const decisionSink = createSqliteDecisionSink(db, RUN_ID);

      const originalEvents = [
        makeEvent('evt_x1', 'ActionRequested', 1000),
        makeEvent('evt_x2', 'PolicyDenied', 2000),
        makeEvent('evt_x3', 'ActionDenied', 3000),
      ];
      const originalDecisions = [makeDecision('dec_x1'), makeDecision('dec_x2')];
      // Give unique recordIds
      originalDecisions[1].recordId = 'dec_x2';

      for (const e of originalEvents) eventSink.write(e);
      for (const d of originalDecisions) decisionSink.write(d);

      // 2. Export from SQLite
      const sqliteEvents = loadRunEvents(db, RUN_ID);
      const sqliteDecisions = loadRunDecisions(db, RUN_ID);
      const export1 = buildExportFile(RUN_ID, sqliteEvents, sqliteDecisions, 'sqlite');

      // 3. Parse export (simulates portable file handling)
      const lines1 = export1.trim().split('\n');
      const header1 = JSON.parse(lines1[0]) as GovernanceExportHeader;
      const parsedEvents = lines1
        .slice(1, 1 + header1.eventCount)
        .map((l) => JSON.parse(l) as DomainEvent);
      const parsedDecisions = lines1
        .slice(1 + header1.eventCount)
        .map((l) => JSON.parse(l) as GovernanceDecisionRecord);

      // 4. Re-export (same data, verifying round-trip stability)
      const export2 = buildExportFile(RUN_ID, parsedEvents, parsedDecisions);

      // 5. Import back to SQLite
      const db2 = new Database(':memory:');
      runMigrations(db2);

      const lines2 = export2.trim().split('\n');
      const header2 = JSON.parse(lines2[0]) as GovernanceExportHeader;
      const finalEvents = lines2
        .slice(1, 1 + header2.eventCount)
        .map((l) => JSON.parse(l) as DomainEvent);
      const finalDecisions = lines2
        .slice(1 + header2.eventCount)
        .map((l) => JSON.parse(l) as GovernanceDecisionRecord);

      const importSink = createSqliteEventSink(db2, RUN_ID);
      const importDecSink = createSqliteDecisionSink(db2, RUN_ID);
      for (const e of finalEvents) importSink.write(e);
      for (const d of finalDecisions) importDecSink.write(d);

      // 6. Verify data integrity
      const verifyEvents = loadRunEvents(db2, RUN_ID);
      const verifyDecisions = loadRunDecisions(db2, RUN_ID);

      expect(verifyEvents).toHaveLength(originalEvents.length);
      expect(verifyDecisions).toHaveLength(originalDecisions.length);

      // Compare IDs (order preserved by timestamp)
      expect(verifyEvents.map((e) => e.id)).toEqual(originalEvents.map((e) => e.id));
      expect(verifyDecisions.map((d) => d.recordId)).toEqual(
        originalDecisions.map((d) => d.recordId)
      );

      db2.close();
    });
  });

  describe('Schema version contract', () => {
    it('export header includes correct schemaVersion', () => {
      const events = [makeEvent('evt_v1')];
      const exportContent = buildExportFile('run_v', events, []);
      const header = JSON.parse(exportContent.split('\n')[0]) as GovernanceExportHeader;

      expect(header.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
      expect(typeof header.schemaVersion).toBe('number');
    });

    it('export header includes sourceBackend', () => {
      const events = [makeEvent('evt_b1')];

      const sqliteExport = buildExportFile('run_sb', events, []);

      const sqliteHeader = JSON.parse(sqliteExport.split('\n')[0]);

      expect(sqliteHeader.sourceBackend).toBe('sqlite');
    });

    it('eventCount in header matches actual event lines', () => {
      const events = [
        makeEvent('evt_c1', 'ActionRequested', 1000),
        makeEvent('evt_c2', 'ActionAllowed', 2000),
      ];
      const decisions = [makeDecision('dec_c1')];

      const exportContent = buildExportFile('run_c', events, decisions);
      const lines = exportContent.trim().split('\n');
      const header = JSON.parse(lines[0]) as GovernanceExportHeader;

      // Events should be lines 1 through eventCount
      const eventLines = lines.slice(1, 1 + header.eventCount);
      expect(eventLines).toHaveLength(events.length);

      // Decisions should be the remaining lines
      const decisionLines = lines.slice(1 + header.eventCount);
      expect(decisionLines).toHaveLength(decisions.length);
    });
  });
});

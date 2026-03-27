// SQLite session lifecycle — populates the dead `sessions` table.
// Insert on run start, update on run end.
// Follows the sink pattern: swallows errors, never crashes the kernel.

import type Database from 'better-sqlite3';

export interface SessionStartData {
  readonly policyFile?: string;
  readonly dryRun?: boolean;
  readonly storageBackend?: string;
  readonly simulatorCount?: number;
  readonly agentId?: string;
}

export interface SessionEndData {
  readonly totalActions: number;
  readonly allowed: number;
  readonly denied: number;
  readonly violations: number;
  readonly durationMs: number;
  readonly escalationLevel?: string;
}

export interface SessionRow {
  readonly id: string;
  readonly started_at: string;
  readonly ended_at: string | null;
  readonly command: string | null;
  readonly repo: string | null;
  readonly data: string;
  readonly agent_id: string | null;
}

export function insertSession(
  db: Database.Database,
  sessionId: string,
  command: string,
  startData: SessionStartData = {},
  onError?: (error: Error) => void
): void {
  try {
    const now = new Date().toISOString();
    const repo = safeGetCwd();
    const { agentId, ...rest } = startData;
    const data = JSON.stringify({ ...rest, status: 'running' });
    db.prepare(
      'INSERT OR IGNORE INTO sessions (id, started_at, ended_at, command, repo, data, agent_id) VALUES (?, ?, NULL, ?, ?, ?, ?)'
    ).run(sessionId, now, command, repo, data, agentId ?? null);
  } catch (err) {
    onError?.(err as Error);
  }
}

export function updateSessionEnd(
  db: Database.Database,
  sessionId: string,
  endData: SessionEndData,
  onError?: (error: Error) => void
): void {
  try {
    const now = new Date().toISOString();
    const row = db.prepare('SELECT data FROM sessions WHERE id = ?').get(sessionId) as
      | { data: string }
      | undefined;
    const existing = row ? (JSON.parse(row.data) as Record<string, unknown>) : {};
    const merged = { ...existing, ...endData, status: 'completed' };
    db.prepare('UPDATE sessions SET ended_at = ?, data = ? WHERE id = ?').run(
      now,
      JSON.stringify(merged),
      sessionId
    );
  } catch (err) {
    onError?.(err as Error);
  }
}

export function getSession(db: Database.Database, sessionId: string): SessionRow | null {
  try {
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as
      | SessionRow
      | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

export function listSessions(db: Database.Database, limit = 20): SessionRow[] {
  try {
    return db
      .prepare('SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?')
      .all(limit) as SessionRow[];
  } catch {
    return [];
  }
}

export interface SessionTracker {
  start(sessionId: string, command: string, startData?: SessionStartData): void;
  end(sessionId: string, endData: SessionEndData): void;
  get(sessionId: string): SessionRow | null;
  list(limit?: number): SessionRow[];
}

export function createSessionTracker(db: Database.Database): SessionTracker {
  return {
    start(sessionId, command, startData) {
      insertSession(db, sessionId, command, startData);
    },
    end(sessionId, endData) {
      updateSessionEnd(db, sessionId, endData);
    },
    get(sessionId) {
      return getSession(db, sessionId);
    },
    list(limit) {
      return listSessions(db, limit);
    },
  };
}

function safeGetCwd(): string | null {
  try {
    return process.cwd();
  } catch {
    return null;
  }
}

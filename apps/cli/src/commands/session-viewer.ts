// CLI command: agentguard session-viewer — generate interactive HTML visualization
// of a governance session and open it in the default browser.
// Supports both JSONL (default) and SQLite storage backends.

import {
  readFileSync,
  existsSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { request } from 'node:https';
import { request as httpRequest, createServer } from 'node:http';
import { getEventFilePath, getDecisionFilePath } from '@red-codes/events';
import { buildReplaySession } from '@red-codes/kernel';
import type { DomainEvent } from '@red-codes/core';
import type { GovernanceDecisionRecord } from '@red-codes/core';
import type { StorageConfig } from '@red-codes/storage';
import { aggregateEvents } from '../evidence-summary.js';
import { generateSessionHtml } from '../session-viewer-html.js';

const BASE_DIR = '.agentguard';
const EVENTS_DIR = join(BASE_DIR, 'events');
const VIEWS_DIR = join(homedir(), '.agentguard', 'views');

// ---------------------------------------------------------------------------
// JSONL helpers (same pattern as inspect.ts)
// ---------------------------------------------------------------------------

function loadEventsJsonl(runId: string): DomainEvent[] {
  const filePath = getEventFilePath(runId);
  if (!existsSync(filePath)) {
    process.stderr.write(`  \x1b[31mError:\x1b[0m No events found for run: ${runId}\n`);
    process.stderr.write(`  Expected file: ${filePath}\n`);
    return [];
  }

  const content = readFileSync(filePath, 'utf8');
  const events: DomainEvent[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as DomainEvent);
    } catch {
      // Skip malformed lines
    }
  }
  return events;
}

function loadDecisionsJsonl(runId: string): GovernanceDecisionRecord[] {
  const filePath = getDecisionFilePath(runId);
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf8');
  const records: GovernanceDecisionRecord[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed) as GovernanceDecisionRecord);
    } catch {
      // Skip malformed lines
    }
  }
  return records;
}

function listRunsJsonl(): string[] {
  if (!existsSync(EVENTS_DIR)) return [];
  return readdirSync(EVENTS_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => f.replace('.jsonl', ''))
    .sort()
    .reverse();
}

// ---------------------------------------------------------------------------
// SQLite helpers
// ---------------------------------------------------------------------------

async function openSqliteDb(storageConfig: StorageConfig) {
  const { createStorageBundle } = await import('@red-codes/storage');
  const storage = await createStorageBundle(storageConfig);
  if (!storage.db) {
    process.stderr.write('  Error: SQLite storage backend did not initialize database.\n');
    return null;
  }
  return storage;
}

// ---------------------------------------------------------------------------
// Live server — serves the session viewer HTML and provides a polling endpoint
// for incremental event updates without hard page refreshes.
// ---------------------------------------------------------------------------

const LIVE_SERVER_FILE = join(BASE_DIR, 'live-viewer.json');

interface LiveServerInfo {
  port: number;
  pid: number;
  startedAt: number;
}

/** Check if a live server is already running. Returns port if reachable, null otherwise. */
export function detectLiveServer(): number | null {
  if (!existsSync(LIVE_SERVER_FILE)) return null;
  try {
    const info = JSON.parse(readFileSync(LIVE_SERVER_FILE, 'utf8')) as LiveServerInfo;
    // Check if the process is still alive
    try {
      process.kill(info.pid, 0);
    } catch {
      // Process dead — clean up stale file
      try {
        unlinkSync(LIVE_SERVER_FILE);
      } catch {
        /* ignore */
      }
      return null;
    }
    return info.port;
  } catch {
    return null;
  }
}

interface LiveServer {
  port: number;
  /** Update the HTML served by the server (call after you know the port). */
  setHtml: (html: string) => void;
}

type PollDataLoader = (afterEvent: number, afterDecision: number) => {
  events: DomainEvent[];
  decisions: GovernanceDecisionRecord[];
  actions: unknown[];
  summary: Record<string, unknown>;
};

/** Start a live HTTP server for the session viewer. */
function startLiveServer(loadNewData: PollDataLoader): Promise<LiveServer> {
  return new Promise((resolve, reject) => {
    let currentHtml = '<html><body>Loading...</body></html>';

    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost`);

      if (url.pathname === '/api/poll') {
        const afterEvent = Number(url.searchParams.get('afterEvent') || '0');
        const afterDecision = Number(url.searchParams.get('afterDecision') || '0');

        try {
          const data = loadNewData(afterEvent, afterDecision);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify(data));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        }
        return;
      }

      // Serve the HTML page for any other path
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(currentHtml);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to bind server'));
        return;
      }
      const port = addr.port;

      // Write server info so hooks can detect us
      const info: LiveServerInfo = { port, pid: process.pid, startedAt: Date.now() };
      try {
        if (!existsSync(BASE_DIR)) mkdirSync(BASE_DIR, { recursive: true });
        writeFileSync(LIVE_SERVER_FILE, JSON.stringify(info), 'utf8');
      } catch {
        /* non-fatal */
      }

      // Clean up on exit
      const cleanup = () => {
        try {
          unlinkSync(LIVE_SERVER_FILE);
        } catch {
          /* ignore */
        }
        server.close();
      };
      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
      process.on('exit', cleanup);

      resolve({
        port,
        setHtml: (html: string) => {
          currentHtml = html;
        },
      });
    });

    server.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Cloud sharing
// ---------------------------------------------------------------------------

const DEFAULT_SERVER_URL = process.env.AGENTGUARD_SERVER_URL || 'http://localhost:3001';

function uploadToServer(
  serverUrl: string,
  sessionId: string,
  html: string,
  apiKey?: string
): Promise<{ viewerUrl: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`/api/v1/sessions/${encodeURIComponent(sessionId)}/viewer`, serverUrl);
    const isHttps = url.protocol === 'https:';
    const reqFn = isHttps ? request : httpRequest;

    const body = JSON.stringify({ html });
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(body)),
    };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const req = reqFn(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            const parsed = JSON.parse(data) as { viewer_url?: string };
            const viewerUrl = `${serverUrl}${parsed.viewer_url || `/v/sessions/${sessionId}`}`;
            resolve({ viewerUrl });
          } else {
            reject(new Error(`Server responded with ${res.statusCode}: ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Browser opening
// ---------------------------------------------------------------------------

function openInBrowser(filePath: string): void {
  try {
    if (process.platform === 'darwin') {
      execFileSync('open', [filePath], { stdio: 'ignore' });
    } else if (process.platform === 'win32') {
      // 'start' is a cmd.exe built-in — must invoke via cmd /c.
      // First arg after 'start' is the window title (empty), second is the path.
      execFileSync('cmd', ['/c', 'start', '""', filePath], { stdio: 'ignore' });
    } else {
      execFileSync('xdg-open', [filePath], { stdio: 'ignore' });
    }
  } catch {
    // Silently fail — file path is printed to stderr regardless
  }
}

// ---------------------------------------------------------------------------
// Public command
// ---------------------------------------------------------------------------

export async function sessionViewer(
  args: string[],
  storageConfig?: StorageConfig
): Promise<number> {
  const noOpen = args.includes('--no-open');
  const share = args.includes('--share');
  const live = args.includes('--live');

  // Parse --server <url> flag
  let serverUrl = DEFAULT_SERVER_URL;
  const serverIdx = args.indexOf('--server');
  if (serverIdx !== -1 && args[serverIdx + 1]) {
    serverUrl = args[serverIdx + 1];
  }

  // Parse --api-key <key> flag (or use env var)
  let apiKey = process.env.AGENTGUARD_API_KEY;
  const apiKeyIdx = args.indexOf('--api-key');
  if (apiKeyIdx !== -1 && args[apiKeyIdx + 1]) {
    apiKey = args[apiKeyIdx + 1];
  }

  // Parse --merge-recent <n> flag (combine N most recent runs into one view)
  let mergeCount = 0;
  const mergeIdx = args.indexOf('--merge-recent');
  if (mergeIdx !== -1 && args[mergeIdx + 1]) {
    mergeCount = parseInt(args[mergeIdx + 1], 10) || 0;
  }

  const filteredArgs = args.filter(
    (a) =>
      a !== '--no-open' &&
      a !== '--share' &&
      a !== '--live' &&
      a !== '--store' &&
      a !== '--db-path' &&
      a !== '--merge-recent' &&
      a !== '--server' &&
      a !== '--api-key' &&
      a !== 'sqlite' &&
      a !== 'jsonl'
  );

  // Remove the merge count value from filteredArgs
  if (mergeCount > 0) {
    const valIdx = filteredArgs.indexOf(String(mergeCount));
    if (valIdx !== -1) filteredArgs.splice(valIdx, 1);
  }

  // Parse --output / -o flag
  let outputPath: string | undefined;
  for (let i = 0; i < filteredArgs.length; i++) {
    if ((filteredArgs[i] === '--output' || filteredArgs[i] === '-o') && filteredArgs[i + 1]) {
      outputPath = filteredArgs[i + 1];
      filteredArgs.splice(i, 2);
      break;
    }
  }

  // Filter out --db-path value from the original args
  const cleanArgs = filteredArgs.filter((a) => a !== '--output' && a !== '-o');
  const targetArg = cleanArgs[0];

  const useSqlite = storageConfig?.backend === 'sqlite';

  // --list: show available runs
  if (targetArg === '--list') {
    let runs: string[];
    if (useSqlite) {
      const storage = await openSqliteDb(storageConfig);
      if (!storage) return 1;
      const { listRunIds } = await import('@red-codes/storage');
      const db = storage.db as import('better-sqlite3').Database;
      runs = listRunIds(db);
      storage.close();
    } else {
      runs = listRunsJsonl();
    }

    if (runs.length === 0) {
      process.stderr.write('\n  \x1b[2mNo runs recorded yet.\x1b[0m\n');
      process.stderr.write('  Run \x1b[1magentguard guard\x1b[0m to start recording.\n\n');
      return 0;
    }

    process.stderr.write('\n  \x1b[1mRecorded Runs\x1b[0m\n');
    process.stderr.write(`  ${'\x1b[2m'}${'─'.repeat(50)}${'\x1b[0m'}\n`);
    for (const id of runs.slice(0, 20)) {
      process.stderr.write(`  ${id}\n`);
    }
    if (runs.length > 20) {
      process.stderr.write(`  \x1b[2m... and ${runs.length - 20} more\x1b[0m\n`);
    }
    process.stderr.write('\n  Usage: agentguard session-viewer <runId>\n\n');
    return 0;
  }

  // ---------------------------------------------------------------------------
  // Load events (supports merging multiple recent runs)
  // ---------------------------------------------------------------------------

  let eventList: DomainEvent[];
  let decisionList: GovernanceDecisionRecord[];
  let sessionLabel: string;

  // --last with hook-based runs: auto-merge recent runs for a useful view
  const isLastMode = !targetArg || targetArg === '--last';
  const shouldMerge =
    mergeCount > 0 || (isLastMode && !useSqlite && listRunsJsonl()[0]?.startsWith('hook_'));

  if (shouldMerge && !useSqlite) {
    const runs = listRunsJsonl();
    if (runs.length === 0) {
      process.stderr.write('\n  \x1b[2mNo runs recorded yet.\x1b[0m\n');
      process.stderr.write('  Run \x1b[1magentguard guard\x1b[0m to start recording.\n\n');
      return 1;
    }
    const count = mergeCount > 0 ? mergeCount : Math.min(runs.length, 50);
    const runsToMerge = runs.slice(0, count);

    eventList = [];
    decisionList = [];
    for (const runId of runsToMerge) {
      eventList.push(...loadEventsJsonl(runId));
      decisionList.push(...loadDecisionsJsonl(runId));
    }
    // Sort by timestamp
    eventList.sort((a, b) => a.timestamp - b.timestamp);
    decisionList.sort((a, b) => a.timestamp - b.timestamp);

    sessionLabel = `session_merged_${runsToMerge.length}_runs`;
    process.stderr.write(`  Merging ${runsToMerge.length} recent runs into a single view...\n`);
  } else {
    // Single run mode
    let targetRunId: string | undefined;
    if (isLastMode) {
      if (useSqlite) {
        const storage = await openSqliteDb(storageConfig);
        if (!storage) return 1;
        const { getLatestRunId: getLatestRunIdSqlite } = await import('@red-codes/storage');
        const db = storage.db as import('better-sqlite3').Database;
        targetRunId = getLatestRunIdSqlite(db) ?? undefined;
        storage.close();
      } else {
        targetRunId = listRunsJsonl()[0];
      }
    } else {
      targetRunId = targetArg;
    }

    if (!targetRunId) {
      process.stderr.write('\n  \x1b[2mNo runs recorded yet.\x1b[0m\n');
      process.stderr.write('  Run \x1b[1magentguard guard\x1b[0m to start recording.\n\n');
      return 1;
    }

    if (useSqlite) {
      const storage = await openSqliteDb(storageConfig);
      if (!storage) return 1;
      const { loadRunEvents, loadRunDecisions } = await import('@red-codes/storage');
      const db = storage.db as import('better-sqlite3').Database;
      eventList = loadRunEvents(db, targetRunId);
      decisionList = loadRunDecisions(db, targetRunId);
      storage.close();
    } else {
      eventList = loadEventsJsonl(targetRunId);
      decisionList = loadDecisionsJsonl(targetRunId);
    }

    sessionLabel = targetRunId;
  }

  if (eventList.length === 0) {
    process.stderr.write(`  \x1b[31mError:\x1b[0m No events found.\n`);
    return 1;
  }

  // Build session and summary
  const session = buildReplaySession(sessionLabel, eventList);
  const evidenceSummary = aggregateEvents(eventList);

  // ---------------------------------------------------------------------------
  // Live mode — start an HTTP server, serve the page, poll for new events
  // ---------------------------------------------------------------------------
  if (live) {
    const singleRunId = !shouldMerge ? sessionLabel : undefined;

    const loadNewData = (afterEvent: number, afterDecision: number) => {
      // Re-read from JSONL to pick up events written since last poll
      let freshEvents: DomainEvent[];
      let freshDecisions: GovernanceDecisionRecord[];

      if (shouldMerge) {
        // In merge mode, re-scan all merged runs plus any new runs
        const currentRuns = listRunsJsonl();
        const count = mergeCount > 0 ? mergeCount : Math.min(currentRuns.length, 50);
        const runsToScan = currentRuns.slice(0, count);
        freshEvents = [];
        freshDecisions = [];
        for (const runId of runsToScan) {
          freshEvents.push(...loadEventsJsonl(runId));
          freshDecisions.push(...loadDecisionsJsonl(runId));
        }
        freshEvents.sort((a, b) => a.timestamp - b.timestamp);
        freshDecisions.sort((a, b) => a.timestamp - b.timestamp);
      } else {
        freshEvents = loadEventsJsonl(singleRunId!);
        freshDecisions = loadDecisionsJsonl(singleRunId!);
      }

      const newEvents = freshEvents.filter((e) => e.timestamp > afterEvent);
      const newDecisions = freshDecisions.filter((d) => d.timestamp > afterDecision);

      // Rebuild session to get updated actions and summary
      const freshSession = buildReplaySession(sessionLabel, freshEvents);
      const freshSummary = aggregateEvents(freshEvents);

      // Only return actions that are new (beyond what the client already has)
      const existingActionCount = eventList.length > 0
        ? buildReplaySession(sessionLabel, eventList.filter((e) => e.timestamp <= afterEvent)).actions.length
        : 0;
      const newActions = freshSession.actions.slice(existingActionCount);

      return {
        events: newEvents,
        decisions: newDecisions,
        actions: newActions,
        summary: {
          totalActions: freshSession.summary.totalActions,
          allowed: freshSession.summary.allowed,
          denied: freshSession.summary.denied,
          invariantViolations: freshSummary.invariantViolations,
          escalations: freshSummary.escalations,
          maxEscalationLevel: freshSummary.maxEscalationLevel,
          actionTypeBreakdown: freshSummary.actionTypeBreakdown,
        },
      };
    };

    try {
      // Start the server first to get the port, then generate HTML with the correct URL
      const server = await startLiveServer(loadNewData);
      const liveUrl = `http://127.0.0.1:${server.port}`;

      const liveHtml = generateSessionHtml(session, evidenceSummary, decisionList, eventList, {
        liveEndpoint: liveUrl,
      });
      server.setHtml(liveHtml);

      // Also write a static copy for offline viewing
      const outFile = outputPath || join(VIEWS_DIR, `${sessionLabel}.html`);
      const outDir = outputPath ? join(outFile, '..') : VIEWS_DIR;
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
      writeFileSync(outFile, liveHtml, 'utf8');

      process.stderr.write(`\n  \x1b[32m✓\x1b[0m Live session viewer running at: \x1b[1m\x1b[36m${liveUrl}\x1b[0m\n`);
      process.stderr.write(`  Press Ctrl+C to stop.\n\n`);

      if (!noOpen) {
        openInBrowser(liveUrl);
      }

      // Keep the process alive until interrupted
      await new Promise(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`  \x1b[31mError starting live server:\x1b[0m ${msg}\n`);
      process.stderr.write(`  Falling back to static HTML.\n\n`);
      // Fall through to static mode
    }
  }

  // ---------------------------------------------------------------------------
  // Static mode (default) — generate HTML file and optionally open it
  // ---------------------------------------------------------------------------

  // Generate HTML
  const html = generateSessionHtml(session, evidenceSummary, decisionList, eventList);

  // Determine output path
  const outFile = outputPath || join(VIEWS_DIR, `${sessionLabel}.html`);
  const outDir = outputPath ? join(outFile, '..') : VIEWS_DIR;
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  writeFileSync(outFile, html, 'utf8');

  process.stderr.write(`\n  \x1b[32m✓\x1b[0m Session viewer written to: ${outFile}\n`);

  // Upload to server if --share flag is set
  if (share) {
    process.stderr.write(`  Uploading to ${serverUrl}...\n`);
    try {
      const { viewerUrl } = await uploadToServer(serverUrl, sessionLabel, html, apiKey);
      process.stderr.write(`\n  \x1b[32m✓\x1b[0m Shared! View at:\n`);
      process.stderr.write(`  \x1b[1m\x1b[36m${viewerUrl}\x1b[0m\n\n`);

      if (!noOpen) {
        openInBrowser(viewerUrl);
      }
      return 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`  \x1b[31mError sharing:\x1b[0m ${msg}\n`);
      process.stderr.write(`  \x1b[2mFalling back to local file.\x1b[0m\n\n`);
    }
  }

  if (!noOpen) {
    process.stderr.write('  Opening in browser...\n\n');
    openInBrowser(outFile);
  } else {
    process.stderr.write('\n');
  }

  return 0;
}

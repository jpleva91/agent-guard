/**
 * watch command — Start all watchers and log events.
 *
 * Main developer workflow: monitors console, tests, and builds
 * for errors and converts them to BugMon encounters.
 *
 * Each watch session is a dungeon **run**: encounters are tracked,
 * combos accumulate, and a run summary is displayed on exit.
 *
 * With --governance: also starts the AgentGuard runtime monitor,
 * evaluating watcher events against policies and invariants.
 * Policy violations spawn boss-tier encounters.
 */

import type { Command } from 'commander';
import pino from 'pino';
import { EventBus } from '../../core/event-bus.js';
import { BugEngine } from '../../core/bug-engine.js';
import { BugRegistry } from '../../core/bug-registry.js';
import { ConsoleWatcher } from '../../watchers/console-watcher.js';
import { TestWatcher } from '../../watchers/test-watcher.js';
import { BuildWatcher } from '../../watchers/build-watcher.js';
import type { BugEvent, EventMap, RunSession, Severity } from '../../core/types.js';
import { createMonitor, ESCALATION } from '../../agentguard/monitor.js';
import type { Monitor } from '../../agentguard/monitor.js';
import {
  createRun,
  addEncounter,
  addResolution,
  endRun,
  getRunStats,
  getEncounterMode,
} from '../../domain/run-session.js';
import { renderStatusLine, renderRunSummary } from './run-summary.js';

/** Default policies for governance mode — derived from project conventions. */
const DEFAULT_POLICIES = [
  {
    id: 'deny-force-push',
    name: 'Deny Force Push',
    rules: [
      { action: 'git.force-push', effect: 'deny' as const, reason: 'Force pushes are forbidden' },
    ],
    severity: 5,
  },
  {
    id: 'deny-destructive-shell',
    name: 'Deny Destructive Commands',
    rules: [
      {
        action: 'shell.exec',
        effect: 'deny' as const,
        reason: 'Destructive shell commands are forbidden',
      },
    ],
    severity: 4,
  },
  {
    id: 'deny-protected-writes',
    name: 'Deny Protected File Writes',
    rules: [
      {
        action: 'file.write',
        effect: 'deny' as const,
        conditions: { scope: ['.github/workflows/', '.env', '*.secret', 'credentials.*'] },
        reason: 'Protected files cannot be modified',
      },
    ],
    severity: 4,
  },
  {
    id: 'limit-blast-radius',
    name: 'Blast Radius Limit',
    rules: [
      {
        action: '*',
        effect: 'deny' as const,
        conditions: { limit: 20 },
        reason: 'Too many files affected in a single operation',
      },
    ],
    severity: 3,
  },
];

/** Map governance severity to BugMon severity for encounter spawning. */
function governanceSeverityToBugSeverity(severity: number): Severity {
  if (severity >= 5) return 5;
  if (severity >= 4) return 4;
  if (severity >= 3) return 3;
  return 2;
}

/** Create a BugEvent from a governance violation for the BugEngine. */
function createGovernanceBugEvent(kind: string, reason: string, severity: number): BugEvent {
  return {
    id: `gov-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: `governance:${kind}`,
    source: 'build' as const,
    errorMessage: reason,
    timestamp: Date.now(),
    severity: governanceSeverityToBugSeverity(severity),
  };
}

/** Default interval for periodic status display (ms). */
const STATUS_INTERVAL_MS = 30_000;

/** Auto-resolve delay range for idle encounters (ms). */
const IDLE_RESOLVE_MIN_MS = 2_000;
const IDLE_RESOLVE_MAX_MS = 5_000;

interface WatchOptions {
  testDir: string;
  buildDir: string;
  governance: boolean;
  idleThreshold: string;
}

export function registerWatchCommand(program: Command): void {
  program
    .command('watch')
    .description('Start watching for bugs in your development environment')
    .option('-t, --test-dir <dir>', 'Test directory to watch', './tests')
    .option('-b, --build-dir <dir>', 'Build output directory to watch', './dist')
    .option('-g, --governance', 'Enable AgentGuard governance monitoring', false)
    .option('--idle-threshold <n>', 'Severity threshold for idle auto-resolve (1-5)', '2')
    .action((options: WatchOptions) => {
      const logger = pino({ name: 'bugmon' });
      const eventBus = new EventBus<EventMap>();
      const registry = new BugRegistry();
      const engine = new BugEngine(eventBus, registry);

      // --- Run session ---
      const idleThreshold = Math.max(1, Math.min(5, parseInt(options.idleThreshold, 10) || 2));
      let run: RunSession = createRun({
        repo: process.cwd(),
        idleThreshold,
      });

      // Track pending idle auto-resolve timers so we can clear on shutdown
      const idleTimers: ReturnType<typeof setTimeout>[] = [];
      // Track monster names for resolution logging (MonsterDefeated only has id)
      const monsterNames = new Map<number, string>();

      // Log all events and track encounters in the run
      eventBus.on('BugDetected', ({ bug }) => {
        logger.info({ bugId: bug.id, type: bug.type, severity: bug.severity }, 'Bug detected!');
      });

      eventBus.on('MonsterSpawned', ({ monster, bug }) => {
        monsterNames.set(monster.id, monster.name);
        const mode = getEncounterMode(run, bug.severity);
        const result = addEncounter(run, {
          monsterId: monster.id,
          monsterName: monster.name,
          error: bug.errorMessage,
          file: bug.file,
          line: bug.line,
        });
        run = result.run;

        if (mode === 'idle') {
          logger.info(
            { monster: monster.name, severity: bug.severity, mode: 'idle' },
            `[Idle] ${monster.name} appeared (severity ${bug.severity}) — auto-resolving...`
          );
          // Auto-resolve after a short delay
          const delay =
            IDLE_RESOLVE_MIN_MS + Math.random() * (IDLE_RESOLVE_MAX_MS - IDLE_RESOLVE_MIN_MS);
          const timer = setTimeout(() => {
            engine.resolveBug(bug.id);
          }, delay);
          idleTimers.push(timer);
        } else {
          logger.warn(
            { monster: monster.name, hp: monster.maxHp, severity: bug.severity, mode: 'active' },
            `[BOSS] ${monster.name} appeared! Severity ${bug.severity} — fix required`
          );
        }
      });

      eventBus.on('MonsterDefeated', ({ monsterId, xp }) => {
        const monsterName = monsterNames.get(monsterId) || `Monster#${monsterId}`;
        const result = addResolution(run, { monsterId, monsterName, baseXP: xp });
        run = result.run;

        const comboInfo = result.tier
          ? ` (${result.tier.label} x${result.multiplier})`
          : result.multiplier > 1
            ? ` (x${result.multiplier})`
            : '';
        logger.info(
          { monsterId, xp: result.totalXP, combo: run.combo.streak },
          `Defeated! +${result.totalXP} XP${comboInfo}`
        );
      });

      // Governance monitor (optional)
      let monitor: Monitor | null = null;

      if (options.governance) {
        monitor = createMonitor({ policyDefs: DEFAULT_POLICIES });

        const status = monitor.getStatus();
        logger.info(
          {
            policies: status.policyCount,
            invariants: status.invariantCount,
            policyErrors: status.policyErrors,
          },
          'AgentGuard governance enabled'
        );

        // Bridge governance events to logging and BugMon encounters
        monitor.bus.on('*', (payload: unknown) => {
          const event = payload as Record<string, unknown>;
          const kind = event.kind as string;
          if (!kind) return;

          if (kind === 'PolicyDenied' || kind === 'UnauthorizedAction') {
            const reason = (event.reason as string) || 'Policy violation';
            const severity = (event.severity as number) || 3;
            logger.warn(
              { kind, action: event.action, reason, agentId: event.agentId },
              'Governance violation'
            );

            // Spawn a boss encounter for policy violations
            const bugEvent = createGovernanceBugEvent(kind, reason, severity);
            engine.handleBug(bugEvent);
          }

          if (kind === 'InvariantViolation') {
            logger.warn(
              {
                kind,
                invariantId: event.invariantId,
                expected: event.expected,
                actual: event.actual,
              },
              'Invariant violation'
            );

            const reason = `Invariant violated: ${event.actual || 'unknown'}`;
            const bugEvent = createGovernanceBugEvent(kind, reason, 4);
            engine.handleBug(bugEvent);
          }

          if (kind === 'BlastRadiusExceeded') {
            logger.warn(
              { kind, filesAffected: event.filesAffected, limit: event.limit },
              'Blast radius exceeded'
            );
          }
        });

        monitor.bus.on('escalation', (payload: unknown) => {
          const data = payload as Record<string, unknown>;
          const level = data.level as number;
          const labels = ['NORMAL', 'ELEVATED', 'HIGH', 'LOCKDOWN'];
          logger.warn({ escalationLevel: labels[level] || level }, 'Escalation level changed');

          if (level >= ESCALATION.LOCKDOWN) {
            logger.error('Session in LOCKDOWN — human intervention required');
          }
        });
      }

      // Start systems
      engine.start();

      const consoleWatcher = new ConsoleWatcher(eventBus);
      const testWatcher = new TestWatcher(eventBus, { testDir: options.testDir });
      const buildWatcher = new BuildWatcher(eventBus, { buildDir: options.buildDir });

      consoleWatcher.start();
      testWatcher.start();
      buildWatcher.start();

      if (monitor) {
        logger.info(
          { runId: run.runId, idleThreshold },
          'Dungeon run started — watchers + AgentGuard governance active'
        );
      } else {
        logger.info(
          { runId: run.runId, idleThreshold },
          'Dungeon run started — listening for bugs...'
        );
      }

      // Periodic status display
      const statusInterval = setInterval(() => {
        const stats = getRunStats(run);
        if (stats.encounters > 0) {
          console.log(renderStatusLine(stats));
        }
      }, STATUS_INTERVAL_MS);

      // Graceful shutdown — end the run and display summary
      const shutdown = () => {
        clearInterval(statusInterval);
        for (const timer of idleTimers) clearTimeout(timer);

        consoleWatcher.stop();
        testWatcher.stop();
        buildWatcher.stop();
        engine.stop();

        // End the run and display the report card
        run = endRun(run);
        console.log(renderRunSummary(run));

        if (monitor) {
          const status = monitor.getStatus();
          logger.info(
            {
              totalEvaluations: status.totalEvaluations,
              totalDenials: status.totalDenials,
              totalViolations: status.totalViolations,
              eventCount: status.eventCount,
              uptime: status.uptime,
            },
            'Governance session summary'
          );
        }

        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    });
}

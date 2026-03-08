/**
 * watch command — Start all watchers and log events.
 *
 * Main developer workflow: monitors console, tests, and builds
 * for errors and converts them to BugMon encounters.
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
import type { BugEvent, EventMap, Severity } from '../../core/types.js';
import { createMonitor, ESCALATION } from '../../agentguard/monitor.js';
import type { Monitor } from '../../agentguard/monitor.js';

/** Default policies for governance mode — derived from project conventions. */
const DEFAULT_POLICIES = [
  {
    id: 'deny-force-push',
    name: 'Deny Force Push',
    rules: [{ action: 'git.force-push', effect: 'deny' as const, reason: 'Force pushes are forbidden' }],
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
function createGovernanceBugEvent(
  kind: string,
  reason: string,
  severity: number,
): BugEvent {
  return {
    id: `gov-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: `governance:${kind}`,
    source: 'build' as const,
    errorMessage: reason,
    timestamp: Date.now(),
    severity: governanceSeverityToBugSeverity(severity),
  };
}

interface WatchOptions {
  testDir: string;
  buildDir: string;
  governance: boolean;
}

export function registerWatchCommand(program: Command): void {
  program
    .command('watch')
    .description('Start watching for bugs in your development environment')
    .option('-t, --test-dir <dir>', 'Test directory to watch', './tests')
    .option('-b, --build-dir <dir>', 'Build output directory to watch', './dist')
    .option('-g, --governance', 'Enable AgentGuard governance monitoring', false)
    .action((options: WatchOptions) => {
      const logger = pino({ name: 'bugmon' });
      const eventBus = new EventBus<EventMap>();
      const registry = new BugRegistry();
      const engine = new BugEngine(eventBus, registry);

      // Log all events
      eventBus.on('BugDetected', ({ bug }) => {
        logger.info({ bugId: bug.id, type: bug.type, severity: bug.severity }, 'Bug detected!');
      });

      eventBus.on('MonsterSpawned', ({ monster, bug }) => {
        logger.info(
          { monster: monster.name, hp: monster.maxHp, bugType: bug.type },
          'Monster spawned!'
        );
      });

      eventBus.on('MonsterDefeated', ({ monsterId, xp }) => {
        logger.info({ monsterId, xp }, 'Monster defeated!');
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
              { kind, invariantId: event.invariantId, expected: event.expected, actual: event.actual },
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
        logger.info('BugMon watchers + AgentGuard governance started. Listening...');
      } else {
        logger.info('BugMon watchers started. Listening for bugs...');
      }

      // Graceful shutdown
      const shutdown = () => {
        logger.info('Shutting down...');
        consoleWatcher.stop();
        testWatcher.stop();
        buildWatcher.stop();
        engine.stop();

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

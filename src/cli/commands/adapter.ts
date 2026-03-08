// CLI adapter — wraps child processes and intercepts stderr errors

import { spawn } from 'node:child_process';
import { parseErrors } from '../../core/error-parser.js';
import { parseStackTrace, getUserFrame } from '../../core/stacktrace-parser.js';
import { matchMonster } from '../../core/matcher.js';
import { recordEncounter } from '../../ecosystem/storage.js';
import {
  renderEncounter,
  renderEncounterPrompt,
  renderBossEncounter,
  renderComboBreak,
  renderRunSummary,
} from '../renderer.js';
import { renderContributionPrompt, LOW_CONFIDENCE_THRESHOLD } from './contribute.js';
import { interactiveCache } from './catch.js';
import { checkBossEncounter, BOSS_TRIGGERS } from '../../ecosystem/bosses.js';
import { createRecorder } from '../recorder.js';
import { createRun, addEncounter, addBossDefeat, endRun } from '../../domain/run-session.js';
import type { RunSession } from '../../core/types.js';
import type { ParsedError } from '../../core/error-parser.js';
import type { Recorder } from '../recorder.js';
import type { AutoWalkControls } from './auto-walk.js';

interface WatchOptions {
  interactive?: boolean;
  openBrowser?: boolean;
  walk?: boolean;
  repo?: string;
}

interface WatchState {
  errorCounts: Map<string, number>;
  triggeredBosses: Set<string>;
  autoWalker: AutoWalkControls | null;
  recorder: Recorder;
  currentRun: RunSession;
}

export function watch(command: string, args: string[], options: WatchOptions = {}): Promise<number> {
  if (!command || typeof command !== 'string' || command.trim().length === 0) {
    process.stderr.write('bugmon: watch requires a non-empty command\n');
    return Promise.resolve(1);
  }

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['inherit', 'inherit', 'pipe'],
      shell: process.platform === 'win32',
    });

    const recorder = createRecorder(command, args);
    process.stderr.write(`  \x1b[2mRecording session: ${recorder.sessionId}\x1b[0m\n`);

    let stderrBuffer = '';
    const errorQueue: ParsedError[] = [];
    let processing = false;
    const errorCounts = new Map<string, number>();
    const triggeredBosses = new Set<string>();
    let autoWalker: AutoWalkControls | null = null;

    let currentRun = createRun({ repo: options.repo || undefined });

    if (options.walk) {
      import('./auto-walk.js')
        .then(({ startAutoWalk }) => {
          autoWalker = startAutoWalk({
            onEncounter: () => {},
          });
        })
        .catch(() => {});
    }

    child.stderr!.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderrBuffer += text;

      process.stderr.write(chunk);

      if (options.interactive) {
        const errors = parseErrors(stderrBuffer);
        if (errors.length > 0) {
          for (const err of errors) {
            const key = `${err.type}:${err.message}`;
            if (!errorQueue.find((e) => `${e.type}:${e.message}` === key)) {
              errorQueue.push(err);
            }
          }
          if (!processing) {
            processing = true;
            processInteractiveQueue(errorQueue, options, {
              errorCounts,
              triggeredBosses,
              autoWalker,
              recorder,
              currentRun,
            }).then((updatedRun) => {
              if (updatedRun) currentRun = updatedRun;
              processing = false;
            });
          }
        }
      }
    });

    child.on('error', (err: Error) => {
      process.stderr.write(`bugmon: failed to start "${command}": ${err.message}\n`);
      resolve(1);
    });

    child.on('close', async (code: number | null) => {
      if (stderrBuffer.length > 0) {
        if (options.interactive) {
          const errors = parseErrors(stderrBuffer);
          for (const err of errors) {
            const key = `${err.type}:${err.message}`;
            if (!errorQueue.find((e) => `${e.type}:${e.message}` === key)) {
              errorQueue.push(err);
            }
          }
          if (errorQueue.length > 0 && !processing) {
            await processInteractiveQueue(errorQueue, options, {
              errorCounts,
              triggeredBosses,
              autoWalker,
              recorder,
              currentRun,
            });
          }
        } else {
          currentRun = processErrors(stderrBuffer, {
            errorCounts,
            triggeredBosses,
            recorder,
            currentRun,
          });
        }
      }

      if (currentRun && currentRun.encounters.length > 0) {
        const finalRun = endRun(currentRun, 'completed');
        if (finalRun.summary) renderRunSummary(finalRun.summary);
      }

      if (autoWalker) autoWalker.stop();

      recorder.end(code || 0);
      process.stderr.write(
        `  \x1b[2mSession recorded: bugmon replay ${recorder.sessionId}\x1b[0m\n`,
      );

      resolve(code || 0);
    });
  });
}

async function processInteractiveQueue(
  queue: ParsedError[],
  options: WatchOptions,
  state: WatchState,
): Promise<RunSession> {
  while (queue.length > 0) {
    const error = queue.shift()!;

    const frames = parseStackTrace(error.rawLines as string[]);
    const location = getUserFrame(frames);
    const { monster, confidence } = matchMonster(error);

    state.errorCounts.set(error.type, (state.errorCounts.get(error.type) || 0) + 1);

    if (state.recorder) {
      state.recorder.recordError(error, location);
      state.recorder.recordEncounter(monster, error);
    }

    if (state.currentRun) {
      const encounterResult = addEncounter(state.currentRun, {
        monsterId: monster.id,
        monsterName: monster.name,
        error: error.message.slice(0, 200),
        file: location?.file || undefined,
        line: location?.line || undefined,
      });
      state.currentRun = encounterResult.run;
      if (encounterResult.brokeStreak >= 2) {
        renderComboBreak(encounterResult.brokeStreak);
      }
    }

    const { xpGained, isNew } = recordEncounter(
      monster,
      error.message,
      location?.file || null,
      location?.line || null,
    );

    const bossCheck = checkBossEncounter(state.errorCounts, error.message);
    if (bossCheck && !state.triggeredBosses.has(bossCheck.boss.id)) {
      state.triggeredBosses.add(bossCheck.boss.id);

      if (state.recorder) state.recorder.recordBoss(bossCheck.boss);
      if (state.autoWalker) state.autoWalker.pause();

      renderBossEncounter(bossCheck.boss);
      const { interactiveBossBattle } = await import('./boss-battle.js');
      const bossResult = await interactiveBossBattle(bossCheck.boss);

      if (state.currentRun && bossResult?.defeated) {
        state.currentRun = addBossDefeat(state.currentRun, {
          bossId: bossCheck.boss.id,
          bossName: bossCheck.boss.name,
          xp: 200,
        });
      }

      if (state.autoWalker) state.autoWalker.resume();

      const trigger = BOSS_TRIGGERS[bossCheck.trigger];
      if (trigger?.errorTypes) {
        for (const et of trigger.errorTypes) {
          state.errorCounts.set(et, 0);
        }
      }
      continue;
    }

    renderEncounter(monster, error, location, confidence);

    const parts = [`+${xpGained} XP`];
    if (isNew) parts.push('NEW BugDex entry!');
    process.stderr.write(`  ${parts.join(' | ')}\n`);

    if (state.autoWalker) state.autoWalker.pause();

    renderEncounterPrompt(monster);

    const result = await interactiveCache(monster, {
      message: error.message,
      file: location?.file,
      line: location?.line,
    });

    if (state.autoWalker) state.autoWalker.resume();

    if (state.recorder) {
      if (result.cached) {
        state.recorder.recordBattle('victory', { cached: true });
      } else if (result.fled) {
        state.recorder.recordBattle('fled');
      } else if (result.playerFainted) {
        state.recorder.recordBattle('defeat');
      }
    }

    if (result.cached) {
      process.stderr.write(`  \x1b[33m+50 XP (cache bonus)\x1b[0m\n\n`);
    }

    if (confidence < LOW_CONFIDENCE_THRESHOLD) {
      renderContributionPrompt();
    }

    if (options.openBrowser && location?.file) {
      process.stderr.write(
        `  \x1b[2mOpen in browser: file://${location.file}${location.line ? '#L' + location.line : ''}\x1b[0m\n\n`,
      );
    }
  }

  return state.currentRun;
}

function processErrors(
  text: string,
  state: Omit<WatchState, 'autoWalker'>,
): RunSession {
  const errors = parseErrors(text);

  for (const error of errors) {
    const frames = parseStackTrace(error.rawLines as string[]);
    const location = getUserFrame(frames);

    const { monster, confidence } = matchMonster(error);

    state.errorCounts.set(error.type, (state.errorCounts.get(error.type) || 0) + 1);

    if (state.recorder) {
      state.recorder.recordError(error, location);
      state.recorder.recordEncounter(monster, error);
    }

    if (state.currentRun) {
      const encounterResult = addEncounter(state.currentRun, {
        monsterId: monster.id,
        monsterName: monster.name,
        error: error.message.slice(0, 200),
        file: location?.file || undefined,
        line: location?.line || undefined,
      });
      state.currentRun = encounterResult.run;
      if (encounterResult.brokeStreak >= 2) {
        renderComboBreak(encounterResult.brokeStreak);
      }
    }

    const { xpGained, isNew } = recordEncounter(
      monster,
      error.message,
      location?.file || null,
      location?.line || null,
    );

    const bossCheck = checkBossEncounter(state.errorCounts, error.message);
    if (bossCheck && !state.triggeredBosses.has(bossCheck.boss.id)) {
      state.triggeredBosses.add(bossCheck.boss.id);
      if (state.recorder) state.recorder.recordBoss(bossCheck.boss);
      renderBossEncounter(bossCheck.boss);

      const trigger = BOSS_TRIGGERS[bossCheck.trigger];
      if (trigger?.errorTypes) {
        for (const et of trigger.errorTypes) {
          state.errorCounts.set(et, 0);
        }
      }
      continue;
    }

    renderEncounter(monster, error, location, confidence);

    const parts = [`+${xpGained} XP`];
    if (isNew) parts.push('NEW BugDex entry!');
    process.stderr.write(`  ${parts.join(' | ')}\n\n`);

    if (confidence < LOW_CONFIDENCE_THRESHOLD) {
      renderContributionPrompt();
    }
  }

  return state.currentRun;
}

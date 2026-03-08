// CLI adapter — wraps child processes and intercepts stderr errors
// Supports two modes:
//   - watch: passive monitoring, shows encounters on exit
//   - watch --cache: interactive mode, pauses on errors for battle/cache

import { spawn } from 'node:child_process';
import { parseErrors } from '../error-parser.js';
import { parseStackTrace, getUserFrame } from '../stacktrace-parser.js';
import { matchMonster } from '../matcher.js';
import { recordEncounter } from '../../ecosystem/storage.js';
import { renderEncounter, renderEncounterPrompt, renderBossEncounter, renderComboBreak, renderRunSummary } from './renderer.js';
import { renderContributionPrompt, LOW_CONFIDENCE_THRESHOLD } from './contribute.js';
import { interactiveCache } from './catch.js';
import { checkBossEncounter, BOSS_TRIGGERS } from '../../ecosystem/bosses.js';
import { createRun, addEncounter, addBossDefeat, endRun } from '../../domain/run-session.js';

/**
 * Run a command and intercept errors from stderr.
 * @param {string} command - The command to run
 * @param {string[]} args - Command arguments
 * @param {{interactive?: boolean, openBrowser?: boolean}} options
 * @returns {Promise<number>} Exit code
 */
export function watch(command, args, options = {}) {
  if (!command || typeof command !== 'string' || command.trim().length === 0) {
    process.stderr.write('bugmon: watch requires a non-empty command\n');
    return Promise.resolve(1);
  }

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['inherit', 'inherit', 'pipe'],
      shell: process.platform === 'win32',
    });

    let stderrBuffer = '';
    const errorQueue = [];
    let processing = false;
    const errorCounts = new Map();
    const triggeredBosses = new Set();
    let autoWalker = null;

    // Create a run session for this watch invocation
    let currentRun = createRun({ repo: options.repo || null });

    // Start auto-walk if requested
    if (options.walk) {
      import('./auto-walk.js').then(({ startAutoWalk }) => {
        autoWalker = startAutoWalk({
          onEncounter: () => {}, // encounters come from real errors
        });
      }).catch(() => {}); // best effort
    }

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrBuffer += text;

      // Pass stderr through immediately so developers still see real output
      process.stderr.write(chunk);

      // In interactive mode, check for errors in real-time
      if (options.interactive) {
        const errors = parseErrors(stderrBuffer);
        if (errors.length > 0) {
          // Queue new errors we haven't processed yet
          for (const err of errors) {
            const key = `${err.type}:${err.message}`;
            if (!errorQueue.find(e => `${e.type}:${e.message}` === key)) {
              errorQueue.push(err);
            }
          }
          // Process queue if not already doing so
          if (!processing) {
            processing = true;
            processInteractiveQueue(errorQueue, options, { errorCounts, triggeredBosses, autoWalker, currentRun }).then((updatedRun) => {
              if (updatedRun) currentRun = updatedRun;
              processing = false;
            });
          }
        }
      }
    });

    child.on('error', (err) => {
      process.stderr.write(`bugmon: failed to start "${command}": ${err.message}\n`);
      resolve(1);
    });

    child.on('close', async (code) => {
      // Process any remaining stderr
      if (stderrBuffer.length > 0) {
        if (options.interactive) {
          // Drain remaining error queue
          const errors = parseErrors(stderrBuffer);
          for (const err of errors) {
            const key = `${err.type}:${err.message}`;
            if (!errorQueue.find(e => `${e.type}:${e.message}` === key)) {
              errorQueue.push(err);
            }
          }
          if (errorQueue.length > 0 && !processing) {
            await processInteractiveQueue(errorQueue, options, { errorCounts, triggeredBosses, autoWalker, currentRun });
          }
        } else {
          currentRun = processErrors(stderrBuffer, { errorCounts, triggeredBosses, currentRun });
        }
      }

      // End the run and show summary
      if (currentRun && currentRun.encounters.length > 0) {
        const finalRun = endRun(currentRun, 'completed');
        renderRunSummary(finalRun.summary);
      }

      // Stop auto-walk on exit
      if (autoWalker) autoWalker.stop();

      resolve(code || 0);
    });
  });
}

/**
 * Process the interactive error queue — pause for each encounter.
 * @param {Array} queue
 * @param {object} options
 * @param {object} state - Shared state (errorCounts, triggeredBosses, autoWalker)
 */
async function processInteractiveQueue(queue, options, state) {
  while (queue.length > 0) {
    const error = queue.shift();

    const frames = parseStackTrace(error.rawLines);
    const location = getUserFrame(frames);
    const { monster, confidence } = matchMonster(error);

    // Track error type counts for boss triggers
    state.errorCounts.set(error.type, (state.errorCounts.get(error.type) || 0) + 1);

    // Track encounter in the run session (breaks combo)
    if (state.currentRun) {
      const encounterResult = addEncounter(state.currentRun, {
        monsterId: monster.id,
        monsterName: monster.name,
        error: error.message.slice(0, 200),
        file: location?.file || null,
        line: location?.line || null,
      });
      state.currentRun = encounterResult.run;
      if (encounterResult.brokeStreak >= 2) {
        renderComboBreak(encounterResult.brokeStreak);
      }
    }

    // Record in BugDex
    const { xpGained, isNew } = recordEncounter(
      monster,
      error.message,
      location?.file || null,
      location?.line || null,
    );

    // Check for boss trigger before showing normal encounter
    const bossCheck = checkBossEncounter(state.errorCounts, error.message);
    if (bossCheck && !state.triggeredBosses.has(bossCheck.boss.id)) {
      state.triggeredBosses.add(bossCheck.boss.id);

      // Pause auto-walk during boss battle
      if (state.autoWalker) state.autoWalker.pause();

      renderBossEncounter(bossCheck.boss);
      const { interactiveBossBattle } = await import('./boss-battle.js');
      const bossResult = await interactiveBossBattle(bossCheck.boss);

      // Track boss defeat in run
      if (state.currentRun && bossResult?.defeated) {
        state.currentRun = addBossDefeat(state.currentRun, {
          bossId: bossCheck.boss.id,
          bossName: bossCheck.boss.name,
          xp: 200,
        });
      }

      if (state.autoWalker) state.autoWalker.resume();

      // Reset error counts for boss trigger types to prevent re-triggering
      const trigger = BOSS_TRIGGERS[bossCheck.trigger];
      if (trigger?.errorTypes) {
        for (const et of trigger.errorTypes) {
          state.errorCounts.set(et, 0);
        }
      }
      continue;
    }

    // Show the encounter card
    renderEncounter(monster, error, location, confidence);

    const parts = [`+${xpGained} XP`];
    if (isNew) parts.push('NEW BugDex entry!');
    process.stderr.write(`  ${parts.join(' | ')}\n`);

    // Prompt for battle — pause auto-walk during interactive battle
    if (state.autoWalker) state.autoWalker.pause();

    renderEncounterPrompt(monster);

    const result = await interactiveCache(monster, {
      message: error.message,
      file: location?.file,
      line: location?.line,
    });

    if (state.autoWalker) state.autoWalker.resume();

    if (result.cached) {
      process.stderr.write(`  \x1b[33m+50 XP (cache bonus)\x1b[0m\n\n`);
    }

    // Suggest contributing if the match was weak
    if (confidence < LOW_CONFIDENCE_THRESHOLD) {
      renderContributionPrompt();
    }

    // Offer to open in browser
    if (options.openBrowser && location?.file) {
      process.stderr.write(`  \x1b[2mOpen in browser: file://${location.file}${location.line ? '#L' + location.line : ''}\x1b[0m\n\n`);
    }
  }

  return state.currentRun;
}

/**
 * Process a block of stderr text, find errors, and render encounters (passive mode).
 * @param {string} text
 * @param {object} state - Shared state (errorCounts, triggeredBosses)
 */
function processErrors(text, state) {
  const errors = parseErrors(text);

  for (const error of errors) {
    // Parse stack trace for location info
    const frames = parseStackTrace(error.rawLines);
    const location = getUserFrame(frames);

    // Match to a BugMon
    const { monster, confidence } = matchMonster(error);

    // Track error type counts for boss triggers
    state.errorCounts.set(error.type, (state.errorCounts.get(error.type) || 0) + 1);

    // Track encounter in the run session
    if (state.currentRun) {
      const encounterResult = addEncounter(state.currentRun, {
        monsterId: monster.id,
        monsterName: monster.name,
        error: error.message.slice(0, 200),
        file: location?.file || null,
        line: location?.line || null,
      });
      state.currentRun = encounterResult.run;
      if (encounterResult.brokeStreak >= 2) {
        renderComboBreak(encounterResult.brokeStreak);
      }
    }

    // Record in BugDex
    const { xpGained, isNew } = recordEncounter(
      monster,
      error.message,
      location?.file || null,
      location?.line || null,
    );

    // Check for boss trigger
    const bossCheck = checkBossEncounter(state.errorCounts, error.message);
    if (bossCheck && !state.triggeredBosses.has(bossCheck.boss.id)) {
      state.triggeredBosses.add(bossCheck.boss.id);
      renderBossEncounter(bossCheck.boss);

      // Reset error counts for this trigger
      const trigger = BOSS_TRIGGERS[bossCheck.trigger];
      if (trigger?.errorTypes) {
        for (const et of trigger.errorTypes) {
          state.errorCounts.set(et, 0);
        }
      }
      continue;
    }

    // Render the encounter
    renderEncounter(monster, error, location, confidence);

    // XP notification
    const parts = [`+${xpGained} XP`];
    if (isNew) parts.push('NEW BugDex entry!');
    process.stderr.write(`  ${parts.join(' | ')}\n\n`);

    // Suggest contributing if the match was weak
    if (confidence < LOW_CONFIDENCE_THRESHOLD) {
      renderContributionPrompt();
    }
  }

  return state.currentRun;
}

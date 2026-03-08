// Session recorder — captures canonical events during a watch session.
// Wraps the session store and provides high-level recording methods.

import { createSession } from './session-store.js';
import {
  createEvent,
  ERROR_OBSERVED,
  ENCOUNTER_STARTED,
  BATTLE_ENDED,
  TEST_COMPLETED,
  FILE_SAVED,
} from '../domain/events.js';
import type { DomainEvent } from '../core/types.js';

interface ErrorLike {
  message: string;
  type?: string;
  severity?: number;
}

interface LocationLike {
  file?: string;
  line?: number;
}

interface MonsterLike {
  id: number;
  name: string;
  type: string;
  hp: number;
}

interface BossLike {
  id: string;
  name: string;
  type: string;
}

export interface Recorder {
  readonly sessionId: string;
  record(event: DomainEvent): void;
  recordError(error: ErrorLike, location?: LocationLike | null): void;
  recordEncounter(monster: MonsterLike, error: ErrorLike): void;
  recordBattle(result: string, details?: Record<string, unknown>): void;
  recordBoss(boss: BossLike): void;
  recordTest(result: string, details?: Record<string, unknown>): void;
  recordFileModified(file: string): void;
  recordResolution(monsterName: string): void;
  end(exitCode?: number): void;
}

export function createRecorder(command: string, args: string[] = []): Recorder {
  const fullCommand = [command, ...args].join(' ');
  const session = createSession({ command: fullCommand });
  const startTime = Date.now();

  let bugsDefeated = 0;
  let bossesEncountered = 0;
  let errorsObserved = 0;

  return {
    get sessionId() {
      return session.id;
    },

    record(event: DomainEvent) {
      session.append(event as Record<string, unknown>);
    },

    recordError(error: ErrorLike, location?: LocationLike | null) {
      errorsObserved++;
      const event = createEvent(ERROR_OBSERVED, {
        message: error.message,
        errorType: error.type,
        file: location?.file || null,
        line: location?.line || null,
        severity: error.severity || 3,
      });
      session.append(event as Record<string, unknown>);
    },

    recordEncounter(monster: MonsterLike, error: ErrorLike) {
      const event = createEvent(ENCOUNTER_STARTED, {
        enemy: monster.name,
        playerLevel: null,
      }) as Record<string, unknown>;
      event.monster = {
        id: monster.id,
        name: monster.name,
        type: monster.type,
        hp: monster.hp,
      };
      event.errorMessage = error.message;
      session.append(event);
    },

    recordBattle(result: string, details: Record<string, unknown> = {}) {
      if (result === 'victory') bugsDefeated++;
      const event = createEvent(BATTLE_ENDED, { result, ...details });
      session.append(event as Record<string, unknown>);
    },

    recordBoss(boss: BossLike) {
      bossesEncountered++;
      const event = createEvent(ENCOUNTER_STARTED, {
        enemy: boss.name,
        playerLevel: null,
      }) as Record<string, unknown>;
      event.isBoss = true;
      event.boss = { id: boss.id, name: boss.name, type: boss.type };
      session.append(event);
    },

    recordTest(result: string, details: Record<string, unknown> = {}) {
      const event = createEvent(TEST_COMPLETED, { result, ...details });
      session.append(event as Record<string, unknown>);
    },

    recordFileModified(file: string) {
      const event = createEvent(FILE_SAVED, { file });
      session.append(event as Record<string, unknown>);
    },

    recordResolution(monsterName: string) {
      bugsDefeated++;
      const event = createEvent(BATTLE_ENDED, { result: 'resolved' }) as Record<string, unknown>;
      event.monsterName = monsterName;
      session.append(event);
    },

    end(exitCode?: number) {
      session.end({
        bugsDefeated,
        bossesEncountered,
        errorsObserved,
        exitCode: exitCode ?? null,
        duration: Date.now() - startTime,
      });
    },
  };
}

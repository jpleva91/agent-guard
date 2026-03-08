/**
 * BugEngine — Bug lifecycle management.
 *
 * Listens for BugDetected events, registers bugs, spawns monsters.
 * Handles bug resolution and emits corresponding game events.
 *
 * Flow: BugDetected → register → MonsterSpawned
 *       resolveBug → mark resolved → MonsterDefeated
 */

import type { BugEvent, EventMap, Monster, MonsterType, Severity } from './types.js';
import type { EventBus } from './event-bus.js';
import type { BugRegistry } from './bug-registry.js';

/** Maps bug source type to a monster element type */
const SOURCE_TO_MONSTER_TYPE: Record<string, MonsterType> = {
  console: 'backend',
  test: 'testing',
  build: 'devops',
};

/** Base stats scaled by severity */
const SEVERITY_STATS: Record<Severity, { hp: number; attack: number; defense: number; speed: number }> = {
  1: { hp: 20, attack: 5, defense: 3, speed: 4 },
  2: { hp: 30, attack: 8, defense: 5, speed: 5 },
  3: { hp: 45, attack: 12, defense: 8, speed: 7 },
  4: { hp: 60, attack: 16, defense: 11, speed: 9 },
  5: { hp: 80, attack: 20, defense: 14, speed: 11 },
};

let monsterIdCounter = 0;

/** Create a monster from a bug event. Deterministic given same input + counter state. */
function createMonsterFromBug(bug: BugEvent): Monster {
  const stats = SEVERITY_STATS[bug.severity];
  const monsterType = SOURCE_TO_MONSTER_TYPE[bug.source] ?? 'backend';
  const id = ++monsterIdCounter;

  return {
    id,
    name: bug.type || `Bug#${id}`,
    type: monsterType,
    hp: stats.hp,
    maxHp: stats.hp,
    attack: stats.attack,
    defense: stats.defense,
    speed: stats.speed,
    moves: ['tackle', 'glitch'],
  };
}

export class BugEngine {
  private readonly eventBus: EventBus<EventMap>;
  private readonly registry: BugRegistry;
  private readonly monsterMap = new Map<string, Monster>();
  private unsubscribe: (() => void) | null = null;

  constructor(eventBus: EventBus<EventMap>, registry: BugRegistry) {
    this.eventBus = eventBus;
    this.registry = registry;
  }

  /** Start listening for BugDetected events. */
  start(): void {
    this.unsubscribe = this.eventBus.on('BugDetected', ({ bug }) => {
      this.handleBug(bug);
    });
  }

  /** Stop listening. */
  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Process a detected bug: register it and spawn a monster. */
  handleBug(bug: BugEvent): void {
    const added = this.registry.add(bug);
    if (!added) return; // duplicate

    const monster = createMonsterFromBug(bug);
    this.monsterMap.set(bug.id, monster);

    this.eventBus.emit('MonsterSpawned', { monster, bug });
  }

  /** Resolve a bug: mark it resolved and defeat the monster. */
  resolveBug(bugId: string): void {
    const resolved = this.registry.resolve(bugId);
    if (!resolved) return;

    const monster = this.monsterMap.get(bugId);
    if (!monster) return;

    const xp = monster.maxHp + monster.attack;
    this.eventBus.emit('MonsterDefeated', { monsterId: monster.id, xp });
    this.monsterMap.delete(bugId);
  }

  /** Get all currently active bugs. */
  getActiveBugs(): BugEvent[] {
    return this.registry.getActive();
  }

  /** Get the monster associated with a bug. */
  getMonster(bugId: string): Monster | undefined {
    return this.monsterMap.get(bugId);
  }
}

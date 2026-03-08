/**
 * GameEngine — Core game state machine.
 *
 * Manages game phases, player state, and combat resolution.
 * Listens to MonsterSpawned events and transitions through
 * encounter → battle → victory/defeat phases.
 *
 * Damage formula (from existing BugMon):
 *   damage = (power + attack - floor(defense / 2) + random(1-3)) * typeMultiplier
 */

import type { EventBus } from '../core/event-bus.js';
import type {
  BugEvent,
  DamageResult,
  EventMap,
  GamePhase,
  Monster,
  MonsterType,
  Move,
  Player,
} from '../core/types.js';
import { createPlayer, applyXp } from './entities/player.js';

/** Type effectiveness chart: attacker → defender → multiplier */
const TYPE_CHART: Partial<Record<MonsterType, Partial<Record<MonsterType, number>>>> = {
  frontend: { backend: 1.5, devops: 0.5 },
  backend: { devops: 1.5, frontend: 0.5 },
  devops: { frontend: 1.5, backend: 0.5 },
  testing: { backend: 1.5, security: 0.5 },
  security: { ai: 1.5, testing: 0.5 },
  ai: { architecture: 1.5, security: 0.5 },
  architecture: { testing: 1.5, ai: 0.5 },
};

/** Default move set available to the player */
const PLAYER_MOVES: Move[] = [
  { id: 'debug', name: 'Debug', power: 10, type: 'backend' },
  { id: 'refactor', name: 'Refactor', power: 8, type: 'architecture' },
  { id: 'hotfix', name: 'Hotfix', power: 12, type: 'devops' },
  { id: 'unittest', name: 'Unit Test', power: 9, type: 'testing' },
];

export type RngFn = () => number;

export class GameEngine {
  phase: GamePhase = 'idle';
  player: Player;
  currentMonster: Monster | null = null;
  currentBug: BugEvent | null = null;

  private readonly eventBus: EventBus<EventMap>;
  private readonly rng: RngFn;
  private unsubscribers: Array<() => void> = [];

  constructor(eventBus: EventBus<EventMap>, rng: RngFn = Math.random) {
    this.eventBus = eventBus;
    this.rng = rng;
    this.player = createPlayer();
  }

  /** Start listening for game events. */
  start(): void {
    this.unsubscribers.push(
      this.eventBus.on('MonsterSpawned', ({ monster, bug }) => {
        this.spawnMonster(monster, bug);
      })
    );
  }

  /** Stop listening. */
  stop(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }

  /** Transition to encounter phase with a monster. */
  spawnMonster(monster: Monster, bug: BugEvent): void {
    this.currentMonster = { ...monster };
    this.currentBug = bug;
    this.phase = 'encounter';
  }

  /** Begin battle phase. */
  startBattle(): void {
    if (this.phase !== 'encounter' || !this.currentMonster) return;
    this.phase = 'battle';
  }

  /** Player attacks the current monster with a move. */
  attack(moveId: string): DamageResult | null {
    if (this.phase !== 'battle' || !this.currentMonster) return null;

    const move = PLAYER_MOVES.find((m) => m.id === moveId) ?? PLAYER_MOVES[0];
    const result = this.calcDamage(this.player, move, this.currentMonster);

    this.currentMonster.hp = Math.max(0, this.currentMonster.hp - result.damage);

    if (this.currentMonster.hp <= 0) {
      this.defeatMonster();
    } else {
      this.monsterAttack();
    }

    return result;
  }

  /** Get available player moves. */
  getMoves(): readonly Move[] {
    return PLAYER_MOVES;
  }

  private defeatMonster(): void {
    if (!this.currentMonster) return;
    const xp = this.currentMonster.maxHp + this.currentMonster.attack;
    this.eventBus.emit('MonsterDefeated', { monsterId: this.currentMonster.id, xp });
    this.player = applyXp(this.player, xp);
    this.phase = 'victory';
    this.currentMonster = null;
    this.currentBug = null;
  }

  private monsterAttack(): void {
    if (!this.currentMonster) return;

    const monsterMove: Move = {
      id: 'monster-attack',
      name: 'Attack',
      power: 8,
      type: this.currentMonster.type,
    };

    const result = this.calcDamage(
      { attack: this.currentMonster.attack },
      monsterMove,
      { defense: this.player.defense, type: 'backend' as MonsterType }
    );

    this.player.hp = Math.max(0, this.player.hp - result.damage);
    this.eventBus.emit('PlayerDamage', { amount: result.damage, source: this.currentMonster.name });

    if (this.player.hp <= 0) {
      this.phase = 'defeat';
    }
  }

  /** BugMon damage formula: (power + attack - floor(defense/2) + rand(1-3)) * typeMultiplier */
  private calcDamage(
    attacker: Pick<Player, 'attack'>,
    move: Move,
    defender: Pick<Monster, 'defense' | 'type'>
  ): DamageResult {
    const effectiveness = TYPE_CHART[move.type]?.[defender.type] ?? 1.0;
    const randomBonus = Math.floor(this.rng() * 3) + 1;
    const baseDamage = move.power + attacker.attack - Math.floor(defender.defense / 2) + randomBonus;
    const damage = Math.max(1, Math.floor(baseDamage * effectiveness));

    return {
      damage,
      effectiveness,
      isCritical: randomBonus === 3,
    };
  }

  /** Update loop tick (for idle/auto-resolve behavior). */
  tick(_dt: number): void {
    // Auto-resolve low severity encounters in idle mode
    if (this.phase === 'encounter' && this.currentMonster) {
      if (this.currentMonster.maxHp <= 20) {
        // Severity 1: auto-resolve
        this.defeatMonster();
      }
    }
  }

  /** Reset to idle after victory/defeat. */
  reset(): void {
    this.phase = 'idle';
    this.currentMonster = null;
    this.currentBug = null;
  }
}

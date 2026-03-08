// Pure battle engine — no DOM, no audio, no Node.js-specific APIs
// Deterministic when RNG is injected. All functions are pure (no mutation).
// This is the single source of truth for all battle logic across CLI, browser, and simulation.
//
// TODO(roadmap/ts-migration): Migrate to TypeScript (src/domain/)

import {
  MOVE_USED, DAMAGE_DEALT, HEALING_APPLIED,
  PASSIVE_ACTIVATED, BUGMON_FAINTED
} from './events.js';

// --- Passive ability thresholds ---
const PASSIVE_THRESHOLDS = { RandomFailure: 0.5, NonDeterministic: 0.25 };

function checkPassive(bugmon, passiveName, roll) {
  const passive = bugmon.passive;
  if (!passive || passive.name !== passiveName) return false;
  return roll < (PASSIVE_THRESHOLDS[passiveName] ?? 0);
}

// --- Damage calculation ---

export function isHealMove(move) {
  return move.category === 'heal';
}

export function calcHealing(move, bugmon) {
  const restored = Math.min(move.power, bugmon.hp - (bugmon.currentHP ?? bugmon.hp));
  return { healing: Math.max(0, restored) };
}

/**
 * Calculate damage for an attack move.
 * @param {object} attacker
 * @param {object} move
 * @param {object} defender
 * @param {object|null} typeChart - effectiveness lookup { moveType: { defenderType: multiplier } }
 * @param {{ random?: () => number }} rng - RNG source (defaults to Math.random)
 * @returns {{ damage: number, effectiveness: number, critical: boolean }}
 */
export function calcDamage(attacker, move, defender, typeChart, rng = {}) {
  const rand = rng.random ? rng.random : Math.random;
  const randomBonus = Math.floor(rand() * 3) + 1;
  let dmg = move.power + attacker.attack - Math.floor(defender.defense / 2) + randomBonus;

  let effectiveness = 1.0;
  if (typeChart && move.type && defender.type) {
    effectiveness = typeChart[move.type]?.[defender.type] ?? 1.0;
  }
  dmg = Math.floor(dmg * effectiveness);

  const critical = rand() < 1 / 16;
  if (critical) {
    dmg = Math.floor(dmg * 1.5);
  }

  return { damage: Math.max(1, dmg), effectiveness, critical };
}

// --- State creation ---

export function createBattleState(playerMon, enemyMon) {
  return {
    playerMon: { ...playerMon, currentHP: playerMon.currentHP ?? playerMon.hp },
    enemy: { ...enemyMon, currentHP: enemyMon.currentHP ?? enemyMon.hp },
    turn: 0,
    log: [],
    outcome: null, // null = ongoing, 'win', 'lose', 'run', 'cache'
  };
}

// --- Turn order ---

export function getTurnOrder(playerMon, enemyMon) {
  return playerMon.speed >= enemyMon.speed ? 'player' : 'enemy';
}

// --- Move resolution (pure, no mutation) ---

export function resolveMove(attacker, move, defender, typeChart, rng = {}) {
  if (isHealMove(move)) {
    return { ...calcHealing(move, attacker), damage: 0, effectiveness: 1.0, critical: false };
  }
  return calcDamage(attacker, move, defender, typeChart, rng);
}

// --- HP mutation (returns new object) ---

export function applyDamage(bugmon, damage) {
  return { ...bugmon, currentHP: Math.max(0, bugmon.currentHP - damage) };
}

export function applyHealing(bugmon, amount) {
  return { ...bugmon, currentHP: Math.min(bugmon.hp, bugmon.currentHP + amount) };
}

export function isFainted(bugmon) {
  return bugmon.currentHP <= 0;
}

// --- Cache mechanics ---

export function cacheChance(enemyMon) {
  const hpRatio = enemyMon.currentHP / enemyMon.hp;
  return (1 - hpRatio) * 0.5 + 0.1;
}

export function attemptCache(enemyMon, roll) {
  return roll < cacheChance(enemyMon);
}

// --- Move selection ---

export function pickEnemyMove(enemy, movesData, roll) {
  const moveId = enemy.moves[Math.floor(roll * enemy.moves.length)];
  return movesData.find(m => m.id === moveId);
}

/**
 * Execute a full turn: player move vs enemy move.
 * Returns { state, events } — fully deterministic with injected rolls.
 *
 * @param {object} state - Current battle state from createBattleState
 * @param {object} playerMove - Move data object
 * @param {object} enemyMove - Move data object
 * @param {object|null} typeChart - Type effectiveness chart
 * @param {{ passive?: () => number, random?: () => number }} rolls - RNG injection
 * @returns {{ state: object, events: object[] }}
 */
export function executeTurn(state, playerMove, enemyMove, typeChart, rolls = {}) {
  const events = [];
  let { playerMon, enemy } = state;
  const turn = state.turn + 1;

  const first = getTurnOrder(playerMon, enemy);
  const attackers = first === 'player'
    ? [{ side: 'player', attacker: playerMon, move: playerMove, defender: enemy },
       { side: 'enemy', attacker: enemy, move: enemyMove, defender: playerMon }]
    : [{ side: 'enemy', attacker: enemy, move: enemyMove, defender: playerMon },
       { side: 'player', attacker: playerMon, move: playerMove, defender: enemy }];

  function applyMove(side, move) {
    const attacker = side === 'player' ? playerMon : enemy;
    const defender = side === 'player' ? enemy : playerMon;
    const result = resolveMove(attacker, move, defender, typeChart, rolls);

    if (result.healing !== undefined && result.healing >= 0) {
      events.push({
        type: MOVE_USED, side, attacker: attacker.name, move: move.name,
        damage: 0, healing: result.healing, effectiveness: 1.0,
      });
      if (side === 'player') playerMon = applyHealing(playerMon, result.healing);
      else enemy = applyHealing(enemy, result.healing);
      return false;
    }

    let { damage, effectiveness, critical } = result;

    // RandomFailure: defender may negate damage
    const passiveRoll = rolls.passive?.() ?? Math.random();
    if (checkPassive(defender, 'RandomFailure', passiveRoll)) {
      damage = 0;
      events.push({
        type: PASSIVE_ACTIVATED,
        side: side === 'player' ? 'enemy' : 'player',
        passive: 'RandomFailure',
        message: `${defender.name}'s RandomFailure negated the damage!`,
      });
    }

    events.push({
      type: MOVE_USED, side, attacker: attacker.name, move: move.name,
      damage, effectiveness, critical,
    });

    if (side === 'player') enemy = applyDamage(enemy, damage);
    else playerMon = applyDamage(playerMon, damage);

    const target = side === 'player' ? enemy : playerMon;
    if (isFainted(target)) {
      const faintSide = side === 'player' ? 'enemy' : 'player';
      events.push({ type: BUGMON_FAINTED, side: faintSide, name: target.name });
      return true;
    }
    return false;
  }

  for (const action of attackers) {
    const currentAttacker = action.side === 'player' ? playerMon : enemy;
    if (isFainted(currentAttacker)) continue;

    const fainted = applyMove(action.side, action.move);
    if (fainted) break;

    // NonDeterministic: attacker may act twice
    const updatedAttacker = action.side === 'player' ? playerMon : enemy;
    const updatedDefender = action.side === 'player' ? enemy : playerMon;
    if (!isFainted(updatedDefender)) {
      const doubleRoll = rolls.passive?.() ?? Math.random();
      if (checkPassive(updatedAttacker, 'NonDeterministic', doubleRoll)) {
        events.push({
          type: PASSIVE_ACTIVATED,
          side: action.side,
          passive: 'NonDeterministic',
          message: `${updatedAttacker.name}'s NonDeterministic triggered a bonus action!`,
        });
        const bonusFainted = applyMove(action.side, action.move);
        if (bonusFainted) break;
      }
    }
  }

  let outcome = null;
  if (isFainted(enemy)) outcome = 'win';
  else if (isFainted(playerMon)) outcome = 'lose';

  return {
    state: {
      playerMon,
      enemy,
      turn,
      log: [...state.log, ...events],
      outcome,
    },
    events,
  };
}

/**
 * Simulate a full battle between two BugMon.
 * Used by CLI simulator and round-robin analysis.
 *
 * @param {object} monA - Player BugMon data
 * @param {object} monB - Enemy BugMon data
 * @param {object[]} movesData - All move definitions
 * @param {object} typeChart - Type chart (may have .effectiveness property)
 * @param {number} maxTurns - Max turns before draw
 * @param {{ strategyA?: Function, strategyB?: Function, rng?: object }} options
 * @returns {object} Final battle state (or simulation result object)
 */
export function simulateBattle(monA, monB, movesData, typeChart, maxTurns = 100, options = {}) {
  let state = createBattleState(monA, monB);
  const typeEffectiveness = typeChart ? (typeChart.effectiveness || typeChart) : null;
  const { strategyA, strategyB, rng } = options;

  // If strategies are provided, run with strategy-based move selection (simulation mode)
  if (strategyA && strategyB) {
    const a = { ...monA, currentHP: monA.hp };
    const b = { ...monB, currentHP: monB.hp };
    const log = [];
    let turns = 0;

    function doAttack(attacker, move, defender) {
      if (isHealMove(move)) {
        const healed = Math.min(move.power, attacker.hp - attacker.currentHP);
        attacker.currentHP = Math.min(attacker.hp, attacker.currentHP + move.power);
        log.push({
          turn: turns, attacker: attacker.name, move: move.name,
          damage: 0, healing: healed, effectiveness: 1.0,
          targetHP: attacker.currentHP
        });
        return false;
      }

      const result = calcDamage(attacker, move, defender, typeEffectiveness, rng);
      let damage = result.damage;

      if (defender.passive?.name === 'RandomFailure' && (rng ? rng.random() : Math.random()) < 0.5) {
        damage = 0;
        log.push({
          turn: turns, attacker: attacker.name, move: move.name,
          damage: 0, effectiveness: result.effectiveness,
          targetHP: defender.currentHP, passive: 'RandomFailure'
        });
        return false;
      }

      defender.currentHP -= damage;
      log.push({
        turn: turns, attacker: attacker.name, move: move.name,
        damage, effectiveness: result.effectiveness,
        targetHP: Math.max(0, defender.currentHP)
      });
      return defender.currentHP <= 0;
    }

    while (a.currentHP > 0 && b.currentHP > 0 && turns < maxTurns) {
      turns++;
      const aFirst = a.speed >= b.speed;
      const first = aFirst ? a : b;
      const second = aFirst ? b : a;
      const firstStrat = aFirst ? strategyA : strategyB;
      const secondStrat = aFirst ? strategyB : strategyA;

      const firstMove = firstStrat(first, second, movesData, typeEffectiveness, rng);
      if (doAttack(first, firstMove, second)) break;

      if (first.passive?.name === 'NonDeterministic' && (rng ? rng.random() : Math.random()) < 0.25 && second.currentHP > 0) {
        const bonusMove = firstStrat(first, second, movesData, typeEffectiveness, rng);
        if (doAttack(first, bonusMove, second)) break;
      }

      if (second.currentHP <= 0) break;

      const secondMove = secondStrat(second, first, movesData, typeEffectiveness, rng);
      doAttack(second, secondMove, first);

      if (second.passive?.name === 'NonDeterministic' && (rng ? rng.random() : Math.random()) < 0.25 && first.currentHP > 0) {
        const bonusMove = secondStrat(second, first, movesData, typeEffectiveness, rng);
        doAttack(second, bonusMove, first);
      }
    }

    const winner = a.currentHP > 0 ? 'A' : b.currentHP > 0 ? 'B' : 'draw';
    return {
      winner,
      turns,
      monA: monA.name,
      monB: monB.name,
      remainingHP: { a: Math.max(0, a.currentHP), b: Math.max(0, b.currentHP) },
      totalDamage: { a: monB.hp - Math.max(0, b.currentHP), b: monA.hp - Math.max(0, a.currentHP) },
      log,
      seed: rng?.seed
    };
  }

  // Simple mode: random move selection (used by battle-core's original simulateBattle)
  while (!state.outcome && state.turn < maxTurns) {
    const rand = rng ? () => rng.random() : Math.random;
    const playerMoveId = monA.moves[Math.floor(rand() * monA.moves.length)];
    const enemyMoveId = monB.moves[Math.floor(rand() * monB.moves.length)];
    const playerMove = movesData.find(m => m.id === playerMoveId);
    const enemyMove = movesData.find(m => m.id === enemyMoveId);

    const result = executeTurn(state, playerMove, enemyMove, typeEffectiveness);
    state = result.state;
  }

  return state;
}

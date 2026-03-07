// Pure battle engine - no UI, no audio, no DOM

import { calcDamage, isHealMove, calcHealing } from './damage.js';

// Passive ability activation thresholds
const PASSIVE_THRESHOLDS = { RandomFailure: 0.5, NonDeterministic: 0.25 };

function checkPassive(bugmon, passiveName, roll) {
  const passive = bugmon.passive;
  if (!passive || passive.name !== passiveName) return false;
  return roll < (PASSIVE_THRESHOLDS[passiveName] ?? 0);
}

// Create a fresh battle state from two BugMon data objects
export function createBattleState(playerMon, enemyMon) {
  return {
    playerMon: { ...playerMon, currentHP: playerMon.currentHP ?? playerMon.hp },
    enemy: { ...enemyMon, currentHP: enemyMon.currentHP ?? enemyMon.hp },
    turn: 0,
    log: [],
    outcome: null, // null = ongoing, 'win', 'lose', 'run', 'cache'
  };
}

// Determine who goes first based on speed (ties favor player)
export function getTurnOrder(playerMon, enemyMon) {
  return playerMon.speed >= enemyMon.speed ? 'player' : 'enemy';
}

// Resolve a single move: attacker uses move against defender
// Returns { damage, effectiveness } — does NOT mutate state
export function resolveMove(attacker, move, defender, typeChart) {
  if (isHealMove(move)) {
    return { ...calcHealing(move, attacker), damage: 0, effectiveness: 1.0, critical: false };
  }
  return calcDamage(attacker, move, defender, typeChart);
}

// Apply damage to a BugMon, returning updated copy
export function applyDamage(bugmon, damage) {
  return {
    ...bugmon,
    currentHP: Math.max(0, bugmon.currentHP - damage),
  };
}

// Apply healing to a BugMon, returning updated copy (capped at max HP)
export function applyHealing(bugmon, amount) {
  return {
    ...bugmon,
    currentHP: Math.min(bugmon.hp, bugmon.currentHP + amount),
  };
}

// Check if a BugMon has fainted
export function isFainted(bugmon) {
  return bugmon.currentHP <= 0;
}

// Calculate cache probability
export function cacheChance(enemyMon) {
  const hpRatio = enemyMon.currentHP / enemyMon.hp;
  return (1 - hpRatio) * 0.5 + 0.1;
}

// Attempt cache with given random value (0-1)
// Separating randomness makes this testable/deterministic
export function attemptCache(enemyMon, roll) {
  const chance = cacheChance(enemyMon);
  return roll < chance;
}

// Pick a random enemy move (given random value 0-1)
export function pickEnemyMove(enemy, movesData, roll) {
  const moveId = enemy.moves[Math.floor(roll * enemy.moves.length)];
  return movesData.find(m => m.id === moveId);
}

// Execute a full turn: player picks a move, enemy picks randomly
// Returns a TurnResult with all events that occurred
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

  // Apply a single move (attacker uses move on defender), returning whether defender fainted
  function applyMove(side, move) {
    const attacker = side === 'player' ? playerMon : enemy;
    const defender = side === 'player' ? enemy : playerMon;
    const result = resolveMove(attacker, move, defender, typeChart);

    if (result.healing !== undefined && result.healing >= 0) {
      events.push({
        type: 'MOVE_USED', side, attacker: attacker.name, move: move.name,
        damage: 0, healing: result.healing, effectiveness: 1.0,
      });
      if (side === 'player') playerMon = applyHealing(playerMon, result.healing);
      else enemy = applyHealing(enemy, result.healing);
      return false;
    }

    let { damage, effectiveness } = result;

    // RandomFailure: defender may negate damage
    const passiveRoll = rolls.passive?.() ?? Math.random();
    if (checkPassive(defender, 'RandomFailure', passiveRoll)) {
      damage = 0;
      events.push({
        type: 'PASSIVE_ACTIVATED',
        side: side === 'player' ? 'enemy' : 'player',
        passive: 'RandomFailure',
        message: `${defender.name}'s RandomFailure negated the damage!`,
      });
    }

    events.push({
      type: 'MOVE_USED', side, attacker: attacker.name, move: move.name,
      damage, effectiveness,
    });

    if (side === 'player') enemy = applyDamage(enemy, damage);
    else playerMon = applyDamage(playerMon, damage);

    const target = side === 'player' ? enemy : playerMon;
    if (isFainted(target)) {
      const faintSide = side === 'player' ? 'enemy' : 'player';
      events.push({ type: 'BUGMON_FAINTED', side: faintSide, name: target.name });
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
          type: 'PASSIVE_ACTIVATED',
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

// Simulate a full battle between two BugMon (for CLI simulator)
export function simulateBattle(monA, monB, movesData, typeChart, maxTurns = 100) {
  let state = createBattleState(monA, monB);
  const typeEffectiveness = typeChart ? typeChart.effectiveness : null;

  while (!state.outcome && state.turn < maxTurns) {
    // Pick moves randomly
    const playerMoveId = monA.moves[Math.floor(Math.random() * monA.moves.length)];
    const enemyMoveId = monB.moves[Math.floor(Math.random() * monB.moves.length)];
    const playerMove = movesData.find(m => m.id === playerMoveId);
    const enemyMove = movesData.find(m => m.id === enemyMoveId);

    const result = executeTurn(state, playerMove, enemyMove, typeEffectiveness);
    state = result.state;
  }

  return state;
}

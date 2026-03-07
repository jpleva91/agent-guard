// Headless battle engine for simulation
// No DOM, no audio, no rendering — pure game logic with seeded RNG

export function calcDamageHeadless(attacker, move, defender, typeChart, rng) {
  const random = rng.int(1, 3);
  let dmg = move.power + attacker.attack - Math.floor(defender.defense / 2) + random;

  let effectiveness = 1.0;
  if (typeChart && move.type && defender.type) {
    effectiveness = typeChart[move.type]?.[defender.type] ?? 1.0;
  }
  dmg = Math.floor(dmg * effectiveness);

  return { damage: Math.max(1, dmg), effectiveness };
}

export function runBattle(monA, monB, movesData, typeChart, strategyA, strategyB, rng) {
  const a = { ...monA, currentHP: monA.hp };
  const b = { ...monB, currentHP: monB.hp };

  const log = [];
  let turns = 0;
  const MAX_TURNS = 100;

  // Execute a single attack: attacker uses move on defender
  function doAttack(attacker, move, defender) {
    if (move.category === 'heal') {
      const healed = Math.min(move.power, attacker.hp - attacker.currentHP);
      attacker.currentHP = Math.min(attacker.hp, attacker.currentHP + move.power);
      log.push({
        turn: turns, attacker: attacker.name, move: move.name,
        damage: 0, healing: healed, effectiveness: 1.0,
        targetHP: attacker.currentHP
      });
      return false;
    }

    const result = calcDamageHeadless(attacker, move, defender, typeChart, rng);
    let damage = result.damage;

    // RandomFailure: defender may negate damage
    if (defender.passive?.name === 'RandomFailure' && rng.random() < 0.5) {
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

  while (a.currentHP > 0 && b.currentHP > 0 && turns < MAX_TURNS) {
    turns++;

    // Determine turn order by speed (ties: A goes first)
    const aFirst = a.speed >= b.speed;
    const first = aFirst ? a : b;
    const second = aFirst ? b : a;
    const firstStrategy = aFirst ? strategyA : strategyB;
    const secondStrategy = aFirst ? strategyB : strategyA;

    // First attacker's turn
    const firstMove = firstStrategy(first, second, movesData, typeChart, rng);
    if (doAttack(first, firstMove, second)) break;

    // NonDeterministic: first attacker may act again
    if (first.passive?.name === 'NonDeterministic' && rng.random() < 0.25 && second.currentHP > 0) {
      const bonusMove = firstStrategy(first, second, movesData, typeChart, rng);
      if (doAttack(first, bonusMove, second)) break;
    }

    if (second.currentHP <= 0) break;

    // Second attacker's turn
    const secondMove = secondStrategy(second, first, movesData, typeChart, rng);
    doAttack(second, secondMove, first);

    // NonDeterministic: second attacker may act again
    if (second.passive?.name === 'NonDeterministic' && rng.random() < 0.25 && first.currentHP > 0) {
      const bonusMove = secondStrategy(second, first, movesData, typeChart, rng);
      doAttack(second, bonusMove, first);
    }
  }

  const winner = a.currentHP > 0 ? 'A' : b.currentHP > 0 ? 'B' : 'draw';

  return {
    winner,
    turns,
    monA: monA.name,
    monB: monB.name,
    remainingHP: {
      a: Math.max(0, a.currentHP),
      b: Math.max(0, b.currentHP)
    },
    totalDamage: {
      a: monB.hp - Math.max(0, b.currentHP),
      b: monA.hp - Math.max(0, a.currentHP)
    },
    log,
    seed: rng.seed
  };
}

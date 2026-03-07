// AI move selection strategies for battle simulation
// Each strategy is a function: (attacker, defender, movesData, typeChart, rng) => move

function getMoves(mon, movesData) {
  return mon.moves
    .map(id => movesData.find(m => m.id === id))
    .filter(Boolean);
}

function getEffectiveness(moveType, defenderType, typeChart) {
  if (!typeChart || !moveType || !defenderType) return 1.0;
  return typeChart[moveType]?.[defenderType] ?? 1.0;
}

function estimateDamage(attacker, move, defender, typeChart) {
  if (move.category === 'heal') return 0;
  const base = move.power + attacker.attack - Math.floor(defender.defense / 2) + 2; // avg random
  const eff = getEffectiveness(move.type, defender.type, typeChart);
  return Math.max(1, Math.floor(base * eff));
}

// Strategy: pick a random move
export function randomStrategy(attacker, defender, movesData, typeChart, rng) {
  const moves = getMoves(attacker, movesData);
  return rng.pick(moves);
}

// Strategy: always pick the move that deals the most estimated damage
export function highestDamageStrategy(attacker, defender, movesData, typeChart, rng) {
  const moves = getMoves(attacker, movesData);
  let best = moves[0];
  let bestDmg = -1;

  for (const move of moves) {
    const dmg = estimateDamage(attacker, move, defender, typeChart);
    if (dmg > bestDmg) {
      bestDmg = dmg;
      best = move;
    }
  }
  return best;
}

// Strategy: pick the move with the best type effectiveness, breaking ties by power
export function typeAwareStrategy(attacker, defender, movesData, typeChart, rng) {
  const moves = getMoves(attacker, movesData);
  let best = moves[0];
  let bestEff = -1;
  let bestPower = -1;

  for (const move of moves) {
    const eff = getEffectiveness(move.type, defender.type, typeChart);
    if (eff > bestEff || (eff === bestEff && move.power > bestPower)) {
      bestEff = eff;
      bestPower = move.power;
      best = move;
    }
  }
  return best;
}

// Strategy: 70% chance pick highest damage, 30% chance pick random (simulates imperfect play)
export function mixedStrategy(attacker, defender, movesData, typeChart, rng) {
  if (rng.random() < 0.7) {
    return highestDamageStrategy(attacker, defender, movesData, typeChart, rng);
  }
  return randomStrategy(attacker, defender, movesData, typeChart, rng);
}

// Strategy: considers remaining HP — heals when low, otherwise picks highest damage
export function hpAwareStrategy(attacker, defender, movesData, typeChart, rng) {
  const moves = getMoves(attacker, movesData);
  const hpRatio = (attacker.currentHP ?? attacker.hp) / attacker.hp;

  // If HP below 30%, try to heal
  if (hpRatio < 0.3) {
    const healMove = moves.find(m => m.category === 'heal');
    if (healMove) return healMove;
  }

  return highestDamageStrategy(attacker, defender, movesData, typeChart, rng);
}

// Strategy: prioritizes survival — heals when HP < 50%, otherwise picks type-aware damage
export function defensiveStrategy(attacker, defender, movesData, typeChart, rng) {
  const moves = getMoves(attacker, movesData);
  const hpRatio = (attacker.currentHP ?? attacker.hp) / attacker.hp;

  // Heal when below 50% HP
  if (hpRatio < 0.5) {
    const healMove = moves.find(m => m.category === 'heal');
    if (healMove) return healMove;
  }

  // Prefer same-type moves (STAB-like bonus) when effectiveness is equal
  let best = moves[0];
  let bestScore = -1;

  for (const move of moves) {
    if (move.category === 'heal') continue;
    const eff = getEffectiveness(move.type, defender.type, typeChart);
    const sameType = move.type === attacker.type ? 0.1 : 0;
    const score = eff + sameType;
    if (score > bestScore || (score === bestScore && move.power > best.power)) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

// Strategy: phase-based — typeAware early, highestDamage mid, hpAware when desperate
export function adaptiveStrategy(attacker, defender, movesData, typeChart, rng) {
  const ownHpRatio = (attacker.currentHP ?? attacker.hp) / attacker.hp;
  const oppHpRatio = (defender.currentHP ?? defender.hp) / defender.hp;

  // Desperate: heal if possible
  if (ownHpRatio < 0.3) {
    return hpAwareStrategy(attacker, defender, movesData, typeChart, rng);
  }

  // Opponent is weakened: go for maximum damage to finish them
  if (oppHpRatio < 0.5) {
    return highestDamageStrategy(attacker, defender, movesData, typeChart, rng);
  }

  // Early game: exploit type advantages
  return typeAwareStrategy(attacker, defender, movesData, typeChart, rng);
}

export const STRATEGIES = {
  random: { fn: randomStrategy, name: 'Random' },
  highestDamage: { fn: highestDamageStrategy, name: 'Highest Damage' },
  typeAware: { fn: typeAwareStrategy, name: 'Type Aware' },
  mixed: { fn: mixedStrategy, name: 'Mixed (70/30)' },
  hpAware: { fn: hpAwareStrategy, name: 'HP Aware' },
  defensive: { fn: defensiveStrategy, name: 'Defensive' },
  adaptive: { fn: adaptiveStrategy, name: 'Adaptive' }
};

// Battle simulator — runs N battles and collects aggregate statistics

import { createRNG } from './rng.js';
import { runBattle } from './headlessBattle.js';

export function simulate(monsters, movesData, typeChart, strategy, numBattles, baseSeed, strategyName) {
  const stats = {};

  // Init stats for each monster
  for (const mon of monsters) {
    stats[mon.name] = {
      name: mon.name,
      type: mon.type,
      hp: mon.hp,
      attack: mon.attack,
      defense: mon.defense,
      speed: mon.speed,
      wins: 0,
      losses: 0,
      draws: 0,
      totalBattles: 0,
      totalDamageDealt: 0,
      totalDamageTaken: 0,
      totalTurns: 0,
      matchups: {} // per-opponent breakdown
    };
  }

  let battleIndex = 0;

  // Round-robin: every monster fights every other monster
  for (let i = 0; i < monsters.length; i++) {
    for (let j = i + 1; j < monsters.length; j++) {
      const monA = monsters[i];
      const monB = monsters[j];

      // Run multiple battles per matchup for statistical significance
      const battlesPerMatchup = Math.max(1, Math.floor(numBattles / (monsters.length * (monsters.length - 1) / 2)));

      for (let k = 0; k < battlesPerMatchup; k++) {
        const seed = baseSeed + battleIndex;
        const rng = createRNG(seed);
        battleIndex++;

        const result = runBattle(monA, monB, movesData, typeChart, strategy, strategy, rng);

        const sA = stats[monA.name];
        const sB = stats[monB.name];

        // Init matchup tracking
        if (!sA.matchups[monB.name]) sA.matchups[monB.name] = { wins: 0, losses: 0, draws: 0 };
        if (!sB.matchups[monA.name]) sB.matchups[monA.name] = { wins: 0, losses: 0, draws: 0 };

        if (result.winner === 'A') {
          sA.wins++;
          sB.losses++;
          sA.matchups[monB.name].wins++;
          sB.matchups[monA.name].losses++;
        } else if (result.winner === 'B') {
          sB.wins++;
          sA.losses++;
          sB.matchups[monA.name].wins++;
          sA.matchups[monB.name].losses++;
        } else {
          sA.draws++;
          sB.draws++;
          sA.matchups[monB.name].draws++;
          sB.matchups[monA.name].draws++;
        }

        sA.totalBattles++;
        sB.totalBattles++;
        sA.totalDamageDealt += result.totalDamage.a;
        sB.totalDamageDealt += result.totalDamage.b;
        sA.totalDamageTaken += result.totalDamage.b;
        sB.totalDamageTaken += result.totalDamage.a;
        sA.totalTurns += result.turns;
        sB.totalTurns += result.turns;
      }
    }
  }

  return {
    stats,
    totalBattles: battleIndex,
    strategy: strategyName || 'custom'
  };
}

/**
 * Compare two strategies head-to-head across all matchups.
 * Strategy A controls monster A, strategy B controls monster B.
 */
export function compareStrategies(monsters, movesData, typeChart, strategyA, strategyB, numBattles, baseSeed, nameA, nameB) {
  const winsA = { total: 0, battles: 0 };
  const winsB = { total: 0, battles: 0 };
  let battleIndex = 0;

  const matchups = [];

  for (let i = 0; i < monsters.length; i++) {
    for (let j = i + 1; j < monsters.length; j++) {
      const monA = monsters[i];
      const monB = monsters[j];
      const battlesPerMatchup = Math.max(1, Math.floor(numBattles / (monsters.length * (monsters.length - 1) / 2)));

      let aWins = 0;
      let bWins = 0;

      for (let k = 0; k < battlesPerMatchup; k++) {
        const seed = baseSeed + battleIndex;
        const rng = createRNG(seed);
        battleIndex++;

        const result = runBattle(monA, monB, movesData, typeChart, strategyA, strategyB, rng);
        if (result.winner === 'A') aWins++;
        else if (result.winner === 'B') bWins++;
      }

      winsA.total += aWins;
      winsB.total += bWins;
      winsA.battles += battlesPerMatchup;
      winsB.battles += battlesPerMatchup;

      matchups.push({
        monA: monA.name,
        monB: monB.name,
        aWins,
        bWins,
        draws: battlesPerMatchup - aWins - bWins,
        total: battlesPerMatchup
      });
    }
  }

  return {
    strategyA: nameA,
    strategyB: nameB,
    winsA: winsA.total,
    winsB: winsB.total,
    totalBattles: battleIndex,
    draws: battleIndex - winsA.total - winsB.total,
    matchups
  };
}

/**
 * Run a full strategy comparison matrix — every strategy vs every other.
 */
export function compareAllStrategies(monsters, movesData, typeChart, strategies, numBattles, baseSeed) {
  const names = Object.keys(strategies);
  const results = [];

  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const nameA = names[i];
      const nameB = names[j];
      const result = compareStrategies(
        monsters, movesData, typeChart,
        strategies[nameA].fn, strategies[nameB].fn,
        numBattles, baseSeed + (i * names.length + j) * 100000,
        strategies[nameA].name, strategies[nameB].name
      );
      results.push(result);
    }
  }

  return { results, strategyNames: names.map(n => strategies[n].name) };
}

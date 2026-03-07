// Report generator — formats simulation results into readable output

const OVERPOWERED_THRESHOLD = 60;
const UNDERPOWERED_THRESHOLD = 40;

export function generateReport(simResult) {
  const { stats, totalBattles } = simResult;
  const entries = Object.values(stats).sort((a, b) => {
    const wrA = a.wins / a.totalBattles;
    const wrB = b.wins / b.totalBattles;
    return wrB - wrA;
  });

  const lines = [];

  lines.push('');
  lines.push('==========================================================');
  lines.push('              BugMon Balance Report');
  lines.push('==========================================================');
  lines.push(`  Total battles simulated: ${totalBattles}`);
  lines.push(`  Strategy: ${simResult.strategy}`);
  lines.push('==========================================================');
  lines.push('');

  // Overview table
  lines.push('  OVERALL WIN RATES');
  lines.push('  -----------------');
  lines.push('');
  lines.push('  ' + pad('Name', 20) + pad('Type', 10) + pad('Win%', 8) + pad('W', 6) + pad('L', 6) + pad('Avg Dmg', 10) + pad('Avg Turns', 10) + 'Status');
  lines.push('  ' + '-'.repeat(78));

  for (const s of entries) {
    const winRate = ((s.wins / s.totalBattles) * 100).toFixed(1);
    const avgDmg = (s.totalDamageDealt / s.totalBattles).toFixed(1);
    const avgTurns = (s.totalTurns / s.totalBattles).toFixed(1);
    let status = '';
    if (parseFloat(winRate) >= OVERPOWERED_THRESHOLD) status = '⚠ overpowered';
    else if (parseFloat(winRate) <= UNDERPOWERED_THRESHOLD) status = '▼ underpowered';
    else status = '✓ balanced';

    lines.push('  ' + pad(s.name, 20) + pad(s.type, 10) + pad(winRate + '%', 8) + pad(String(s.wins), 6) + pad(String(s.losses), 6) + pad(avgDmg, 10) + pad(avgTurns, 10) + status);
  }

  lines.push('');

  // Balance health score
  const balanced = entries.filter(s => {
    const wr = (s.wins / s.totalBattles) * 100;
    return wr > UNDERPOWERED_THRESHOLD && wr < OVERPOWERED_THRESHOLD;
  }).length;
  const healthPct = Math.round((balanced / entries.length) * 100);
  lines.push(`  Balance Health: ${healthPct}% (${balanced}/${entries.length} BugMon in balanced range)`);
  lines.push('');

  // Type effectiveness analysis
  lines.push('  TYPE PERFORMANCE');
  lines.push('  ----------------');
  const typeStats = {};
  for (const s of entries) {
    if (!typeStats[s.type]) typeStats[s.type] = { wins: 0, total: 0 };
    typeStats[s.type].wins += s.wins;
    typeStats[s.type].total += s.totalBattles;
  }
  for (const [type, ts] of Object.entries(typeStats)) {
    const wr = ((ts.wins / ts.total) * 100).toFixed(1);
    lines.push(`  ${pad(type, 12)} ${wr}% avg win rate`);
  }
  lines.push('');

  // Worst matchups (most lopsided)
  lines.push('  MOST LOPSIDED MATCHUPS');
  lines.push('  ----------------------');
  const matchups = [];
  for (const s of entries) {
    for (const [opp, m] of Object.entries(s.matchups)) {
      const total = m.wins + m.losses + m.draws;
      if (total > 0 && m.wins > m.losses) {
        const dominance = ((m.wins / total) * 100).toFixed(0);
        matchups.push({ winner: s.name, loser: opp, dominance: parseFloat(dominance), record: `${m.wins}-${m.losses}` });
      }
    }
  }
  matchups.sort((a, b) => b.dominance - a.dominance);
  const top10 = matchups.slice(0, 10);
  for (const m of top10) {
    lines.push(`  ${pad(m.winner, 20)} beats ${pad(m.loser, 20)} ${m.dominance}% (${m.record})`);
  }
  lines.push('');

  // Stat correlations
  lines.push('  STAT ANALYSIS');
  lines.push('  -------------');
  const sorted = [...entries];

  sorted.sort((a, b) => b.attack - a.attack);
  lines.push(`  Highest ATK:   ${sorted[0].name} (${sorted[0].attack}) — ${((sorted[0].wins / sorted[0].totalBattles) * 100).toFixed(1)}% win rate`);

  sorted.sort((a, b) => b.defense - a.defense);
  lines.push(`  Highest DEF:   ${sorted[0].name} (${sorted[0].defense}) — ${((sorted[0].wins / sorted[0].totalBattles) * 100).toFixed(1)}% win rate`);

  sorted.sort((a, b) => b.speed - a.speed);
  lines.push(`  Highest SPD:   ${sorted[0].name} (${sorted[0].speed}) — ${((sorted[0].wins / sorted[0].totalBattles) * 100).toFixed(1)}% win rate`);

  sorted.sort((a, b) => b.hp - a.hp);
  lines.push(`  Highest HP:    ${sorted[0].name} (${sorted[0].hp}) — ${((sorted[0].wins / sorted[0].totalBattles) * 100).toFixed(1)}% win rate`);
  lines.push('');

  lines.push('==========================================================');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate a comparison report for strategy vs strategy results.
 */
export function generateComparisonReport(comparisonResult) {
  const { results, strategyNames } = comparisonResult;
  const lines = [];

  lines.push('');
  lines.push('==========================================================');
  lines.push('          Strategy Comparison Report');
  lines.push('==========================================================');
  lines.push('');

  // Head-to-head results
  lines.push('  HEAD-TO-HEAD RESULTS');
  lines.push('  --------------------');
  lines.push('');
  lines.push('  ' + pad('Strategy A', 18) + pad('Strategy B', 18) + pad('A Wins', 10) + pad('B Wins', 10) + pad('Draws', 8) + 'A Win%');
  lines.push('  ' + '-'.repeat(72));

  for (const r of results) {
    const aRate = ((r.winsA / r.totalBattles) * 100).toFixed(1);
    lines.push('  ' + pad(r.strategyA, 18) + pad(r.strategyB, 18) + pad(String(r.winsA), 10) + pad(String(r.winsB), 10) + pad(String(r.draws), 8) + aRate + '%');
  }
  lines.push('');

  // Overall strategy rankings
  lines.push('  OVERALL RANKINGS');
  lines.push('  ----------------');
  lines.push('');

  const totals = {};
  for (const name of strategyNames) {
    totals[name] = { wins: 0, losses: 0, draws: 0, battles: 0 };
  }

  for (const r of results) {
    totals[r.strategyA].wins += r.winsA;
    totals[r.strategyA].losses += r.winsB;
    totals[r.strategyA].draws += r.draws;
    totals[r.strategyA].battles += r.totalBattles;
    totals[r.strategyB].wins += r.winsB;
    totals[r.strategyB].losses += r.winsA;
    totals[r.strategyB].draws += r.draws;
    totals[r.strategyB].battles += r.totalBattles;
  }

  const ranked = Object.entries(totals)
    .map(([name, t]) => ({ name, ...t, rate: t.battles > 0 ? t.wins / t.battles : 0 }))
    .sort((a, b) => b.rate - a.rate);

  lines.push('  ' + pad('Rank', 6) + pad('Strategy', 18) + pad('Win%', 8) + pad('W', 8) + pad('L', 8) + 'D');
  lines.push('  ' + '-'.repeat(54));

  ranked.forEach((r, i) => {
    const rate = (r.rate * 100).toFixed(1);
    lines.push('  ' + pad(String(i + 1), 6) + pad(r.name, 18) + pad(rate + '%', 8) + pad(String(r.wins), 8) + pad(String(r.losses), 8) + String(r.draws));
  });

  lines.push('');
  lines.push('==========================================================');
  lines.push('');

  return lines.join('\n');
}

function pad(str, len) {
  return String(str).padEnd(len);
}

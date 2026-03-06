// Damage calculation with type effectiveness
export function calcDamage(attacker, move, defender, typeChart) {
  const random = Math.floor(Math.random() * 3) + 1;
  let dmg = move.power + attacker.attack - Math.floor(defender.defense / 2) + random;

  let effectiveness = 1.0;
  if (typeChart && move.type && defender.type) {
    effectiveness = typeChart[move.type]?.[defender.type] ?? 1.0;
  }
  dmg = Math.floor(dmg * effectiveness);

  return { damage: Math.max(1, dmg), effectiveness };
}

// Pure evolution engine — no localStorage, no DOM
// Takes event counts as input; callers provide storage.
//
// TODO(roadmap/phase-5): Add achievement system (first boss, perfect run, 100% Grimoire)
// TODO(roadmap/phase-5): Add difficulty scaling based on developer level
// TODO(roadmap/phase-5): Add idle combat effectiveness scaling with level
// TODO(roadmap/ts-migration): Migrate to TypeScript (src/domain/)

/**
 * Find the evolution trigger for a given monster ID.
 * @param {number} monsterId
 * @param {object} evolutionData - { chains: [...], events: {...} }
 * @returns {{ trigger: object, chain: object } | null}
 */
export function findTrigger(monsterId, evolutionData) {
  if (!evolutionData) return null;
  for (const chain of evolutionData.chains) {
    for (const trigger of chain.triggers) {
      if (trigger.from === monsterId) return { trigger, chain };
    }
  }
  return null;
}

/**
 * Check if a monster is eligible to evolve.
 * @param {object} monster - Monster with id, evolvesTo
 * @param {object} events - Dev activity counts { commits: N, prs_merged: N, ... }
 * @param {object} evolutionData - Evolution chain definitions
 * @param {object[]} monstersData - All monster definitions
 * @returns {{ from: object, to: object, trigger: object, chain: object } | null}
 */
export function checkEvolution(monster, events, evolutionData, monstersData) {
  if (!monster.evolvesTo) return null;
  const match = findTrigger(monster.id, evolutionData);
  if (!match) return null;

  const { event, count } = match.trigger.condition;
  if ((events[event] || 0) >= count) {
    const evolvedForm = monstersData.find(m => m.id === match.trigger.to);
    if (evolvedForm) {
      return { from: monster, to: evolvedForm, trigger: match.trigger, chain: match.chain };
    }
  }
  return null;
}

/**
 * Check all party members for evolution eligibility.
 * @param {object[]} party
 * @param {object} events - Dev activity counts
 * @param {object} evolutionData
 * @param {object[]} monstersData
 * @returns {{ from, to, trigger, chain, partyIndex } | null}
 */
export function checkPartyEvolutions(party, events, evolutionData, monstersData) {
  for (let i = 0; i < party.length; i++) {
    const result = checkEvolution(party[i], events, evolutionData, monstersData);
    if (result) return { ...result, partyIndex: i };
  }
  return null;
}

/**
 * Apply evolution to a party member (returns new monster, does not mutate party).
 * @param {object} oldMon
 * @param {object} evolvedForm
 * @returns {object} New evolved monster with proportional HP
 */
export function applyEvolution(oldMon, evolvedForm) {
  const hpRatio = oldMon.currentHP / oldMon.hp;
  return { ...evolvedForm, currentHP: Math.ceil(evolvedForm.hp * hpRatio) };
}

/**
 * Get evolution progress for HUD display.
 * @param {object} monster
 * @param {object} events - Dev activity counts
 * @param {object} evolutionData
 * @param {object[]} monstersData
 * @returns {{ chainName, eventType, eventLabel, current, required, percentage, evolvesTo } | null}
 */
export function getEvolutionProgress(monster, events, evolutionData, monstersData) {
  if (!monster.evolvesTo) return null;
  const match = findTrigger(monster.id, evolutionData);
  if (!match) return null;

  const { event, count } = match.trigger.condition;
  const current = events[event] || 0;
  const evolvedForm = monstersData ? monstersData.find(m => m.id === match.trigger.to) : null;
  return {
    chainName: match.chain.name,
    eventType: event,
    eventLabel: evolutionData.events?.[event]?.label || event,
    current: Math.min(current, count),
    required: count,
    percentage: Math.min(100, Math.floor((current / count) * 100)),
    evolvesTo: evolvedForm ? evolvedForm.name : '???'
  };
}

// Module contract registry — declares the interface contracts for domain modules.
// Each contract specifies exports, invariants, and dependencies.
// No DOM, no Node.js APIs — pure data definitions.

import type { ModuleContract, ValidationResult } from '../core/types.js';

export const MODULE_CONTRACTS: Record<string, ModuleContract> = {
  'domain/battle': {
    exports: {
      calcDamage: {
        params: ['attacker', 'move', 'defender', 'typeChart', 'rng'],
        returns: 'DamageResult',
      },
      calcHealing: { params: ['move', 'bugmon'], returns: 'object' },
      resolveMove: {
        params: ['attacker', 'move', 'defender', 'typeChart', 'rng'],
        returns: 'MoveResult',
      },
      createBattleState: { params: ['playerMon', 'enemyMon'], returns: 'BattleState' },
      getTurnOrder: { params: ['playerMon', 'enemyMon'], returns: 'string' },
      executeTurn: {
        params: ['state', 'playerMove', 'enemyMove', 'typeChart', 'rolls'],
        returns: 'object',
      },
      simulateBattle: {
        params: ['monA', 'monB', 'movesData', 'typeChart', 'maxTurns', 'options'],
        returns: 'object',
      },
      applyDamage: { params: ['bugmon', 'damage'], returns: 'object' },
      applyHealing: { params: ['bugmon', 'amount'], returns: 'object' },
      isFainted: { params: ['bugmon'], returns: 'boolean' },
      isHealMove: { params: ['move'], returns: 'boolean' },
      cacheChance: { params: ['enemyMon'], returns: 'number' },
      attemptCache: { params: ['enemyMon', 'roll'], returns: 'boolean' },
      pickEnemyMove: { params: ['enemy', 'movesData', 'roll'], returns: 'object' },
    },
    invariants: [
      'HP never goes below 0 (applyDamage clamps to 0)',
      'Damage is deterministic when rng is injected',
      'Type effectiveness multiplier is always 0.5, 1.0, or 1.5',
      'Minimum damage is 1 (calcDamage floors at 1)',
      'No mutation — all functions return new objects',
    ],
    dependencies: ['domain/events'],
  },

  'domain/encounters': {
    exports: {
      shouldEncounter: { params: ['tile', 'rand'], returns: 'boolean' },
      pickWeightedRandom: { params: ['monsters', 'rand'], returns: 'object' },
      scaleEncounter: { params: ['monster', 'context'], returns: 'object' },
      checkEncounter: { params: ['tile', 'monsters', 'rand', 'context'], returns: 'object|null' },
    },
    invariants: [
      'Encounters only trigger on tile type 2 (tall grass)',
      'Encounter rate is 10%',
      'Rarity weights: common=10, uncommon=5, rare=2, legendary=1',
      'Deterministic with injected RNG',
      'Difficulty scales with player level (+10% HP per level) and session encounters (+2% per 5, capped at +20%)',
    ],
    dependencies: [],
  },

  'domain/evolution': {
    exports: {
      findTrigger: { params: ['monsterId', 'evolutionData'], returns: 'object|null' },
      checkEvolution: {
        params: ['monster', 'events', 'evolutionData', 'monstersData'],
        returns: 'object|null',
      },
      checkPartyEvolutions: {
        params: ['party', 'events', 'evolutionData', 'monstersData'],
        returns: 'object|null',
      },
      applyEvolution: { params: ['oldMon', 'evolvedForm'], returns: 'object' },
      getEvolutionProgress: {
        params: ['monster', 'events', 'evolutionData', 'monstersData'],
        returns: 'object|null',
      },
    },
    invariants: [
      'No localStorage or DOM dependency — callers provide event counts',
      'applyEvolution preserves HP ratio proportionally',
      'Evolution only triggers when condition count is met',
    ],
    dependencies: [],
  },

  'domain/events': {
    exports: {
      createEvent: { params: ['kind', 'data'], returns: 'object' },
      validateEvent: { params: ['event'], returns: 'object' },
      resetEventCounter: { params: [], returns: 'void' },
    },
    invariants: [
      'createEvent throws on unknown event kind',
      'createEvent throws when required fields are missing',
      'Each event gets a unique ID via monotonic counter',
      'Fingerprints are deterministic for same kind+data',
    ],
    dependencies: ['domain/hash'],
  },

  'domain/event-bus': {
    exports: {
      EventBus: { params: [], returns: 'class' },
    },
    invariants: [
      'Works in both Node.js and browser (no DOM, no Node.js APIs)',
      'on() returns an unsubscribe function',
      'Listeners fire in registration order',
    ],
    dependencies: [],
  },

  'domain/event-store': {
    exports: {
      createInMemoryStore: { params: [], returns: 'object' },
    },
    invariants: [
      'append() validates events before storing',
      'query() supports filtering by kind, since, until, fingerprint',
      'replay() returns events from a given ID onward',
    ],
    dependencies: ['domain/events'],
  },

  'domain/ingestion/pipeline': {
    exports: {
      ingest: { params: ['rawText'], returns: 'array' },
    },
    invariants: [
      'Returns empty array for input with no errors',
      'Each returned event passes validateEvent()',
      'Deduplicates errors via fingerprinting',
      'Pipeline stages: parse → deduplicate → classify → event creation',
    ],
    dependencies: [
      'domain/ingestion/parser',
      'domain/ingestion/fingerprint',
      'domain/ingestion/classifier',
      'domain/events',
    ],
  },

  'domain/ingestion/fingerprint': {
    exports: {
      fingerprint: { params: ['error'], returns: 'string' },
      deduplicateErrors: { params: ['errors'], returns: 'array' },
    },
    invariants: [
      'Same type+message+file+line always produces same fingerprint',
      'Deduplication keeps the richest version (most stack frames)',
    ],
    dependencies: ['domain/hash'],
  },

  'domain/ingestion/classifier': {
    exports: {
      classify: { params: ['parsedError', 'context'], returns: 'BugEvent' },
    },
    invariants: [
      'Returns a BugEvent with severity, type, message, file, line, frequency',
      'Severity is derived from error type (TYPE_SEVERITY mapping)',
    ],
    dependencies: ['core/bug-event'],
  },
};

/**
 * Validate that a module's actual exports match its declared contract.
 */
export function validateContract(
  moduleName: string,
  moduleExports: Record<string, unknown>,
): ValidationResult {
  const errors: string[] = [];
  const contract = MODULE_CONTRACTS[moduleName];

  if (!contract) {
    return { valid: false, errors: [`Unknown module: ${moduleName}`] };
  }

  for (const exportName of Object.keys(contract.exports)) {
    if (!(exportName in moduleExports)) {
      errors.push(`${moduleName} missing declared export: ${exportName}`);
    } else {
      const exported = moduleExports[exportName];
      const spec = contract.exports[exportName];
      if (spec.returns === 'class') {
        if (typeof exported !== 'function') {
          errors.push(
            `${moduleName}.${exportName} expected class/constructor, got ${typeof exported}`,
          );
        }
      } else if (typeof exported !== 'function') {
        errors.push(`${moduleName}.${exportName} expected function, got ${typeof exported}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// BugDex Spec — canonical schema for BugDex entries
// Defines the format for community-contributed BugMon.

export const VALID_TYPES = [
  'frontend',
  'backend',
  'devops',
  'testing',
  'architecture',
  'security',
  'ai',
] as const;

export type ValidType = (typeof VALID_TYPES)[number];

export const VALID_RARITIES = ['common', 'uncommon', 'rare', 'legendary', 'evolved'] as const;

export type ValidRarity = (typeof VALID_RARITIES)[number];

interface StatRange {
  min: number;
  max: number;
}

const STAT_RANGES: Record<string, StatRange> = {
  hp: { min: 10, max: 100 },
  attack: { min: 1, max: 20 },
  defense: { min: 1, max: 20 },
  speed: { min: 1, max: 15 },
};

export interface BugDexEntry {
  id: string | number;
  name: string;
  errorType: string;
  type: ValidType;
  rarity: ValidRarity;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  moves: string[];
  description: string;
  sprite?: string;
  color?: string;
  habitat?: string;
  weakness?: string;
  fixTip?: string;
  evolution?: string;
  evolvesTo?: number;
  evolvedFrom?: number;
  passive?: string;
  errorPatterns?: string[];
  theme?: string;
}

export function validateBugDexEntry(entry: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const requiredStrings = ['name', 'errorType', 'type', 'rarity', 'description'];
  for (const field of requiredStrings) {
    if (typeof entry[field] !== 'string' || (entry[field] as string).length === 0) {
      errors.push(`Missing or invalid required field: ${field}`);
    }
  }

  if (entry.id === undefined || entry.id === null) {
    errors.push('Missing required field: id');
  }

  if (entry.type && !VALID_TYPES.includes(entry.type as ValidType)) {
    errors.push(`Invalid type: "${entry.type as string}". Must be one of: ${VALID_TYPES.join(', ')}`);
  }

  if (entry.rarity && !VALID_RARITIES.includes(entry.rarity as ValidRarity)) {
    errors.push(`Invalid rarity: "${entry.rarity as string}". Must be one of: ${VALID_RARITIES.join(', ')}`);
  }

  for (const [stat, range] of Object.entries(STAT_RANGES)) {
    if (typeof entry[stat] !== 'number') {
      errors.push(`${stat} must be a number`);
    } else if ((entry[stat] as number) < range.min || (entry[stat] as number) > range.max) {
      errors.push(`${stat} must be between ${range.min} and ${range.max}, got ${entry[stat] as number}`);
    }
  }

  if (!Array.isArray(entry.moves) || entry.moves.length === 0) {
    errors.push('moves must be a non-empty array of move IDs');
  } else if (entry.moves.length > 4) {
    errors.push('moves cannot have more than 4 entries');
  }

  if (entry.sprite !== undefined && entry.sprite !== null) {
    if (typeof entry.sprite !== 'string') {
      errors.push('sprite must be a string (filename without extension)');
    }
  }

  if (entry.color && !/^#[0-9a-fA-F]{6}$/.test(entry.color as string)) {
    errors.push(`Invalid color format: "${entry.color as string}". Must be hex like #ff0000`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * The full BugDex schema definition for documentation/tooling.
 */
export const BUGDEX_SCHEMA = {
  type: 'object',
  required: [
    'id',
    'name',
    'errorType',
    'type',
    'rarity',
    'hp',
    'attack',
    'defense',
    'speed',
    'moves',
    'description',
  ],
  properties: {
    id: { type: ['string', 'number'], description: 'Unique identifier' },
    name: { type: 'string', description: 'Display name' },
    errorType: { type: 'string', description: 'JS/runtime error type it represents' },
    type: { type: 'string', enum: VALID_TYPES, description: 'Game type category' },
    rarity: { type: 'string', enum: VALID_RARITIES, description: 'Rarity tier' },
    hp: { type: 'number', minimum: 10, maximum: 100, description: 'Base hit points' },
    attack: { type: 'number', minimum: 1, maximum: 20, description: 'Attack stat' },
    defense: { type: 'number', minimum: 1, maximum: 20, description: 'Defense stat' },
    speed: { type: 'number', minimum: 1, maximum: 15, description: 'Speed stat' },
    moves: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 4,
      description: 'Move IDs',
    },
    description: { type: 'string', description: 'What this bug is and when it occurs' },
    sprite: { type: 'string', description: 'Sprite filename (32x32 PNG, no extension)' },
    color: {
      type: 'string',
      pattern: '^#[0-9a-fA-F]{6}$',
      description: 'Hex color for fallback rendering',
    },
    habitat: { type: 'string', description: 'Where this bug commonly occurs' },
    weakness: { type: 'string', description: 'What fixes or prevents this bug' },
    fixTip: { type: 'string', description: 'Practical developer fix advice' },
    errorPatterns: {
      type: 'array',
      items: { type: 'string' },
      description: 'Strings to match in error messages',
    },
  },
} as const;

/**
 * BugMon Core Type Definitions
 *
 * All shared types for the BugMon TypeScript system.
 * This is the single source of truth for type contracts across modules.
 */

// ---------------------------------------------------------------------------
// Scalars & Enums
// ---------------------------------------------------------------------------

/** Bug severity: 1 (trivial) to 5 (critical) */
export type Severity = 1 | 2 | 3 | 4 | 5;

/** Channel through which a bug was detected */
export type BugSource = 'console' | 'test' | 'build';

/** Monster element types — mirrors ecosystem/data/types.json */
export type MonsterType =
  | 'frontend'
  | 'backend'
  | 'devops'
  | 'testing'
  | 'architecture'
  | 'security'
  | 'ai';

/** Game phase state machine */
export type GamePhase = 'idle' | 'encounter' | 'battle' | 'victory' | 'defeat';

// ---------------------------------------------------------------------------
// Bug Events
// ---------------------------------------------------------------------------

/** A detected bug — the canonical input to the system */
export interface BugEvent {
  readonly id: string;
  readonly type: string;
  readonly source: BugSource;
  readonly errorMessage: string;
  readonly timestamp: number;
  readonly severity: Severity;
  readonly file?: string;
  readonly line?: number;
  readonly fingerprint?: string;
}

// ---------------------------------------------------------------------------
// Game Entities
// ---------------------------------------------------------------------------

/** A BugMon enemy creature */
export interface Monster {
  readonly id: number;
  readonly name: string;
  readonly type: MonsterType;
  hp: number;
  readonly maxHp: number;
  readonly attack: number;
  readonly defense: number;
  readonly speed: number;
  readonly moves: readonly string[];
}

/** A combat move */
export interface Move {
  readonly id: string;
  readonly name: string;
  readonly power: number;
  readonly type: MonsterType;
}

/** The player character */
export interface Player {
  hp: number;
  readonly maxHp: number;
  readonly attack: number;
  readonly defense: number;
  readonly speed: number;
  level: number;
  xp: number;
}

/** Top-level game state snapshot */
export interface GameState {
  readonly player: Player;
  readonly activeBugs: Map<string, BugEvent>;
  defeatedCount: number;
}

// ---------------------------------------------------------------------------
// Event Map — strongly typed event bus payloads
// ---------------------------------------------------------------------------

/** All events that flow through the EventBus */
export interface EventMap {
  BugDetected: { bug: BugEvent };
  BugResolved: { bugId: string; resolvedAt: number };
  MonsterSpawned: { monster: Monster; bug: BugEvent };
  MonsterDefeated: { monsterId: number; xp: number };
  PlayerDamage: { amount: number; source: string };
  BugAnalyzed: { bugId: string; suggestion: string };
}

// ---------------------------------------------------------------------------
// Damage Calculation
// ---------------------------------------------------------------------------

/** Result of a damage calculation */
export interface DamageResult {
  readonly damage: number;
  readonly effectiveness: number;
  readonly isCritical: boolean;
}

// ---------------------------------------------------------------------------
// AI Integration
// ---------------------------------------------------------------------------

/** Result of an AI bug analysis */
export interface BugAnalysis {
  readonly suggestedFix: string;
  readonly confidence: number;
  readonly category: string;
  readonly relatedPatterns: readonly string[];
}

/** Contract for AI bug analyzers */
export interface BugAnalyzer {
  analyzeBug(bug: BugEvent): Promise<BugAnalysis>;
}

// ---------------------------------------------------------------------------
// Watcher
// ---------------------------------------------------------------------------

/** Common interface for all watchers */
export interface Watcher {
  start(): void;
  stop(): void;
}

/**
 * AgentGuard Core Type Definitions
 *
 * All shared types for the AgentGuard TypeScript system.
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

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Generic validation result */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
}

// ---------------------------------------------------------------------------
// Domain Events
// ---------------------------------------------------------------------------

/** All canonical event kind constants */
export type EventKind =
  // Ingestion pipeline
  | 'ErrorObserved'
  | 'BugClassified'
  // Battle lifecycle
  | 'ENCOUNTER_STARTED'
  | 'MOVE_USED'
  | 'DAMAGE_DEALT'
  | 'HEALING_APPLIED'
  | 'PASSIVE_ACTIVATED'
  | 'BUGMON_FAINTED'
  | 'CACHE_ATTEMPTED'
  | 'CACHE_SUCCESS'
  | 'BATTLE_ENDED'
  // Progression
  | 'ActivityRecorded'
  | 'EvolutionTriggered'
  // Session
  | 'StateChanged'
  | 'RunStarted'
  | 'RunEnded'
  | 'CheckpointReached'
  // Governance
  | 'PolicyDenied'
  | 'UnauthorizedAction'
  | 'InvariantViolation'
  | 'BlastRadiusExceeded'
  | 'MergeGuardFailure'
  | 'EvidencePackGenerated'
  // Reference Monitor
  | 'ActionRequested'
  | 'ActionAllowed'
  | 'ActionDenied'
  | 'ActionEscalated'
  | 'ActionExecuted'
  | 'ActionFailed'
  // Decision Records
  | 'DecisionRecorded'
  // Policy Composition
  | 'PolicyComposed'
  // Policy Traces
  | 'PolicyTraceRecorded'
  // Simulation
  | 'SimulationCompleted'
  // Pipeline
  | 'PipelineStarted'
  | 'StageCompleted'
  | 'StageFailed'
  | 'PipelineCompleted'
  | 'PipelineFailed'
  | 'FileScopeViolation'
  // Developer Signals
  | 'FileSaved'
  | 'TestCompleted'
  | 'BuildCompleted'
  | 'CommitCreated'
  | 'CodeReviewed'
  | 'DeployCompleted'
  | 'LintCompleted'
  // Agent Liveness
  | 'HeartbeatEmitted'
  | 'HeartbeatMissed'
  | 'AgentUnresponsive';

/** Event schema definition — required and optional field names */
export interface EventSchema {
  readonly required: readonly string[];
  readonly optional: readonly string[];
}

/** A canonical domain event */
export interface DomainEvent {
  readonly id: string;
  readonly kind: EventKind;
  readonly timestamp: number;
  readonly fingerprint: string;
  [key: string]: unknown;
}

/** Filter for querying events */
export interface EventFilter {
  readonly kind?: EventKind;
  readonly since?: number;
  readonly until?: number;
  readonly fingerprint?: string;
}

/** Event store interface */
export interface EventStore {
  append(event: DomainEvent): void;
  query(filter?: EventFilter): DomainEvent[];
  replay(fromId?: string): DomainEvent[];
  count(): number;
  clear(): void;
  toNDJSON(): string;
  fromNDJSON(ndjson: string): number;
}

// ---------------------------------------------------------------------------
// Runtime Shape Validation
// ---------------------------------------------------------------------------

/** Expected type strings for runtime shape checking */
export type ShapeFieldType = 'string' | 'number' | 'boolean' | 'array' | 'object';

/** Shape definition with required and optional field type mappings */
export interface ShapeDefinition {
  readonly required: Record<string, ShapeFieldType>;
  readonly optional: Record<string, ShapeFieldType>;
}

// ---------------------------------------------------------------------------
// Battle Types
// ---------------------------------------------------------------------------

/** Monster rarity tier */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'evolved';

/** A BugMon creature in battle (mutable HP tracking) */
export interface Bugmon {
  readonly id: number;
  readonly name: string;
  readonly type: string;
  readonly hp: number;
  currentHP: number;
  readonly attack: number;
  readonly defense: number;
  readonly speed: number;
  readonly moves: readonly string[];
  readonly passive?: { readonly name: string } | null;
  readonly rarity?: Rarity;
  readonly color?: string;
  readonly sprite?: string;
  readonly theme?: string;
  readonly description?: string;
  readonly evolvesTo?: number;
  readonly errorPatterns?: readonly string[];
}

/** A combat move (extended for heal moves) */
export interface BattleMove {
  readonly id: string;
  readonly name: string;
  readonly power: number;
  readonly type: string;
  readonly category?: string;
}

/** Battle damage result */
export interface BattleDamageResult {
  readonly damage: number;
  readonly effectiveness: number;
  readonly critical: boolean;
}

/** Move resolution result (damage or healing) */
export interface MoveResult {
  readonly damage: number;
  readonly effectiveness: number;
  readonly critical: boolean;
  readonly healing?: number;
}

/** Battle state */
export interface BattleState {
  readonly playerMon: Bugmon;
  readonly enemy: Bugmon;
  readonly turn: number;
  readonly log: readonly BattleEvent[];
  readonly outcome: BattleOutcome;
}

/** Battle outcome */
export type BattleOutcome = 'win' | 'lose' | 'run' | 'cache' | null;

/** Battle event entry in the log */
export interface BattleEvent {
  readonly type: string;
  readonly side: string;
  [key: string]: unknown;
}

/** Type effectiveness chart: attackerType -> defenderType -> multiplier */
export type TypeChart = Record<string, Record<string, number>>;

/** Injectable RNG for deterministic battle testing */
export interface BattleRNG {
  random?: () => number;
  passive?: () => number;
  seed?: number;
}

/** Encounter context for difficulty scaling */
export interface EncounterContext {
  readonly playerLevel?: number;
  readonly encounterCount?: number;
}

// ---------------------------------------------------------------------------
// Evolution Types
// ---------------------------------------------------------------------------

/** Evolution trigger condition */
export interface EvolutionCondition {
  readonly event: string;
  readonly count: number;
}

/** Evolution trigger linking two monster stages */
export interface EvolutionTrigger {
  readonly from: number;
  readonly to: number;
  readonly condition: EvolutionCondition;
  readonly description?: string;
}

/** An evolution chain with stages and triggers */
export interface EvolutionChain {
  readonly id: string;
  readonly name: string;
  readonly stages: readonly { readonly monsterId: number; readonly name: string }[];
  readonly triggers: readonly EvolutionTrigger[];
}

/** Evolution data container */
export interface EvolutionData {
  readonly chains: readonly EvolutionChain[];
  readonly events?: Record<string, { readonly label: string }>;
}

/** Result of a successful evolution check */
export interface EvolutionResult {
  readonly from: Bugmon;
  readonly to: Bugmon;
  readonly trigger: EvolutionTrigger;
  readonly chain: EvolutionChain;
  readonly partyIndex?: number;
}

/** Evolution progress for HUD display */
export interface EvolutionProgress {
  readonly chainName: string;
  readonly eventType: string;
  readonly eventLabel: string;
  readonly current: number;
  readonly required: number;
  readonly percentage: number;
  readonly evolvesTo: string;
}

// ---------------------------------------------------------------------------
// Combo System Types
// ---------------------------------------------------------------------------

/** Combo/streak state */
export interface ComboState {
  readonly streak: number;
  readonly maxStreak: number;
  readonly totalBonusXP: number;
}

/** XP multiplier tier based on combo count */
export interface ComboTier {
  readonly min: number;
  readonly multiplier: number;
  readonly label: string;
}

// ---------------------------------------------------------------------------
// Run Session Types
// ---------------------------------------------------------------------------

/** Run status */
export type RunStatus = 'active' | 'completed' | 'abandoned';

/** Encounter mode */
export type EncounterMode = 'idle' | 'active';

/** Encounter entry in a run */
export interface RunEncounter {
  readonly monsterId: number;
  readonly monsterName: string;
  readonly error: string;
  readonly file?: string;
  readonly line?: number;
  readonly timestamp: number;
  readonly resolved: boolean;
}

/** Resolution entry in a run */
export interface RunResolution {
  readonly monsterId: number;
  readonly monsterName: string;
  readonly baseXP: number;
  readonly totalXP: number;
  readonly bonusXP: number;
  readonly multiplier: number;
  readonly comboStreak: number;
  readonly timestamp: number;
}

/** Boss defeat entry in a run */
export interface BossDefeat {
  readonly bossId: string;
  readonly bossName: string;
  readonly xp: number;
  readonly timestamp: number;
}

/** Run session state */
export interface RunSession {
  readonly runId: string;
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly repo: string | null;
  readonly playerLevel: number;
  readonly idleThreshold: number;
  readonly encounters: readonly RunEncounter[];
  readonly resolutions: readonly RunResolution[];
  readonly bossesDefeated: readonly BossDefeat[];
  readonly combo: ComboState;
  readonly score: number;
  readonly totalXP: number;
  readonly totalBonusXP: number;
  readonly status: RunStatus;
  readonly duration?: number;
  readonly summary?: RunSummary;
}

/** Run summary stats */
export interface RunSummary {
  readonly duration: number;
  readonly totalEncounters: number;
  readonly totalResolved: number;
  readonly unresolvedCount: number;
  readonly bossesDefeated: number;
  readonly maxCombo: number;
  readonly totalXP: number;
  readonly totalBonusXP: number;
  readonly score: number;
  readonly uniqueMonsters: number;
}

/** Current run stats for display */
export interface RunStats {
  readonly elapsed: number;
  readonly encounters: number;
  readonly resolved: number;
  readonly unresolved: number;
  readonly comboStreak: number;
  readonly maxCombo: number;
  readonly comboTier: ComboTier | null;
  readonly score: number;
  readonly totalXP: number;
  readonly bossesDefeated: number;
}

/** All-time aggregated stats */
export interface AllTimeStats {
  readonly totalRuns: number;
  readonly totalEncounters: number;
  readonly totalResolved: number;
  readonly totalBossesDefeated: number;
  readonly totalXP: number;
  readonly totalBonusXP: number;
  readonly bestScore: number;
  readonly bestCombo: number;
  readonly totalDuration: number;
  readonly uniqueMonsters: Set<number>;
}

/** Run history state */
export interface RunHistory {
  readonly runs: readonly RunSummaryEntry[];
  readonly allTime: AllTimeStats;
}

/** Serialized run history entry */
export interface RunSummaryEntry extends RunSummary {
  readonly runId: string;
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly status: RunStatus;
  readonly repo: string | null;
  readonly playerLevel: number;
}

// ---------------------------------------------------------------------------
// Governance Types
// ---------------------------------------------------------------------------

/** Action class categories */
export type ActionClass = 'file' | 'test' | 'git' | 'shell' | 'npm' | 'http' | 'deploy' | 'infra';

/** Action type definition */
export interface ActionDefinition {
  readonly class: ActionClass;
  readonly description: string;
}

/** Authorization decision */
export type Decision = 'allow' | 'deny' | 'escalate';

/** A canonical action object */
export interface CanonicalAction {
  readonly id: string;
  readonly type: string;
  readonly target: string;
  readonly justification: string;
  readonly class: ActionClass;
  readonly timestamp: number;
  readonly fingerprint: string;
  [key: string]: unknown;
}

/** Policy capability grant */
export interface Capability {
  readonly actions: readonly string[];
  readonly scope: string;
}

/** Policy definition */
export interface Policy {
  readonly capabilities: readonly string[];
  readonly deny?: readonly string[];
  readonly maxBlastRadius?: number;
  readonly protectedPaths?: readonly string[];
  readonly protectedBranches?: readonly string[];
}

/** Policy evaluation result */
export interface PolicyEvalResult {
  readonly decision: Decision;
  readonly reason: string;
  readonly capability?: Capability;
}

/** Invariant type */
export type InvariantType = 'test_result' | 'action' | 'dependency';

/** Invariant definition for domain/invariants.js */
export interface DomainInvariantDef {
  readonly id: string;
  readonly name?: string;
  readonly type: InvariantType;
  readonly description: string;
  readonly severity: Severity;
  readonly condition: {
    readonly field: string;
    readonly operator: string;
    readonly value: unknown;
  };
}

/** Invariant evaluation result */
export interface InvariantEvalResult {
  readonly holds: boolean;
  readonly invariantId: string;
  readonly expected: string;
  readonly actual: string;
}

/** Reference monitor decision record */
export interface DecisionRecord {
  readonly actionId: string;
  readonly decision: Decision;
  readonly reason: string;
  readonly timestamp: number;
  readonly policyHash: string;
  readonly capability?: Capability;
}

/** Source config for event source registry */
export interface SourceConfig {
  readonly name: string;
  start(onRawSignal: (raw: string) => void): void;
  stop(): void;
  readonly meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Ingestion Pipeline Types
// ---------------------------------------------------------------------------

/** Parsed error from the error parser */
export interface ParsedError {
  readonly type: string;
  readonly message: string;
  readonly rawLines: readonly string[];
  fingerprint?: string;
  readonly file?: string;
  readonly line?: number;
}

/** Bug event from the classifier */
export interface ClassifiedBugEvent {
  readonly id: string;
  readonly severity: Severity;
  readonly type: string;
  readonly message: string;
  readonly file?: string | null;
  readonly line?: number | null;
  readonly frequency?: number;
}

// ---------------------------------------------------------------------------
// Pipeline Orchestration Types
// ---------------------------------------------------------------------------

/** Pipeline stage ID */
export type StageId = 'plan' | 'build' | 'test' | 'optimize' | 'audit';

/** Agent role */
export type AgentRole = 'architect' | 'builder' | 'tester' | 'optimizer' | 'auditor';

/** Pipeline stage status */
export type StageStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

/** Stage result */
export interface StageResult {
  readonly stageId: StageId;
  readonly status: StageStatus;
  readonly output?: Record<string, unknown>;
  readonly errors?: readonly string[];
  readonly duration?: number;
}

/** Pipeline run state */
export interface PipelineRun {
  readonly runId: string;
  readonly task: string;
  readonly stages: Record<StageId, StageResult>;
  readonly context: Record<string, unknown>;
  readonly events: readonly DomainEvent[];
  readonly startedAt: number;
  readonly status: 'running' | 'completed' | 'failed';
}

/** Role definition */
export interface RoleDefinition {
  readonly name: AgentRole;
  readonly description: string;
  readonly responsibilities: readonly string[];
  readonly allowedOutputs: readonly string[];
  readonly canModifyFiles: boolean;
  readonly canRunTests: boolean;
  readonly canRefactor: boolean;
}

/** Stage definition */
export interface StageDefinition {
  readonly id: StageId;
  readonly name: string;
  readonly requiredRole: AgentRole;
  readonly inputRequirements: readonly string[];
  readonly outputContract: readonly string[];
}

// ---------------------------------------------------------------------------
// Execution Adapter Types
// ---------------------------------------------------------------------------

/** Execution result from an adapter */
export interface ExecutionResult {
  readonly success: boolean;
  readonly result?: unknown;
  readonly error?: string;
}

/** Adapter handler function */
export type AdapterHandler = (action: CanonicalAction) => unknown | Promise<unknown>;

/** Adapter registry interface */
export interface AdapterRegistry {
  register(actionClass: string, handler: AdapterHandler): void;
  execute(action: CanonicalAction, decisionRecord: DecisionRecord): Promise<ExecutionResult>;
  has(actionClass: string): boolean;
  listRegistered(): string[];
}

// ---------------------------------------------------------------------------
// AgentGuard Types
// ---------------------------------------------------------------------------

/** Model metadata — structured info about the AI agent's underlying model */
export interface AgentModelMeta {
  readonly model?: string;
  readonly provider?: string;
  readonly runtime?: string;
  readonly version?: string;
}

/** Trust tier — governs what actions an agent is allowed to take */
export type TrustTier = 'untrusted' | 'limited' | 'standard' | 'elevated' | 'admin';

/** Autonomy level — how independently the agent operates */
export type AutonomyLevel = 'supervised' | 'semi-autonomous' | 'autonomous';

/** Risk tolerance — how the agent approaches risky operations */
export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';

/** Agent persona role */
export type PersonaRole = 'developer' | 'reviewer' | 'ops' | 'security' | 'ci';

/** Agent persona — model metadata + behavioral traits for governance and visualization */
export interface AgentPersona {
  readonly modelMeta?: AgentModelMeta;
  readonly trustTier?: TrustTier;
  readonly autonomy?: AutonomyLevel;
  readonly riskTolerance?: RiskTolerance;
  readonly role?: PersonaRole;
  readonly tags?: readonly string[];
}

/** Raw agent action before normalization */
export interface RawAgentAction {
  readonly tool?: string;
  readonly command?: string;
  readonly file?: string;
  readonly content?: string;
  readonly branch?: string;
  readonly agent?: string;
  readonly persona?: AgentPersona;
  [key: string]: unknown;
}

/** Normalized intent from AAB */
export interface NormalizedIntent {
  readonly action: string;
  readonly target: string;
  readonly agent: string;
  readonly branch?: string;
  readonly command?: string;
  readonly filesAffected?: number;
  readonly persona?: AgentPersona;
  readonly destructive: boolean;
}

/** AAB authorization result */
export interface AuthorizationResult {
  readonly allowed: boolean;
  readonly decision: Decision;
  readonly matchedRule?: string;
  readonly matchedPolicy?: string;
  readonly reason: string;
  readonly severity?: number;
}

/** Intervention mode */
export type Intervention = 'deny' | 'rollback' | 'pause' | 'test-only';

/** Full engine decision */
export interface EngineDecision {
  readonly allowed: boolean;
  readonly intent: NormalizedIntent;
  readonly decision: AuthorizationResult;
  readonly violations: readonly {
    readonly invariantId: string;
    readonly name: string;
    readonly severity: number;
    readonly expected: string;
    readonly actual: string;
  }[];
  readonly events: readonly DomainEvent[];
  readonly evidencePack: EvidencePack | null;
  readonly intervention: Intervention | null;
}

/** AgentGuard invariant definition (different from domain/invariants.js) */
export interface AgentGuardInvariant {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly severity: number;
  check(state: SystemState): InvariantCheckResult;
}

/** System state snapshot for invariant checking */
export interface SystemState {
  readonly modifiedFiles?: readonly string[];
  readonly filesAffected?: number;
  readonly targetBranch?: string;
  readonly protectedBranches?: readonly string[];
  readonly directPush?: boolean;
  readonly forcePush?: boolean;
  readonly isPush?: boolean;
  readonly testsPass?: boolean;
  readonly formatPass?: boolean;
  readonly blastRadiusLimit?: number;
  /** File path targeted by the current action */
  readonly currentTarget?: string;
  /** Shell command of the current action (for shell.exec detection) */
  readonly currentCommand?: string;
  [key: string]: unknown;
}

/** Result of an invariant check */
export interface InvariantCheckResult {
  readonly holds: boolean;
  readonly expected: string;
  readonly actual: string;
}

/** Evidence pack for audit trail */
export interface EvidencePack {
  readonly packId: string;
  readonly timestamp: number;
  readonly intent: NormalizedIntent;
  readonly decision: AuthorizationResult;
  readonly violations: readonly unknown[];
  readonly events: readonly DomainEvent[];
  readonly summary: string;
  readonly severity: number;
}

/** Policy rule for AgentGuard */
export interface PolicyRule {
  readonly action: string;
  readonly effect: Decision;
  readonly conditions?: Record<string, unknown>;
  readonly reason?: string;
}

/** Policy definition for AgentGuard */
export interface PolicyDefinition {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly rules: readonly PolicyRule[];
  readonly severity?: number;
}

/** Escalation level */
export type EscalationLevel = 0 | 1 | 2 | 3;

/** Monitor status */
export interface MonitorStatus {
  readonly escalationLevel: EscalationLevel;
  readonly totalDenials: number;
  readonly totalViolations: number;
  readonly recentEvents: readonly DomainEvent[];
}

// ---------------------------------------------------------------------------
// Module Contract Types
// ---------------------------------------------------------------------------

/** Contract export definition */
export interface ContractExport {
  readonly params: readonly string[];
  readonly returns: string;
}

/** Module contract */
export interface ModuleContract {
  readonly exports: Record<string, ContractExport>;
  readonly invariants: readonly string[];
  readonly dependencies: readonly string[];
}

// ---------------------------------------------------------------------------
// Execution Event Log Types
// ---------------------------------------------------------------------------

/** Actor who caused the execution event */
export type Actor = 'human' | 'agent' | 'system';

/** Source system that produced the event */
export type EventSource = 'cli' | 'ci' | 'git' | 'runtime' | 'editor' | 'governance';

/** Context surrounding an execution event */
export interface ExecutionContext {
  readonly repo?: string;
  readonly branch?: string;
  readonly commit?: string;
  readonly file?: string;
  readonly agentRunId?: string;
}

/** A universal execution event — the atomic unit of the execution log */
export interface ExecutionEvent {
  readonly id: string;
  readonly timestamp: number;
  readonly actor: Actor;
  readonly source: EventSource;
  readonly kind: string;
  readonly context: ExecutionContext;
  readonly payload: Record<string, unknown>;
  readonly causedBy?: string;
  readonly fingerprint: string;
}

/** Filter for querying execution events */
export interface ExecutionEventFilter {
  readonly kind?: string;
  readonly actor?: Actor;
  readonly source?: EventSource;
  readonly since?: number;
  readonly until?: number;
  readonly agentRunId?: string;
  readonly file?: string;
}

/** Execution event log interface */
export interface ExecutionEventLog {
  append(event: ExecutionEvent): void;
  query(filter?: ExecutionEventFilter): ExecutionEvent[];
  replay(fromId?: string): ExecutionEvent[];
  trace(eventId: string): ExecutionEvent[];
  count(): number;
  clear(): void;
  toNDJSON(): string;
  fromNDJSON(ndjson: string): number;
}

/** Risk score for an agent run */
export interface RiskScore {
  readonly agentRunId: string;
  readonly score: number;
  readonly level: 'low' | 'medium' | 'high' | 'critical';
  readonly factors: readonly RiskFactor[];
  readonly eventCount: number;
  readonly failureCount: number;
  readonly violationCount: number;
}

/** Individual risk factor contributing to a score */
export interface RiskFactor {
  readonly name: string;
  readonly weight: number;
  readonly detail: string;
}

/** Cluster of related failures */
export interface FailureCluster {
  readonly id: string;
  readonly rootEvent: ExecutionEvent;
  readonly events: readonly ExecutionEvent[];
  readonly commonFile?: string;
  readonly commonKind?: string;
  readonly severity: number;
}

/** Mapping from an execution event to a game encounter */
export interface EncounterMapping {
  readonly eventId: string;
  readonly encounterType: 'monster' | 'boss' | 'evolution';
  readonly severity: Severity;
  readonly name: string;
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Sink & Decision Record Types (shared across kernel, storage backends)
// ---------------------------------------------------------------------------

/** Sink interface for domain events (used by JSONL, SQLite, Firestore, Webhook backends) */
export interface EventSink {
  write(event: DomainEvent): void;
  flush?(): void;
}

/** Governance Decision Record — first-class audit artifact */
export interface GovernanceDecisionRecord {
  /** Unique record ID: "dec_<timestamp>_<hash>" */
  recordId: string;
  /** Kernel run ID this decision belongs to */
  runId: string;
  /** When the decision was made */
  timestamp: number;
  /** The action that was evaluated */
  action: {
    type: string;
    target: string;
    agent: string;
    destructive: boolean;
    command?: string;
    persona?: AgentPersona;
  };
  /** Final governance outcome */
  outcome: 'allow' | 'deny' | 'pause' | 'rollback';
  /** Human-readable reason for the outcome */
  reason: string;
  /** Intervention type if denied */
  intervention: string | null;
  /** Policy matching details */
  policy: {
    matchedPolicyId: string | null;
    matchedPolicyName: string | null;
    severity: number;
  };
  /** Invariant evaluation results */
  invariants: {
    allHold: boolean;
    violations: Array<{
      invariantId: string;
      name: string;
      severity: number;
      expected: string;
      actual: string;
    }>;
  };
  /** Pre-execution simulation results */
  simulation: SimulationSummary | null;
  /** Evidence pack ID if generated */
  evidencePackId: string | null;
  /** Monitor state at decision time */
  monitor: {
    escalationLevel: number;
    totalEvaluations: number;
    totalDenials: number;
  };
  /** Execution results (null if denied or dry-run) */
  execution: {
    executed: boolean;
    success: boolean | null;
    durationMs: number | null;
    error: string | null;
  };
}

/** Placeholder for simulation integration */
export interface SimulationSummary {
  predictedChanges: string[];
  blastRadius: number;
  riskLevel: 'low' | 'medium' | 'high';
  simulatorId: string;
  durationMs: number;
}

/** Sink interface for decision records */
export interface DecisionSink {
  write(record: GovernanceDecisionRecord): void;
  flush?(): void;
}

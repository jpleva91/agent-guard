/**
 * Event Contract — Canonical event taxonomy
 *
 * All 29 event kinds defined in domain/events.js, organized by category.
 * Every system in the AgentGuard + BugMon platform produces and consumes
 * events conforming to this taxonomy.
 *
 * Source: domain/events.js
 */

// --- Ingestion & Classification ---

/** Raw error captured from stderr, test output, or linter */
export type ErrorObserved = "ErrorObserved";
// Required: message
// Optional: source, errorType, file, line, severity, fingerprint, bugEvent

/** Error classified into a BugEvent with severity and species mapping */
export type BugClassified = "BugClassified";
// Required: severity, speciesId
// Optional: fingerprint, name

// --- Battle Lifecycle ---

/** Battle encounter initiated */
export type EncounterStarted = "ENCOUNTER_STARTED";
// Required: enemy
// Optional: playerLevel

/** A move was executed in battle */
export type MoveUsed = "MOVE_USED";
// Required: move, attacker
// Optional: defender

/** Damage was inflicted on a target */
export type DamageDealt = "DAMAGE_DEALT";
// Required: amount, target
// Optional: effectiveness

/** HP was restored to a target */
export type HealingApplied = "HEALING_APPLIED";
// Required: amount, target

/** A passive ability was triggered */
export type PassiveActivated = "PASSIVE_ACTIVATED";
// Required: passive, owner

/** A BugMon was defeated (HP reached 0) */
export type BugmonFainted = "BUGMON_FAINTED";
// Required: bugmon

/** A cache (catch) attempt was initiated */
export type CacheAttempted = "CACHE_ATTEMPTED";
// Required: target

/** A cache attempt succeeded */
export type CacheSuccess = "CACHE_SUCCESS";
// Required: target

/** Battle concluded with a result */
export type BattleEnded = "BATTLE_ENDED";
// Required: result

// --- Progression ---

/** Developer activity was tracked (commit, PR, etc.) */
export type ActivityRecorded = "ActivityRecorded";
// Required: activity

/** A BugMon species evolved into a new form */
export type EvolutionTriggered = "EvolutionTriggered";
// Required: from, to

// --- Session ---

/** Game state machine transitioned */
export type StateChanged = "StateChanged";
// Required: from, to

/** A roguelike dungeon run was started */
export type RunStarted = "RunStarted";
// Required: runId
// Optional: seed, sessionStart, playerLevel

/** A roguelike run concluded */
export type RunEnded = "RunEnded";
// Required: runId, result
// Optional: score, encounterCount, duration, defeatedBosses

/** A progress checkpoint was reached during a run */
export type CheckpointReached = "CheckpointReached";
// Required: runId, checkpoint
// Optional: encounterCount, playerHp, score

// --- Governance (AgentGuard) ---

/** An agent action was denied by policy */
export type PolicyDenied = "PolicyDenied";
// Required: policy, action, reason
// Optional: agentId, file, line, metadata

/** An agent attempted an unauthorized action */
export type UnauthorizedAction = "UnauthorizedAction";
// Required: action, reason
// Optional: agentId, scope, file, line, metadata

/** A system invariant was violated */
export type InvariantViolation = "InvariantViolation";
// Required: invariant, expected, actual
// Optional: file, line, metadata

/** An action's blast radius exceeded limits */
export type BlastRadiusExceeded = "BlastRadiusExceeded";
// Required: filesAffected, limit
// Optional: files, action, metadata

/** A branch protection rule was violated */
export type MergeGuardFailure = "MergeGuardFailure";
// Required: branch, reason
// Optional: protectedBranches, metadata

/** An audit evidence pack was generated */
export type EvidencePackGenerated = "EvidencePackGenerated";
// Required: packId, eventIds
// Optional: summary, metadata

// --- Developer Signals ---

/** A file was saved */
export type FileSaved = "FileSaved";
// Required: file
// Optional: language, linesChanged

/** A test suite completed */
export type TestCompleted = "TestCompleted";
// Required: result
// Optional: suite, duration, passed, failed, total

/** A build completed */
export type BuildCompleted = "BuildCompleted";
// Required: result
// Optional: duration, tool, exitCode

/** A git commit was created */
export type CommitCreated = "CommitCreated";
// Required: hash
// Optional: message, filesChanged, additions, deletions

/** A code review action occurred */
export type CodeReviewed = "CodeReviewed";
// Required: action
// Optional: prId, file, comment

/** A deployment completed */
export type DeployCompleted = "DeployCompleted";
// Required: result
// Optional: environment, duration, version

/** A lint run completed */
export type LintCompleted = "LintCompleted";
// Required: result
// Optional: tool, errors, warnings, fixed

// --- Union Type ---

export type EventKind =
  | ErrorObserved
  | BugClassified
  | EncounterStarted
  | MoveUsed
  | DamageDealt
  | HealingApplied
  | PassiveActivated
  | BugmonFainted
  | CacheAttempted
  | CacheSuccess
  | BattleEnded
  | ActivityRecorded
  | EvolutionTriggered
  | StateChanged
  | RunStarted
  | RunEnded
  | CheckpointReached
  | PolicyDenied
  | UnauthorizedAction
  | InvariantViolation
  | BlastRadiusExceeded
  | MergeGuardFailure
  | EvidencePackGenerated
  | FileSaved
  | TestCompleted
  | BuildCompleted
  | CommitCreated
  | CodeReviewed
  | DeployCompleted
  | LintCompleted;

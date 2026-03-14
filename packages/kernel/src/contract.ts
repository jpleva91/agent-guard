// Kernel API Contract — stable public interface for the governed action kernel.
// This file defines the types that form the kernel's input/output boundary.
// It serves as the reference specification for a future Rust implementation.
//
// STABILITY: These interfaces are considered stable. Changes should be
// additive (new optional fields) and backward-compatible.

// Re-export the stable boundary types from their source modules.
// Consumers who only need the contract can import from this file.

export type { RawAgentAction, AuthorizationResult, DestructivePattern } from './aab.js';
export type { KernelResult, KernelConfig, Kernel } from './kernel.js';
export type {
  EngineDecision,
  EngineConfig,
  Engine,
  InterventionType,
} from './decision.js';
export { INTERVENTION } from './decision.js';
export type {
  MonitorDecision,
  MonitorConfig,
  Monitor,
  EscalationLevel,
} from './monitor.js';
export { ESCALATION } from './monitor.js';
export type {
  BlastRadiusWeights,
  BlastRadiusResult,
  BlastRadiusFactor,
} from './blast-radius.js';
export type {
  EvidencePack,
  ExplainableEvidencePack,
  EvaluationStep,
  ProvenanceEntry,
} from './evidence.js';
export type { SimulatorRegistry, ActionSimulator, SimulationResult, ImpactForecast } from './simulation/types.js';
export type { GovernanceDecisionRecord, DecisionSink } from './decisions/types.js';

// Stable upstream types relevant to the kernel boundary.
// These are re-exported so that contract consumers need only one import.
export type {
  DomainEvent,
  CanonicalAction,
  ExecutionResult,
  EventSink,
  NormalizedIntent,
} from '@red-codes/core';

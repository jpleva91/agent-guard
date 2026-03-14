// Simulation types — pre-execution impact prediction interfaces.
// Pure type definitions. No DOM, no Node.js-specific APIs.

import type { NormalizedIntent } from '@red-codes/policy';

/** Structured impact forecast for predictive governance */
export interface ImpactForecast {
  /** File paths predicted to be changed by this action */
  predictedFiles: string[];
  /** Downstream modules or packages impacted by the change */
  dependenciesAffected: string[];
  /** Likelihood of test failure (0–100) based on scope and sensitivity of changes */
  testRiskScore: number;
  /** Weighted blast radius score from the blast-radius computation engine */
  blastRadiusScore: number;
  /** Risk level derived from the combined forecast assessment */
  riskLevel: 'low' | 'medium' | 'high';
  /** Factors that contributed to the blast radius score */
  blastRadiusFactors: Array<{ name: string; multiplier: number; reason: string }>;
}

/** Result of simulating an action before execution */
export interface SimulationResult {
  /** Human-readable list of predicted changes */
  predictedChanges: string[];
  /** Estimated number of files/entities affected */
  blastRadius: number;
  /** Overall risk assessment */
  riskLevel: 'low' | 'medium' | 'high';
  /** Simulator-specific details */
  details: Record<string, unknown>;
  /** Which simulator produced this result */
  simulatorId: string;
  /** How long the simulation took (ms) */
  durationMs: number;
  /** Structured impact forecast (populated by buildImpactForecast) */
  forecast?: ImpactForecast;
}

/** An action simulator predicts the impact of an action before execution */
export interface ActionSimulator {
  /** Unique simulator identifier */
  readonly id: string;
  /** Check if this simulator can handle the given intent */
  supports(intent: NormalizedIntent): boolean;
  /** Simulate the action and predict its impact */
  simulate(intent: NormalizedIntent, context: Record<string, unknown>): Promise<SimulationResult>;
}

/** Registry of action simulators, routes intents to the correct simulator */
export interface SimulatorRegistry {
  /** Register a simulator */
  register(simulator: ActionSimulator): void;
  /** Find a simulator that supports the given intent */
  find(intent: NormalizedIntent): ActionSimulator | null;
  /** Get all registered simulators */
  all(): ActionSimulator[];
}

import type { LoopGuardConfig, SquadState } from './types.js';

export interface LoopGuardContext {
  retryCount: number;
  predictedFileChanges: number;
  runStartTime: number;
}

export type GuardViolation = 'budget' | 'retry' | 'blast-radius' | 'cascade' | 'time';

export interface LoopGuardResult {
  allowed: boolean;
  violations: GuardViolation[];
  messages: string[];
}

export function checkLoopGuards(
  config: LoopGuardConfig,
  state: SquadState,
  context: LoopGuardContext
): LoopGuardResult {
  const violations: GuardViolation[] = [];
  const messages: string[] = [];

  // 1. Budget guard
  if (state.prQueue.open >= config.maxOpenPRsPerSquad) {
    violations.push('budget');
    messages.push(
      `PR budget exceeded: ${state.prQueue.open} open (max ${config.maxOpenPRsPerSquad}). Skip implementation, focus on review/merge.`
    );
  }

  // 2. Retry guard
  if (context.retryCount > config.maxRetries) {
    violations.push('retry');
    messages.push(
      `Retry limit exceeded: ${context.retryCount} attempts (max ${config.maxRetries}). Create escalation issue.`
    );
  }

  // 3. Blast radius guard
  if (context.predictedFileChanges > config.maxBlastRadius) {
    violations.push('blast-radius');
    messages.push(
      `Blast radius exceeded: ${context.predictedFileChanges} files (max ${config.maxBlastRadius}). Escalate to Architect.`
    );
  }

  // 4. Time guard
  const elapsedMs = Date.now() - context.runStartTime;
  const elapsedMin = elapsedMs / 60_000;
  if (elapsedMin > config.maxRunMinutes) {
    violations.push('time');
    messages.push(
      `Run time exceeded: ${Math.round(elapsedMin)}min (max ${config.maxRunMinutes}min). Force-stop, EM investigates.`
    );
  }

  return {
    allowed: violations.length === 0,
    violations,
    messages,
  };
}

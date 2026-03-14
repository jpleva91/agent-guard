// Invariant checker — evaluates system state against invariant definitions.
// Pure domain logic. No DOM, no Node.js-specific APIs.

import type { DomainEvent } from '@red-codes/core';
import { createEvent, INVARIANT_VIOLATION } from '@red-codes/events';
import type { AgentGuardInvariant, InvariantCheckResult, SystemState } from './definitions.js';

export interface InvariantCheck {
  holds: boolean;
  invariant: AgentGuardInvariant;
  result: InvariantCheckResult;
}

export function checkInvariant(invariant: AgentGuardInvariant, state: SystemState): InvariantCheck {
  const result = invariant.check(state);
  return {
    holds: result.holds,
    invariant,
    result,
  };
}

export function checkAllInvariants(
  invariants: AgentGuardInvariant[],
  state: SystemState
): {
  violations: InvariantCheck[];
  events: DomainEvent[];
  allHold: boolean;
} {
  const violations: InvariantCheck[] = [];
  const events: DomainEvent[] = [];

  for (const invariant of invariants) {
    const check = checkInvariant(invariant, state);

    if (!check.holds) {
      violations.push(check);

      events.push(
        createEvent(INVARIANT_VIOLATION, {
          invariant: invariant.id,
          expected: check.result.expected,
          actual: check.result.actual,
          metadata: {
            name: invariant.name,
            severity: invariant.severity,
            description: invariant.description,
          },
        })
      );
    }
  }

  return {
    violations,
    events,
    allHold: violations.length === 0,
  };
}

export function buildSystemState(context: Record<string, unknown> = {}): SystemState {
  return {
    modifiedFiles: (context.modifiedFiles as string[]) || [],
    targetBranch: (context.targetBranch as string) || '',
    directPush: (context.directPush as boolean) || false,
    forcePush: (context.forcePush as boolean) || false,
    isPush: (context.isPush as boolean) || false,
    testsPass: context.testsPass as boolean | undefined,
    filesAffected:
      (context.filesAffected as number) || ((context.modifiedFiles as string[]) || []).length,
    blastRadiusLimit: (context.blastRadiusLimit as number) || 20,
    protectedBranches: (context.protectedBranches as string[]) || ['main', 'master'],
    currentTarget: (context.currentTarget as string) || '',
    currentCommand: (context.currentCommand as string) || '',
    currentActionType: (context.currentActionType as string) || '',
    fileContentDiff: (context.fileContentDiff as string) || '',
    writeSizeBytes: context.writeSizeBytes as number | undefined,
    writeSizeBytesLimit: context.writeSizeBytesLimit as number | undefined,
  };
}

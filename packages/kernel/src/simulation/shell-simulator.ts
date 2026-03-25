// Shell simulator — predicts impact of general shell.exec commands.
// Evaluates commands against destructive patterns and package-manager heuristics.
// Falls back gracefully when the package simulator already handles the command.

import type { NormalizedIntent } from '@red-codes/policy';
import { getDestructivePatterns } from '@red-codes/core';
import type { ActionSimulator, SimulationResult } from './types.js';

export function createShellSimulator(): ActionSimulator {
  return {
    id: 'shell-simulator',

    supports(intent: NormalizedIntent): boolean {
      return intent.action === 'shell.exec';
    },

    async simulate(intent: NormalizedIntent): Promise<SimulationResult> {
      const start = Date.now();
      const command = intent.command || intent.target || '';
      const predictedChanges: string[] = [];
      const details: Record<string, unknown> = {};
      let blastRadius = 1;
      let riskLevel: 'low' | 'medium' | 'high' = 'low';

      if (!command) {
        return {
          predictedChanges: ['Empty command'],
          blastRadius: 0,
          riskLevel: 'low',
          details: { empty: true },
          simulatorId: 'shell-simulator',
          durationMs: Date.now() - start,
        };
      }

      // Scan against destructive patterns
      const destructivePatterns = getDestructivePatterns();
      const matches: Array<{ description: string; riskLevel: string; category: string }> = [];

      for (const dp of destructivePatterns) {
        if (dp.pattern.test(command)) {
          matches.push({
            description: dp.description,
            riskLevel: dp.riskLevel,
            category: dp.category,
          });
        }
      }

      if (matches.length > 0) {
        details.destructiveMatches = matches;
        const hasCritical = matches.some((m) => m.riskLevel === 'critical');
        riskLevel = hasCritical ? 'high' : 'medium';
        blastRadius = hasCritical ? 50 : 10;

        for (const m of matches) {
          predictedChanges.push(`${m.riskLevel.toUpperCase()}: ${m.description}`);
        }
      } else {
        predictedChanges.push(`Shell command: ${command}`);
      }

      details.command = command;
      details.destructivePatternCount = matches.length;

      return {
        predictedChanges,
        blastRadius,
        riskLevel,
        details,
        simulatorId: 'shell-simulator',
        durationMs: Date.now() - start,
      };
    },
  };
}

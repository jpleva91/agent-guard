// Package simulator — predicts impact of package management operations.
// Uses `npm install --dry-run` to preview dependency changes.

import { execSync } from 'node:child_process';
import type { NormalizedIntent } from '../policies/evaluator.js';
import type { ActionSimulator, SimulationResult } from './types.js';

const INSTALL_PATTERNS = [
  /\bnpm\s+install\b/,
  /\bnpm\s+i\b/,
  /\byarn\s+add\b/,
  /\bpnpm\s+add\b/,
  /\bpnpm\s+install\b/,
  /\bnpm\s+uninstall\b/,
  /\bnpm\s+remove\b/,
  /\byarn\s+remove\b/,
  /\bpnpm\s+remove\b/,
];

function isPackageCommand(command: string | undefined): boolean {
  if (!command) return false;
  return INSTALL_PATTERNS.some((p) => p.test(command));
}

function parseNpmDryRunOutput(output: string): {
  added: number;
  removed: number;
  changed: number;
  packages: string[];
} {
  let added = 0;
  let removed = 0;
  let changed = 0;
  const packages: string[] = [];

  // Parse "added X packages" style output
  const addedMatch = output.match(/added\s+(\d+)\s+package/);
  if (addedMatch) added = parseInt(addedMatch[1], 10);

  const removedMatch = output.match(/removed\s+(\d+)\s+package/);
  if (removedMatch) removed = parseInt(removedMatch[1], 10);

  const changedMatch = output.match(/changed\s+(\d+)\s+package/);
  if (changedMatch) changed = parseInt(changedMatch[1], 10);

  // Extract package names from lines like "+ package@version"
  const lines = output.split('\n');
  for (const line of lines) {
    const pkgMatch = line.match(/[+\-]\s+(\S+@\S+)/);
    if (pkgMatch) packages.push(pkgMatch[1]);
  }

  return { added, removed, changed, packages };
}

export function createPackageSimulator(): ActionSimulator {
  return {
    id: 'package-simulator',

    supports(intent: NormalizedIntent): boolean {
      return intent.action === 'shell.exec' && isPackageCommand(intent.command);
    },

    async simulate(intent: NormalizedIntent): Promise<SimulationResult> {
      const start = Date.now();
      const command = intent.command || '';
      const predictedChanges: string[] = [];
      const details: Record<string, unknown> = {};
      let blastRadius = 0;
      let riskLevel: 'low' | 'medium' | 'high' = 'low';

      // Try npm install --dry-run to preview changes
      if (/\bnpm\s+(install|i)\b/.test(command)) {
        const dryRunCmd = command.replace(/\bnpm\s+(install|i)\b/, 'npm install --dry-run');
        try {
          const output = execSync(dryRunCmd, {
            encoding: 'utf8',
            timeout: 30000,
            env: { ...process.env, npm_config_fund: 'false', npm_config_audit: 'false' },
          });

          const parsed = parseNpmDryRunOutput(output);
          details.npmDryRun = parsed;
          blastRadius = parsed.added + parsed.removed + parsed.changed;

          if (parsed.added > 0) predictedChanges.push(`${parsed.added} packages added`);
          if (parsed.removed > 0) predictedChanges.push(`${parsed.removed} packages removed`);
          if (parsed.changed > 0) predictedChanges.push(`${parsed.changed} packages changed`);
          if (parsed.packages.length > 0) {
            details.affectedPackages = parsed.packages;
          }
        } catch {
          // Dry-run failed — estimate from command
          details.dryRunFailed = true;
          predictedChanges.push('Package installation (dry-run unavailable)');
          blastRadius = 10; // Conservative estimate
        }
      } else {
        // For yarn/pnpm or remove commands, do basic analysis
        predictedChanges.push(`Package operation: ${command}`);
        blastRadius = 5; // Conservative estimate
        details.estimatedOnly = true;
      }

      // Risk assessment
      if (blastRadius > 50) {
        riskLevel = 'high';
      } else if (blastRadius > 10) {
        riskLevel = 'medium';
      }

      // Check for global installs (always medium+ risk)
      if (/\s-g\b|\s--global\b/.test(command)) {
        riskLevel = riskLevel === 'high' ? 'high' : 'medium';
        predictedChanges.push('Global package installation');
        details.globalInstall = true;
      }

      return {
        predictedChanges,
        blastRadius,
        riskLevel,
        details,
        simulatorId: 'package-simulator',
        durationMs: Date.now() - start,
      };
    },
  };
}

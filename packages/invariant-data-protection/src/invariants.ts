// Data protection invariant definitions.
// Follows the same shape as built-in invariants in @red-codes/invariants.

import type { AgentGuardInvariant, SystemState } from '@red-codes/invariants';
import { PII_PATTERNS, SECRET_PATTERNS, isLogPath } from './patterns.js';

/** Default maximum files per batch operation */
const DEFAULT_MAX_FILE_COUNT = 50;

/**
 * Scan content for the first matching PII pattern.
 * Returns the label of the first match, or null if none found.
 */
function detectPii(content: string): string | null {
  for (const { pattern, label } of PII_PATTERNS) {
    if (pattern.test(content)) {
      return label;
    }
  }
  return null;
}

/**
 * Scan content for the first matching secret pattern.
 * Returns the label of the first match, or null if none found.
 */
function detectSecret(content: string): string | null {
  for (const { pattern, label } of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      return label;
    }
  }
  return null;
}

/**
 * Data protection invariants — 3 invariants for PII, secrets, and batch limits.
 */
export const DATA_PROTECTION_INVARIANTS: AgentGuardInvariant[] = [
  {
    id: 'no-pii-in-logs',
    name: 'No PII in Logs',
    description:
      'Log files and output files must not contain personally identifiable information (PII)',
    severity: 4,
    check(state: SystemState): { holds: boolean; expected: string; actual: string } {
      const actionType = state.currentActionType || '';

      // Only trigger on file.write actions
      if (actionType !== 'file.write') {
        return { holds: true, expected: 'N/A', actual: 'Not a file.write action' };
      }

      const target = state.currentTarget || '';

      // Only check log-like paths
      if (!isLogPath(target)) {
        return { holds: true, expected: 'No PII in log files', actual: 'Target is not a log file' };
      }

      // Check content for PII patterns
      const content = state.fileContentDiff || '';
      if (!content) {
        return {
          holds: true,
          expected: 'No PII in log files',
          actual: 'No content to check',
        };
      }

      const piiType = detectPii(content);
      if (piiType) {
        return {
          holds: false,
          expected: 'No PII in log files',
          actual: `PII pattern detected: ${piiType}`,
        };
      }

      return {
        holds: true,
        expected: 'No PII in log files',
        actual: 'No PII detected in log content',
      };
    },
  },

  {
    id: 'no-hardcoded-secrets',
    name: 'No Hardcoded Secrets',
    description:
      'Written files must not contain hardcoded secrets such as API keys, tokens, or private keys',
    severity: 5,
    check(state: SystemState): { holds: boolean; expected: string; actual: string } {
      const actionType = state.currentActionType || '';

      // Only trigger on file.write actions
      if (actionType !== 'file.write') {
        return { holds: true, expected: 'N/A', actual: 'Not a file.write action' };
      }

      const content = state.fileContentDiff || '';
      if (!content) {
        return {
          holds: true,
          expected: 'No hardcoded secrets',
          actual: 'No content to check',
        };
      }

      const secretType = detectSecret(content);
      if (secretType) {
        return {
          holds: false,
          expected: 'No hardcoded secrets',
          actual: `Hardcoded secret detected: ${secretType}`,
        };
      }

      return {
        holds: true,
        expected: 'No hardcoded secrets',
        actual: 'No hardcoded secrets detected',
      };
    },
  },

  {
    id: 'max-file-count-per-action',
    name: 'Max File Count Per Action',
    description:
      'Batch file operations must not exceed a configurable limit on the number of files affected',
    severity: 2,
    check(state: SystemState): { holds: boolean; expected: string; actual: string } {
      const actionType = state.currentActionType || '';

      // Only trigger on file mutation actions
      const FILE_MUTATION_ACTIONS = ['file.write', 'file.delete', 'file.move'];
      if (!FILE_MUTATION_ACTIONS.includes(actionType)) {
        return { holds: true, expected: 'N/A', actual: 'Not a file mutation action' };
      }

      const limit =
        (state as SystemState & { maxFileCountLimit?: number }).maxFileCountLimit ??
        DEFAULT_MAX_FILE_COUNT;
      const count = state.filesAffected ?? 0;

      if (count > limit) {
        return {
          holds: false,
          expected: `At most ${limit} files per batch operation`,
          actual: `Batch operation exceeds ${limit} file limit (${count} files)`,
        };
      }

      return {
        holds: true,
        expected: `At most ${limit} files per batch operation`,
        actual: `${count} files in batch (within limit)`,
      };
    },
  },
];

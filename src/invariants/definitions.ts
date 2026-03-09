// Default system invariant definitions.
// Pure domain logic. No DOM, no Node.js-specific APIs.

export interface InvariantCheckResult {
  holds: boolean;
  expected: string;
  actual: string;
}

export interface AgentGuardInvariant {
  id: string;
  name: string;
  description: string;
  severity: number;
  check: (state: SystemState) => InvariantCheckResult;
}

export interface SystemState {
  modifiedFiles?: string[];
  targetBranch?: string;
  directPush?: boolean;
  forcePush?: boolean;
  isPush?: boolean;
  testsPass?: boolean;
  filesAffected?: number;
  blastRadiusLimit?: number;
  protectedBranches?: string[];
  /** Blast radius from pre-execution simulation (overrides filesAffected in blast-radius check) */
  simulatedBlastRadius?: number;
  /** Risk level from pre-execution simulation */
  simulatedRiskLevel?: string;
}

export const DEFAULT_INVARIANTS: AgentGuardInvariant[] = [
  {
    id: 'no-secret-exposure',
    name: 'No Secret Exposure',
    description: 'Sensitive files (.env, credentials, keys) must not be committed or exposed',
    severity: 5,
    check(state) {
      const sensitivePatterns = ['.env', 'credentials', '.pem', '.key', 'secret', 'token'];
      const exposedFiles = (state.modifiedFiles || []).filter((f) => {
        const lower = f.toLowerCase();
        return sensitivePatterns.some((p) => lower.includes(p));
      });
      return {
        holds: exposedFiles.length === 0,
        expected: 'No sensitive files modified',
        actual:
          exposedFiles.length > 0
            ? `Sensitive files detected: ${exposedFiles.join(', ')}`
            : 'No sensitive files modified',
      };
    },
  },

  {
    id: 'protected-branch',
    name: 'Protected Branch Safety',
    description: 'Direct pushes to main/master are forbidden',
    severity: 4,
    check(state) {
      const protectedBranches = state.protectedBranches || ['main', 'master'];
      const targetBranch = state.targetBranch || '';
      const isProtected = protectedBranches.includes(targetBranch);
      return {
        holds: !isProtected || !state.directPush,
        expected: 'No direct push to protected branch',
        actual: isProtected && state.directPush ? `Direct push to ${targetBranch}` : 'Safe',
      };
    },
  },

  {
    id: 'blast-radius-limit',
    name: 'Blast Radius Limit',
    description: 'A single operation must not modify too many files at once',
    severity: 3,
    check(state) {
      const limit = state.blastRadiusLimit || 20;
      // Prefer simulated blast radius over static file count when available
      const count = state.simulatedBlastRadius ?? state.filesAffected ?? 0;
      const source = state.simulatedBlastRadius !== undefined ? 'simulated' : 'static';
      return {
        holds: count <= limit,
        expected: `At most ${limit} files modified`,
        actual: `${count} files modified (${source})`,
      };
    },
  },

  {
    id: 'test-before-push',
    name: 'Tests Before Push',
    description: 'Tests must pass before pushing code',
    severity: 3,
    check(state) {
      if (!state.isPush) {
        return { holds: true, expected: 'N/A', actual: 'Not a push operation' };
      }
      return {
        holds: state.testsPass === true,
        expected: 'Tests passing',
        actual: state.testsPass === true ? 'Tests passing' : 'Tests not verified',
      };
    },
  },

  {
    id: 'no-force-push',
    name: 'No Force Push',
    description: 'Force pushes are forbidden unless explicitly authorized',
    severity: 4,
    check(state) {
      return {
        holds: !state.forcePush,
        expected: 'No force push',
        actual: state.forcePush ? 'Force push detected' : 'Normal push',
      };
    },
  },

  {
    id: 'lockfile-integrity',
    name: 'Lockfile Integrity',
    description: 'Package lockfiles must stay in sync with manifests',
    severity: 2,
    check(state) {
      const manifestChanged = (state.modifiedFiles || []).some(
        (f) => f === 'package.json' || f.endsWith('/package.json')
      );
      const lockfileChanged = (state.modifiedFiles || []).some(
        (f) =>
          f === 'package-lock.json' ||
          f === 'yarn.lock' ||
          f === 'pnpm-lock.yaml' ||
          f.endsWith('/package-lock.json')
      );

      if (!manifestChanged) {
        return { holds: true, expected: 'N/A', actual: 'No manifest changes' };
      }

      return {
        holds: lockfileChanged,
        expected: 'Lockfile updated with manifest',
        actual: lockfileChanged ? 'Lockfile updated' : 'Manifest changed without lockfile',
      };
    },
  },
];

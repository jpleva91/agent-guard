// Agent role definitions for the multi-agent engineering pipeline
// No DOM, no Node.js APIs — pure data definitions.

import type { AgentRole } from '../../core/types.js';

export const ROLES: Record<string, AgentRole> = {
  ARCHITECT: 'architect',
  BUILDER: 'builder',
  TESTER: 'tester',
  OPTIMIZER: 'optimizer',
  AUDITOR: 'auditor',
};

interface RoleDef {
  name: string;
  phase: number;
  responsibilities: readonly string[];
  outputs: readonly string[];
  canModifyFiles: boolean;
  canRunTests: boolean;
  canRefactor: boolean;
}

export const ROLE_DEFINITIONS: Record<string, RoleDef> = {
  [ROLES.ARCHITECT]: {
    name: 'Architect',
    phase: 0,
    responsibilities: [
      'interpret specifications',
      'produce implementation plan',
      'define files to modify',
      'define invariants and constraints',
    ],
    outputs: ['plan'],
    canModifyFiles: false,
    canRunTests: false,
    canRefactor: false,
  },
  [ROLES.BUILDER]: {
    name: 'Builder',
    phase: 1,
    responsibilities: ['write code', 'implement features', 'follow architecture plan'],
    outputs: ['code'],
    canModifyFiles: true,
    canRunTests: false,
    canRefactor: false,
  },
  [ROLES.TESTER]: {
    name: 'Tester',
    phase: 2,
    responsibilities: [
      'generate tests',
      'identify missing coverage',
      'run test scenarios',
      'report test gaps',
    ],
    outputs: ['tests', 'coverage_report'],
    canModifyFiles: true,
    canRunTests: true,
    canRefactor: false,
  },
  [ROLES.OPTIMIZER]: {
    name: 'Optimizer',
    phase: 3,
    responsibilities: ['refactor for clarity', 'improve performance', 'simplify code'],
    outputs: ['refactored_code'],
    canModifyFiles: true,
    canRunTests: true,
    canRefactor: true,
  },
  [ROLES.AUDITOR]: {
    name: 'Auditor',
    phase: 4,
    responsibilities: [
      'architecture review',
      'invariant enforcement',
      'detect anti-patterns',
      'validate boundaries',
    ],
    outputs: ['audit_report'],
    canModifyFiles: false,
    canRunTests: true,
    canRefactor: false,
  },
};

export function isValidRole(role: string): boolean {
  return Object.values(ROLES).includes(role as AgentRole);
}

export function getRoleDefinition(role: string): RoleDef | null {
  return ROLE_DEFINITIONS[role] || null;
}

type RoleAction = 'modifyFiles' | 'runTests' | 'refactor';

export function isActionAllowed(role: string, action: RoleAction): boolean {
  const def = ROLE_DEFINITIONS[role];
  if (!def) return false;

  const actionMap: Record<RoleAction, boolean> = {
    modifyFiles: def.canModifyFiles,
    runTests: def.canRunTests,
    refactor: def.canRefactor,
  };

  return actionMap[action] === true;
}

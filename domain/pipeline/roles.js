// Agent role definitions for the multi-agent engineering pipeline
// No DOM, no Node.js APIs — pure data definitions.

/**
 * Agent roles in the engineering pipeline.
 * Each role has a defined responsibility boundary and constraints.
 */
export const ROLES = {
  ARCHITECT: 'architect',
  BUILDER: 'builder',
  TESTER: 'tester',
  OPTIMIZER: 'optimizer',
  AUDITOR: 'auditor',
};

/**
 * Role definitions with responsibilities and constraints.
 * Each role specifies what the agent may and may not do.
 */
export const ROLE_DEFINITIONS = {
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
    responsibilities: [
      'write code',
      'implement features',
      'follow architecture plan',
    ],
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
    responsibilities: [
      'refactor for clarity',
      'improve performance',
      'simplify code',
    ],
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

/**
 * Validate that a role is known.
 * @param {string} role
 * @returns {boolean}
 */
export function isValidRole(role) {
  return Object.values(ROLES).includes(role);
}

/**
 * Get the definition for a role.
 * @param {string} role
 * @returns {object|null}
 */
export function getRoleDefinition(role) {
  return ROLE_DEFINITIONS[role] || null;
}

/**
 * Check whether a role is allowed to perform an action.
 * @param {string} role
 * @param {'modifyFiles'|'runTests'|'refactor'} action
 * @returns {boolean}
 */
export function isActionAllowed(role, action) {
  const def = ROLE_DEFINITIONS[role];
  if (!def) return false;

  const actionMap = {
    modifyFiles: def.canModifyFiles,
    runTests: def.canRunTests,
    refactor: def.canRefactor,
  };

  return actionMap[action] === true;
}

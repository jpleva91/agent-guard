import { describe, it, expect } from 'vitest';
import {
  ACTION_CLASS_DATA,
  ACTION_TYPES_DATA,
  DECISION_DATA,
  TOOL_ACTION_MAP_DATA,
  getDestructivePatterns,
  DESTRUCTIVE_PATTERNS_DATA,
  getGitActionPatterns,
  GIT_ACTION_PATTERNS_DATA,
  BLAST_RADIUS_DEFAULT_WEIGHTS,
  BLAST_RADIUS_SENSITIVE_PATTERNS,
  BLAST_RADIUS_CONFIG_PATTERNS,
  BLAST_RADIUS_RISK_THRESHOLDS,
  ESCALATION_LEVELS,
  ESCALATION_DEFAULTS,
  INVARIANT_SENSITIVE_FILE_PATTERNS,
  INVARIANT_CREDENTIAL_PATH_PATTERNS,
  INVARIANT_CREDENTIAL_BASENAME_PATTERNS,
  INVARIANT_CONTAINER_CONFIG_BASENAMES,
  INVARIANT_LIFECYCLE_SCRIPTS,
  INVARIANT_ENV_FILE_REGEX_SOURCE,
  INVARIANT_DOCKERFILE_SUFFIX_REGEX_SOURCE,
  INVARIANT_IDE_CONTEXT_ENV_VARS,
  INVARIANT_IDE_SOCKET_PATH_PATTERNS,
  INVARIANT_METADATA,
} from '../src/governance-data.js';

describe('governance-data loader', () => {
  describe('action data', () => {
    it('exports action classes as a non-empty object', () => {
      expect(typeof ACTION_CLASS_DATA).toBe('object');
      expect(Object.keys(ACTION_CLASS_DATA).length).toBeGreaterThan(0);
    });

    it('exports action types as a non-empty object with 23 types', () => {
      expect(typeof ACTION_TYPES_DATA).toBe('object');
      expect(Object.keys(ACTION_TYPES_DATA).length).toBeGreaterThanOrEqual(23);
    });

    it('exports decision constants', () => {
      expect(DECISION_DATA).toBeDefined();
      expect(typeof DECISION_DATA).toBe('object');
    });
  });

  describe('tool-action map', () => {
    it('exports a non-empty map of tool names to action types', () => {
      expect(typeof TOOL_ACTION_MAP_DATA).toBe('object');
      expect(Object.keys(TOOL_ACTION_MAP_DATA).length).toBeGreaterThan(0);
    });

    it('maps known tools to action types', () => {
      // Common Claude Code tools
      expect(TOOL_ACTION_MAP_DATA['Write']).toBeDefined();
      expect(TOOL_ACTION_MAP_DATA['Read']).toBeDefined();
      expect(TOOL_ACTION_MAP_DATA['Bash']).toBeDefined();
    });
  });

  describe('destructive patterns', () => {
    it('exports raw pattern data as array', () => {
      expect(Array.isArray(DESTRUCTIVE_PATTERNS_DATA)).toBe(true);
      expect(DESTRUCTIVE_PATTERNS_DATA.length).toBeGreaterThan(0);
    });

    it('each pattern has required fields', () => {
      for (const p of DESTRUCTIVE_PATTERNS_DATA) {
        expect(typeof p.pattern).toBe('string');
        expect(typeof p.description).toBe('string');
        expect(['high', 'critical']).toContain(p.riskLevel);
        expect(typeof p.category).toBe('string');
      }
    });

    it('getDestructivePatterns compiles regex patterns', () => {
      const compiled = getDestructivePatterns();
      expect(compiled.length).toBe(DESTRUCTIVE_PATTERNS_DATA.length);
      for (const p of compiled) {
        expect(p.pattern).toBeInstanceOf(RegExp);
      }
    });
  });

  describe('git action patterns', () => {
    it('exports raw pattern data', () => {
      expect(Array.isArray(GIT_ACTION_PATTERNS_DATA)).toBe(true);
      expect(GIT_ACTION_PATTERNS_DATA.length).toBeGreaterThan(0);
    });

    it('getGitActionPatterns compiles regex patterns', () => {
      const compiled = getGitActionPatterns();
      expect(compiled.length).toBe(GIT_ACTION_PATTERNS_DATA.length);
      for (const p of compiled) {
        expect(Array.isArray(p.patterns)).toBe(true);
        for (const re of p.patterns) {
          expect(re).toBeInstanceOf(RegExp);
        }
        expect(typeof p.actionType).toBe('string');
      }
    });
  });

  describe('blast radius data', () => {
    it('exports default weights', () => {
      expect(typeof BLAST_RADIUS_DEFAULT_WEIGHTS).toBe('object');
    });

    it('exports sensitive patterns as array of strings', () => {
      expect(Array.isArray(BLAST_RADIUS_SENSITIVE_PATTERNS)).toBe(true);
      for (const p of BLAST_RADIUS_SENSITIVE_PATTERNS) {
        expect(typeof p).toBe('string');
      }
    });

    it('exports config patterns as array of strings', () => {
      expect(Array.isArray(BLAST_RADIUS_CONFIG_PATTERNS)).toBe(true);
    });

    it('exports risk thresholds', () => {
      expect(typeof BLAST_RADIUS_RISK_THRESHOLDS).toBe('object');
    });
  });

  describe('escalation data', () => {
    it('exports escalation levels as object', () => {
      expect(typeof ESCALATION_LEVELS).toBe('object');
      expect(Object.keys(ESCALATION_LEVELS).length).toBeGreaterThan(0);
    });

    it('exports escalation defaults', () => {
      expect(typeof ESCALATION_DEFAULTS).toBe('object');
    });
  });

  describe('invariant patterns', () => {
    it('exports sensitive file patterns', () => {
      expect(Array.isArray(INVARIANT_SENSITIVE_FILE_PATTERNS)).toBe(true);
      expect(INVARIANT_SENSITIVE_FILE_PATTERNS.length).toBeGreaterThan(0);
    });

    it('exports credential path patterns', () => {
      expect(Array.isArray(INVARIANT_CREDENTIAL_PATH_PATTERNS)).toBe(true);
    });

    it('exports credential basename patterns', () => {
      expect(Array.isArray(INVARIANT_CREDENTIAL_BASENAME_PATTERNS)).toBe(true);
    });

    it('exports container config basenames', () => {
      expect(Array.isArray(INVARIANT_CONTAINER_CONFIG_BASENAMES)).toBe(true);
      expect(INVARIANT_CONTAINER_CONFIG_BASENAMES).toContain('dockerfile');
    });

    it('exports lifecycle scripts', () => {
      expect(Array.isArray(INVARIANT_LIFECYCLE_SCRIPTS)).toBe(true);
    });

    it('exports regex source strings that compile', () => {
      expect(() => new RegExp(INVARIANT_ENV_FILE_REGEX_SOURCE)).not.toThrow();
      expect(() => new RegExp(INVARIANT_DOCKERFILE_SUFFIX_REGEX_SOURCE)).not.toThrow();
    });

    it('exports IDE socket env vars', () => {
      expect(Array.isArray(INVARIANT_IDE_CONTEXT_ENV_VARS)).toBe(true);
      expect(INVARIANT_IDE_CONTEXT_ENV_VARS.length).toBeGreaterThan(0);
      expect(INVARIANT_IDE_CONTEXT_ENV_VARS).toContain('VSCODE_IPC_HOOK');
    });

    it('exports IDE socket path patterns', () => {
      expect(Array.isArray(INVARIANT_IDE_SOCKET_PATH_PATTERNS)).toBe(true);
      expect(INVARIANT_IDE_SOCKET_PATH_PATTERNS.length).toBeGreaterThan(0);
      expect(INVARIANT_IDE_SOCKET_PATH_PATTERNS).toContain('vscode-ipc-');
    });

    it('exports invariant metadata for all invariants', () => {
      expect(Array.isArray(INVARIANT_METADATA)).toBe(true);
      expect(INVARIANT_METADATA.length).toBeGreaterThanOrEqual(22);
      for (const inv of INVARIANT_METADATA) {
        expect(typeof inv.id).toBe('string');
        expect(typeof inv.name).toBe('string');
        expect(typeof inv.description).toBe('string');
        expect(typeof inv.severity).toBe('number');
      }
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  validateSwarmManifest,
  validateSquadManifest,
  validateSwarmConfig,
  SWARM_MANIFEST_SCHEMA,
} from '../src/schema.js';
import { loadManifest } from '../src/manifest.js';

describe('SWARM_MANIFEST_SCHEMA', () => {
  it('has a JSON Schema $schema field', () => {
    expect(SWARM_MANIFEST_SCHEMA.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
  });

  it('has title and description', () => {
    expect(SWARM_MANIFEST_SCHEMA.title).toBeDefined();
    expect(SWARM_MANIFEST_SCHEMA.description).toBeDefined();
  });
});

describe('validateSwarmManifest', () => {
  it('validates the embedded manifest.json', () => {
    const manifest = loadManifest();
    const result = validateSwarmManifest(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects an empty object', () => {
    const result = validateSwarmManifest({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes('Required'))).toBe(true);
  });

  it('rejects manifest with invalid version format', () => {
    const result = validateSwarmManifest({ version: 'bad', agents: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === '$.version')).toBe(true);
  });

  it('rejects manifest with empty agents array', () => {
    const result = validateSwarmManifest({ version: '1.0.0', agents: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === '$.agents')).toBe(true);
  });

  it('rejects agent with invalid tier', () => {
    const result = validateSwarmManifest({
      version: '1.0.0',
      agents: [
        {
          id: 'test-agent',
          name: 'Test Agent',
          tier: 'invalid-tier',
          cron: '0 * * * *',
          skills: [],
          promptTemplate: 'test',
          description: 'test',
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('tier'))).toBe(true);
  });

  it('rejects agent with missing required fields', () => {
    const result = validateSwarmManifest({
      version: '1.0.0',
      agents: [{ id: 'test' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Required'))).toBe(true);
  });

  it('accepts a minimal valid manifest', () => {
    const result = validateSwarmManifest({
      version: '1.0.0',
      agents: [
        {
          id: 'test-agent',
          name: 'Test Agent',
          tier: 'core',
          cron: '0 * * * *',
          skills: ['test-skill'],
          promptTemplate: 'Run tests',
          description: 'Runs tests',
        },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it('rejects non-object input', () => {
    expect(validateSwarmManifest(null).valid).toBe(false);
    expect(validateSwarmManifest('string').valid).toBe(false);
    expect(validateSwarmManifest(42).valid).toBe(false);
  });
});

describe('validateSquadManifest', () => {
  it('accepts a valid squad manifest', () => {
    const agent = {
      id: 'kernel-em',
      rank: 'em',
      driver: 'claude-code',
      model: 'sonnet',
      cron: '10 */3 * * *',
      skills: ['sprint-management'],
    };
    const result = validateSquadManifest({
      version: '1.0.0',
      org: { director: { ...agent, id: 'director', rank: 'director' } },
      squads: {
        kernel: {
          name: 'Kernel',
          repo: 'agent-guard',
          em: agent,
          agents: { sr: { ...agent, id: 'kernel-sr', rank: 'senior' } },
        },
      },
      loopGuards: {
        maxOpenPRsPerSquad: 5,
        maxRetries: 3,
        maxBlastRadius: 20,
        maxRunMinutes: 15,
      },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects squad manifest missing loopGuards', () => {
    const result = validateSquadManifest({
      version: '1.0.0',
      org: { director: { id: 'd', rank: 'director', driver: 'claude-code', model: 'opus', cron: '0 7 * * *', skills: [] } },
      squads: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('loopGuards'))).toBe(true);
  });

  it('rejects invalid agent rank', () => {
    const result = validateSquadManifest({
      version: '1.0.0',
      org: {
        director: {
          id: 'd',
          rank: 'ceo',
          driver: 'claude-code',
          model: 'opus',
          cron: '0 7 * * *',
          skills: [],
        },
      },
      squads: {},
      loopGuards: { maxOpenPRsPerSquad: 5, maxRetries: 3, maxBlastRadius: 20, maxRunMinutes: 15 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('rank'))).toBe(true);
  });
});

describe('validateSwarmConfig', () => {
  it('accepts a valid swarm config', () => {
    const result = validateSwarmConfig({
      swarm: {
        tiers: ['core', 'governance'],
        schedules: {},
        paths: {
          policy: 'agentguard.yaml',
          roadmap: 'ROADMAP.md',
          swarmState: 'swarm-state.json',
          logs: 'logs/',
          reports: 'reports/',
          swarmLogs: 'swarm-logs/',
          cli: 'npx agentguard',
        },
        labels: { pending: 'pending' },
        thresholds: {
          maxOpenPRs: 10,
          prStaleHours: 48,
          blastRadiusHigh: 20,
        },
      },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects config with invalid tier', () => {
    const result = validateSwarmConfig({
      swarm: {
        tiers: ['invalid-tier'],
        schedules: {},
        paths: {
          policy: 'p',
          roadmap: 'r',
          swarmState: 's',
          logs: 'l',
          reports: 'r',
          swarmLogs: 's',
          cli: 'c',
        },
        labels: {},
        thresholds: { maxOpenPRs: 10, prStaleHours: 48, blastRadiusHigh: 20 },
      },
    });
    expect(result.valid).toBe(false);
  });

  it('rejects config missing required paths', () => {
    const result = validateSwarmConfig({
      swarm: {
        tiers: ['core'],
        schedules: {},
        paths: { policy: 'p' },
        labels: {},
        thresholds: { maxOpenPRs: 10, prStaleHours: 48, blastRadiusHigh: 20 },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Required'))).toBe(true);
  });

  it('rejects empty object', () => {
    const result = validateSwarmConfig({});
    expect(result.valid).toBe(false);
  });
});

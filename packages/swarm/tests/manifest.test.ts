import { describe, it, expect } from 'vitest';
import {
  loadManifest,
  filterAgentsByTier,
  resolveSchedule,
  collectSkills,
} from '../src/manifest.js';
import type { SwarmAgent, SwarmConfig } from '../src/types.js';

describe('loadManifest', () => {
  it('returns a manifest with version and agents', () => {
    const manifest = loadManifest();
    expect(manifest.version).toBeDefined();
    expect(Array.isArray(manifest.agents)).toBe(true);
    expect(manifest.agents.length).toBeGreaterThan(0);
  });

  it('each agent has required fields', () => {
    const manifest = loadManifest();
    for (const agent of manifest.agents) {
      expect(typeof agent.id).toBe('string');
      expect(typeof agent.name).toBe('string');
      expect(typeof agent.tier).toBe('string');
      expect(typeof agent.cron).toBe('string');
      expect(Array.isArray(agent.skills)).toBe(true);
      expect(typeof agent.promptTemplate).toBe('string');
      expect(typeof agent.description).toBe('string');
    }
  });
});

describe('filterAgentsByTier', () => {
  const agents: SwarmAgent[] = [
    {
      id: 'a1',
      name: 'Agent 1',
      tier: 'core',
      cron: '* * * * *',
      skills: [],
      promptTemplate: 'a1',
      description: 'desc',
    },
    {
      id: 'a2',
      name: 'Agent 2',
      tier: 'quality',
      cron: '* * * * *',
      skills: [],
      promptTemplate: 'a2',
      description: 'desc',
    },
    {
      id: 'a3',
      name: 'Agent 3',
      tier: 'ops',
      cron: '* * * * *',
      skills: [],
      promptTemplate: 'a3',
      description: 'desc',
    },
  ];

  it('filters agents by enabled tiers', () => {
    const result = filterAgentsByTier(agents, ['core']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });

  it('returns all agents when all tiers enabled', () => {
    const result = filterAgentsByTier(agents, ['core', 'quality', 'ops']);
    expect(result).toHaveLength(3);
  });

  it('returns empty when no tiers match', () => {
    const result = filterAgentsByTier(agents, ['governance']);
    expect(result).toHaveLength(0);
  });
});

describe('resolveSchedule', () => {
  const agent: SwarmAgent = {
    id: 'test-agent',
    name: 'Test',
    tier: 'core',
    cron: '0 */2 * * *',
    skills: [],
    promptTemplate: 'test',
    description: 'desc',
  };

  it('returns agent default cron when no override exists', () => {
    const config = {
      swarm: {
        tiers: ['core' as const],
        schedules: {},
        paths: {} as never,
        labels: {} as never,
        thresholds: {} as never,
      },
    };
    expect(resolveSchedule(agent, config)).toBe('0 */2 * * *');
  });

  it('returns overridden schedule when configured', () => {
    const config = {
      swarm: {
        tiers: ['core' as const],
        schedules: { 'test-agent': '0 8 * * *' },
        paths: {} as never,
        labels: {} as never,
        thresholds: {} as never,
      },
    };
    expect(resolveSchedule(agent, config)).toBe('0 8 * * *');
  });
});

describe('collectSkills', () => {
  it('collects unique skills from all agents', () => {
    const agents: SwarmAgent[] = [
      {
        id: 'a1',
        name: 'A1',
        tier: 'core',
        cron: '',
        skills: ['run-tests', 'create-pr'],
        promptTemplate: '',
        description: '',
      },
      {
        id: 'a2',
        name: 'A2',
        tier: 'core',
        cron: '',
        skills: ['run-tests', 'review-pr'],
        promptTemplate: '',
        description: '',
      },
    ];

    const skills = collectSkills(agents);
    expect(skills).toEqual(['create-pr', 'review-pr', 'run-tests']); // sorted
  });

  it('returns empty array for no agents', () => {
    expect(collectSkills([])).toEqual([]);
  });
});

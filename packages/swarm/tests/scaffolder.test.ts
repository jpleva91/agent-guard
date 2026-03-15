import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scaffold } from '../src/scaffolder.js';
import { loadManifest, filterAgentsByTier, collectSkills } from '../src/manifest.js';
import { loadDefaultConfig } from '../src/config.js';

describe('scaffolder', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'swarm-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should scaffold skills and config to project root', () => {
    const result = scaffold({ projectRoot: tmpDir });

    expect(result.skillsWritten).toBeGreaterThan(0);
    expect(result.configWritten).toBe(true);
    expect(result.agents.length).toBeGreaterThan(0);

    // Config file should exist
    expect(existsSync(join(tmpDir, 'agentguard-swarm.yaml'))).toBe(true);

    // Skills directory should exist with files
    expect(existsSync(join(tmpDir, '.claude', 'skills'))).toBe(true);
  });

  it('should not overwrite existing skills without force', () => {
    // Create an existing skill
    const skillsDir = join(tmpDir, '.claude', 'skills');
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(join(skillsDir, 'discover-next-issue.md'), 'custom content', 'utf8');

    const result = scaffold({ projectRoot: tmpDir });

    // Should skip the existing file
    expect(result.skillsSkipped).toBeGreaterThan(0);

    // Existing file should be unchanged
    const content = readFileSync(join(skillsDir, 'discover-next-issue.md'), 'utf8');
    expect(content).toBe('custom content');
  });

  it('should overwrite existing skills with force flag', () => {
    const skillsDir = join(tmpDir, '.claude', 'skills');
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(join(skillsDir, 'discover-next-issue.md'), 'custom content', 'utf8');

    scaffold({ projectRoot: tmpDir, force: true });

    const content = readFileSync(join(skillsDir, 'discover-next-issue.md'), 'utf8');
    expect(content).not.toBe('custom content');
  });

  it('should not recreate config if it already exists', () => {
    writeFileSync(join(tmpDir, 'agentguard-swarm.yaml'), 'existing', 'utf8');

    const result = scaffold({ projectRoot: tmpDir });

    expect(result.configWritten).toBe(false);
    const content = readFileSync(join(tmpDir, 'agentguard-swarm.yaml'), 'utf8');
    expect(content).toBe('existing');
  });

  it('should filter agents by tier', () => {
    const result = scaffold({ projectRoot: tmpDir, tiers: ['core'] });

    for (const agent of result.agents) {
      expect(agent.tier).toBe('core');
    }
    expect(result.agents.length).toBeGreaterThan(0);
    expect(result.agents.length).toBeLessThan(26); // Less than total
  });

  it('should render template variables in skills', () => {
    scaffold({ projectRoot: tmpDir });

    const skillsDir = join(tmpDir, '.claude', 'skills');
    const discoverSkill = readFileSync(join(skillsDir, 'discover-next-issue.md'), 'utf8');

    // Should have default values, not template tokens
    expect(discoverSkill).not.toContain('<%= paths.');
    expect(discoverSkill).not.toContain('<%= labels.');
  });

  it('should apply custom config values to templates', () => {
    // Write a custom config
    writeFileSync(
      join(tmpDir, 'agentguard-swarm.yaml'),
      `swarm:
  tiers:
    - core
  paths:
    policy: custom-policy.yaml
    roadmap: PLAN.md
    swarmState: .governance/state.json
    logs: governance/events.jsonl
    cli: npx agentguard
  labels:
    pending: 'todo'
    inProgress: 'doing'
    review: 'reviewing'
    blocked: 'stuck'
    critical: 'p0'
    high: 'p1'
    medium: 'p2'
    low: 'p3'
    developer: 'dev'
    architect: 'arch'
    auditor: 'audit'
`,
      'utf8'
    );

    scaffold({ projectRoot: tmpDir, force: true });

    const skillsDir = join(tmpDir, '.claude', 'skills');
    const files = require('node:fs').readdirSync(skillsDir) as string[];
    const mdFiles = files.filter((f: string) => f.endsWith('.md'));

    // Check that at least one skill contains the custom values
    let foundCustomPath = false;
    for (const file of mdFiles) {
      const content = readFileSync(join(skillsDir, file), 'utf8');
      if (content.includes('custom-policy.yaml')) {
        foundCustomPath = true;
        break;
      }
    }
    expect(foundCustomPath).toBe(true);
  });
});

describe('manifest', () => {
  it('should load the manifest', () => {
    const manifest = loadManifest();

    expect(manifest.version).toBe('1.0.0');
    expect(manifest.agents.length).toBeGreaterThan(0);
  });

  it('should filter agents by tier', () => {
    const manifest = loadManifest();
    const coreAgents = filterAgentsByTier(manifest.agents, ['core']);

    expect(coreAgents.length).toBeGreaterThan(0);
    for (const agent of coreAgents) {
      expect(agent.tier).toBe('core');
    }
  });

  it('should collect unique skills', () => {
    const manifest = loadManifest();
    const skills = collectSkills(manifest.agents);

    expect(skills.length).toBeGreaterThan(0);
    // Should be sorted
    const sorted = [...skills].sort();
    expect(skills).toEqual(sorted);
    // No duplicates
    expect(new Set(skills).size).toBe(skills.length);
  });
});

describe('config', () => {
  it('should load default config', () => {
    const config = loadDefaultConfig();

    expect(config.swarm).toBeDefined();
    expect(config.swarm.tiers).toContain('core');
    expect(config.swarm.paths.policy).toBe('agentguard.yaml');
    expect(config.swarm.labels.pending).toBe('status:pending');
  });
});

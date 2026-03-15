import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadDefaultConfig, loadConfig } from '../src/config.js';

describe('loadDefaultConfig', () => {
  it('returns a valid SwarmConfig with all required fields', () => {
    const config = loadDefaultConfig();

    expect(config.swarm).toBeDefined();
    expect(Array.isArray(config.swarm.tiers)).toBe(true);
    expect(config.swarm.tiers.length).toBeGreaterThan(0);
    expect(config.swarm.schedules).toBeDefined();
    expect(config.swarm.paths).toBeDefined();
    expect(config.swarm.labels).toBeDefined();
    expect(config.swarm.thresholds).toBeDefined();
  });

  it('includes all standard tiers', () => {
    const config = loadDefaultConfig();
    expect(config.swarm.tiers).toContain('core');
    expect(config.swarm.tiers).toContain('governance');
    expect(config.swarm.tiers).toContain('ops');
    expect(config.swarm.tiers).toContain('quality');
  });

  it('includes default paths', () => {
    const config = loadDefaultConfig();
    expect(config.swarm.paths.policy).toBe('agentguard.yaml');
    expect(config.swarm.paths.roadmap).toBe('ROADMAP.md');
  });

  it('includes default thresholds', () => {
    const config = loadDefaultConfig();
    expect(typeof config.swarm.thresholds.maxOpenPRs).toBe('number');
    expect(typeof config.swarm.thresholds.prStaleHours).toBe('number');
    expect(typeof config.swarm.thresholds.blastRadiusHigh).toBe('number');
  });
});

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'swarm-config-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns defaults when no config file exists', () => {
    const config = loadConfig(tmpDir);
    const defaults = loadDefaultConfig();
    expect(config).toEqual(defaults);
  });

  it('merges user config with defaults', () => {
    const userYaml = `
swarm:
  thresholds:
    maxOpenPRs: 10
`;
    writeFileSync(join(tmpDir, 'agentguard-swarm.yaml'), userYaml);
    const config = loadConfig(tmpDir);

    expect(config.swarm.thresholds.maxOpenPRs).toBe(10);
    // Other defaults should be preserved
    expect(config.swarm.paths.policy).toBe('agentguard.yaml');
  });

  it('allows overriding schedules', () => {
    const userYaml = `
swarm:
  schedules:
    coder-agent: '0 8 * * *'
`;
    writeFileSync(join(tmpDir, 'agentguard-swarm.yaml'), userYaml);
    const config = loadConfig(tmpDir);

    expect(config.swarm.schedules['coder-agent']).toBe('0 8 * * *');
  });

  it('allows overriding tiers', () => {
    const userYaml = `
swarm:
  tiers:
    - core
    - quality
`;
    writeFileSync(join(tmpDir, 'agentguard-swarm.yaml'), userYaml);
    const config = loadConfig(tmpDir);

    expect(config.swarm.tiers).toEqual(['core', 'quality']);
  });
});

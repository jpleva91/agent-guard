import { describe, it, expect } from 'vitest';
import { loadSquadManifest } from '../src/squad-manifest.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('loadSquadManifest', () => {
  it('loads the default manifest', () => {
    const yaml = readFileSync(
      join(__dirname, '..', 'templates', 'config', 'squad-manifest.default.yaml'),
      'utf8',
    );
    const manifest = loadSquadManifest(yaml);
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.org.director.rank).toBe('director');
    expect(manifest.org.director.driver).toBe('claude-code');
  });

  it('parses all 3 squads', () => {
    const yaml = readFileSync(
      join(__dirname, '..', 'templates', 'config', 'squad-manifest.default.yaml'),
      'utf8',
    );
    const manifest = loadSquadManifest(yaml);
    expect(Object.keys(manifest.squads)).toEqual(['kernel', 'cloud', 'qa', 'studio']);
  });

  it('each squad has em + 5 agents', () => {
    const yaml = readFileSync(
      join(__dirname, '..', 'templates', 'config', 'squad-manifest.default.yaml'),
      'utf8',
    );
    const manifest = loadSquadManifest(yaml);
    for (const [name, squad] of Object.entries(manifest.squads)) {
      expect(squad.em.rank).toBe('em');
      expect(Object.keys(squad.agents)).toHaveLength(5);
    }
  });

  it('builds agent identity strings', () => {
    const yaml = readFileSync(
      join(__dirname, '..', 'templates', 'config', 'squad-manifest.default.yaml'),
      'utf8',
    );
    const manifest = loadSquadManifest(yaml);
    const sr = manifest.squads.kernel.agents.senior;
    const identity = `${sr.driver}:${sr.model}:kernel:${sr.rank}`;
    expect(identity).toBe('copilot-cli:sonnet:kernel:senior');
  });

  it('parses loop guard config', () => {
    const yaml = readFileSync(
      join(__dirname, '..', 'templates', 'config', 'squad-manifest.default.yaml'),
      'utf8',
    );
    const manifest = loadSquadManifest(yaml);
    expect(manifest.loopGuards.maxOpenPRsPerSquad).toBe(3);
    expect(manifest.loopGuards.maxRetries).toBe(3);
    expect(manifest.loopGuards.maxBlastRadius).toBe(20);
    expect(manifest.loopGuards.maxRunMinutes).toBe(10);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveConfig } from '../src/config.js';

describe('persona config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('reads persona from AGENTGUARD_PERSONA_* env vars', () => {
    process.env.AGENTGUARD_PERSONA_DRIVER = 'human';
    process.env.AGENTGUARD_PERSONA_MODEL = 'opus';
    process.env.AGENTGUARD_PERSONA_ROLE = 'developer';
    process.env.AGENTGUARD_PERSONA_PROJECT = 'my-app';

    const config = resolveConfig();
    expect(config.persona).toBeDefined();
    expect(config.persona!.driver).toBe('human');
    expect(config.persona!.model).toBe('opus');
    expect(config.persona!.role).toBe('developer');
    expect(config.persona!.project).toBe('my-app');
  });

  it('returns undefined persona when no env vars set', () => {
    delete process.env.AGENTGUARD_PERSONA_DRIVER;
    const config = resolveConfig();
    expect(config.persona).toBeUndefined();
  });

  it('builds composite agentId from persona', () => {
    process.env.AGENTGUARD_PERSONA_DRIVER = 'copilot';
    process.env.AGENTGUARD_PERSONA_MODEL = 'gpt-4o';
    process.env.AGENTGUARD_PERSONA_ROLE = 'security';

    const config = resolveConfig();
    expect(config.persona!.compositeId).toBe('copilot:gpt-4o:security');
  });
});

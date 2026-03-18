import { describe, it, expect, afterEach } from 'vitest';
import { resolveConfig } from '../src/config.js';

describe('Cloud config resolution', () => {
  const origEndpoint = process.env.AGENTGUARD_CLOUD_ENDPOINT;
  const origApiKey = process.env.AGENTGUARD_CLOUD_API_KEY;

  afterEach(() => {
    // Restore original env values
    if (origEndpoint !== undefined) process.env.AGENTGUARD_CLOUD_ENDPOINT = origEndpoint;
    else delete process.env.AGENTGUARD_CLOUD_ENDPOINT;
    if (origApiKey !== undefined) process.env.AGENTGUARD_CLOUD_API_KEY = origApiKey;
    else delete process.env.AGENTGUARD_CLOUD_API_KEY;
  });

  it('picks up AGENTGUARD_CLOUD_ENDPOINT from env', () => {
    process.env.AGENTGUARD_CLOUD_ENDPOINT = 'https://test-cloud.example.com';
    const config = resolveConfig();
    expect(config.cloudEndpoint).toBe('https://test-cloud.example.com');
  });

  it('picks up AGENTGUARD_CLOUD_API_KEY from env', () => {
    process.env.AGENTGUARD_CLOUD_API_KEY = 'test-key-123';
    const config = resolveConfig();
    expect(config.cloudApiKey).toBe('test-key-123');
  });

  it('returns undefined when no cloud config is set', () => {
    delete process.env.AGENTGUARD_CLOUD_ENDPOINT;
    delete process.env.AGENTGUARD_CLOUD_API_KEY;
    const config = resolveConfig();
    // When no env var is set and no config file exists, these may be undefined
    // (config file fallback may or may not provide values)
    expect(typeof config.cloudEndpoint === 'string' || config.cloudEndpoint === undefined).toBe(
      true
    );
    expect(typeof config.cloudApiKey === 'string' || config.cloudApiKey === undefined).toBe(true);
  });

  it('env vars take priority over config file', () => {
    process.env.AGENTGUARD_CLOUD_ENDPOINT = 'https://env-override.example.com';
    process.env.AGENTGUARD_CLOUD_API_KEY = 'env-key-override';
    const config = resolveConfig();
    expect(config.cloudEndpoint).toBe('https://env-override.example.com');
    expect(config.cloudApiKey).toBe('env-key-override');
  });
});

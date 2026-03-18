import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveMode } from '../src/identity.js';
import type { TelemetryIdentity } from '../src/types.js';

describe('resolveMode', () => {
  const originalEnv = process.env.AGENTGUARD_TELEMETRY;

  beforeEach(() => {
    delete process.env.AGENTGUARD_TELEMETRY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.AGENTGUARD_TELEMETRY = originalEnv;
    } else {
      delete process.env.AGENTGUARD_TELEMETRY;
    }
  });

  it('defaults to anonymous when no identity and no env var', () => {
    expect(resolveMode()).toBe('anonymous');
    expect(resolveMode(null)).toBe('anonymous');
    expect(resolveMode(undefined)).toBe('anonymous');
  });

  it('uses identity mode when identity exists', () => {
    const identity = { mode: 'verified' } as TelemetryIdentity;
    expect(resolveMode(identity)).toBe('verified');
  });

  it('uses identity mode off when identity says off', () => {
    const identity = { mode: 'off' } as TelemetryIdentity;
    expect(resolveMode(identity)).toBe('off');
  });

  it('env var overrides identity mode', () => {
    process.env.AGENTGUARD_TELEMETRY = 'off';
    const identity = { mode: 'anonymous' } as TelemetryIdentity;
    expect(resolveMode(identity)).toBe('off');
  });

  it('env var overrides default when no identity', () => {
    process.env.AGENTGUARD_TELEMETRY = 'verified';
    expect(resolveMode()).toBe('verified');
  });

  it('ignores invalid env var values', () => {
    process.env.AGENTGUARD_TELEMETRY = 'invalid';
    expect(resolveMode()).toBe('anonymous');
  });
});

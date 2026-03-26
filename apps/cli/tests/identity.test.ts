import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectDriver, detectModel, detectProject } from '../src/identity.js';

describe('detectDriver', () => {
  const originalEnv = process.env;
  beforeEach(() => { process.env = { ...originalEnv }; });
  afterEach(() => { process.env = originalEnv; });

  it('returns ci when GITHUB_ACTIONS is true', () => {
    process.env.GITHUB_ACTIONS = 'true';
    expect(detectDriver()).toBe('ci');
  });

  it('returns copilot when COPILOT_AGENT is set', () => {
    delete process.env.GITHUB_ACTIONS;
    process.env.COPILOT_AGENT = '1';
    expect(detectDriver()).toBe('copilot');
  });

  it('returns claude-code when CLAUDE_MODEL is set', () => {
    delete process.env.GITHUB_ACTIONS;
    delete process.env.COPILOT_AGENT;
    delete process.env.OPENCODE_HOME;
    process.env.CLAUDE_MODEL = 'claude-opus-4-6';
    expect(detectDriver()).toBe('claude-code');
  });

  it('returns opencode when OPENCODE_HOME is set', () => {
    delete process.env.GITHUB_ACTIONS;
    delete process.env.COPILOT_AGENT;
    delete process.env.CLAUDE_MODEL;
    process.env.OPENCODE_HOME = '/home/user/.opencode';
    expect(detectDriver()).toBe('opencode');
  });

  it('returns human as fallback', () => {
    delete process.env.GITHUB_ACTIONS;
    delete process.env.COPILOT_AGENT;
    delete process.env.OPENCODE_HOME;
    delete process.env.CLAUDE_MODEL;
    expect(detectDriver()).toBe('human');
  });

  it('respects priority: GITHUB_ACTIONS over CLAUDE_MODEL', () => {
    process.env.GITHUB_ACTIONS = 'true';
    process.env.CLAUDE_MODEL = 'claude-opus-4-6';
    expect(detectDriver()).toBe('ci');
  });
});

describe('detectModel', () => {
  const originalEnv = process.env;
  beforeEach(() => { process.env = { ...originalEnv }; });
  afterEach(() => { process.env = originalEnv; });

  it('simplifies opus model name', () => {
    process.env.CLAUDE_MODEL = 'claude-opus-4-6';
    expect(detectModel()).toBe('opus');
  });

  it('simplifies sonnet model name', () => {
    process.env.CLAUDE_MODEL = 'claude-sonnet-4-6';
    expect(detectModel()).toBe('sonnet');
  });

  it('returns unknown when no model set', () => {
    delete process.env.CLAUDE_MODEL;
    expect(detectModel()).toBe('unknown');
  });
});

describe('detectProject', () => {
  it('returns a non-empty string', () => {
    const result = detectProject();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

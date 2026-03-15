import { describe, it, expect } from 'vitest';
import { resolvePersona, personaFromEnv } from '../src/persona.js';
import type { AgentPersona } from '../src/types.js';

describe('resolvePersona', () => {
  it('returns empty persona when no sources provided', () => {
    const result = resolvePersona();
    expect(result.trustTier).toBeUndefined();
    expect(result.role).toBeUndefined();
    expect(result.modelMeta).toBeUndefined();
  });

  it('uses policy defaults when only policy persona provided', () => {
    const policy: Partial<AgentPersona> = {
      trustTier: 'standard',
      role: 'developer',
      modelMeta: { model: 'claude-sonnet-4-6', provider: 'anthropic' },
    };
    const result = resolvePersona(policy);
    expect(result.trustTier).toBe('standard');
    expect(result.role).toBe('developer');
    expect(result.modelMeta?.model).toBe('claude-sonnet-4-6');
  });

  it('env overrides policy defaults', () => {
    const policy: Partial<AgentPersona> = { trustTier: 'standard', role: 'developer' };
    const env: Partial<AgentPersona> = { trustTier: 'elevated' };
    const result = resolvePersona(policy, env);
    expect(result.trustTier).toBe('elevated');
    expect(result.role).toBe('developer'); // Falls through from policy
  });

  it('action overrides env and policy', () => {
    const policy: Partial<AgentPersona> = { trustTier: 'standard' };
    const env: Partial<AgentPersona> = { trustTier: 'elevated' };
    const action: Partial<AgentPersona> = { trustTier: 'admin' };
    const result = resolvePersona(policy, env, action);
    expect(result.trustTier).toBe('admin');
  });

  it('merges tags from all sources', () => {
    const policy: Partial<AgentPersona> = { tags: ['team-a'] };
    const env: Partial<AgentPersona> = { tags: ['fast'] };
    const action: Partial<AgentPersona> = { tags: ['urgent'] };
    const result = resolvePersona(policy, env, action);
    expect(result.tags).toContain('team-a');
    expect(result.tags).toContain('fast');
    expect(result.tags).toContain('urgent');
  });

  it('deduplicates tags', () => {
    const a: Partial<AgentPersona> = { tags: ['x'] };
    const b: Partial<AgentPersona> = { tags: ['x'] };
    const result = resolvePersona(a, b);
    expect(result.tags).toEqual(['x']);
  });

  it('merges model meta across sources', () => {
    const policy: Partial<AgentPersona> = {
      modelMeta: { model: 'claude-sonnet-4-6', provider: 'anthropic' },
    };
    const env: Partial<AgentPersona> = {
      modelMeta: { runtime: 'claude-code' },
    };
    const result = resolvePersona(policy, env);
    expect(result.modelMeta?.model).toBe('claude-sonnet-4-6');
    expect(result.modelMeta?.provider).toBe('anthropic');
    expect(result.modelMeta?.runtime).toBe('claude-code');
  });
});

describe('personaFromEnv', () => {
  it('returns undefined when no env vars set', () => {
    expect(personaFromEnv({})).toBeUndefined();
  });

  it('reads model metadata from env', () => {
    const result = personaFromEnv({
      AGENTGUARD_PERSONA_MODEL: 'claude-sonnet-4-6',
      AGENTGUARD_PERSONA_PROVIDER: 'anthropic',
    });
    expect(result).toBeDefined();
    expect(result!.modelMeta?.model).toBe('claude-sonnet-4-6');
    expect(result!.modelMeta?.provider).toBe('anthropic');
  });

  it('reads behavioral traits from env', () => {
    const result = personaFromEnv({
      AGENTGUARD_PERSONA_TRUST_TIER: 'elevated',
      AGENTGUARD_PERSONA_ROLE: 'ops',
      AGENTGUARD_PERSONA_AUTONOMY: 'autonomous',
      AGENTGUARD_PERSONA_RISK_TOLERANCE: 'conservative',
    });
    expect(result).toBeDefined();
    expect(result!.trustTier).toBe('elevated');
    expect(result!.role).toBe('ops');
    expect(result!.autonomy).toBe('autonomous');
    expect(result!.riskTolerance).toBe('conservative');
  });

  it('reads comma-separated tags', () => {
    const result = personaFromEnv({
      AGENTGUARD_PERSONA_TAGS: 'team-a,fast,nightly',
    });
    expect(result).toBeDefined();
    expect(result!.tags).toEqual(['team-a', 'fast', 'nightly']);
  });

  it('ignores invalid trust tier values', () => {
    const result = personaFromEnv({
      AGENTGUARD_PERSONA_TRUST_TIER: 'invalid-tier',
    });
    expect(result).toBeUndefined();
  });

  it('ignores invalid role values', () => {
    const result = personaFromEnv({
      AGENTGUARD_PERSONA_ROLE: 'chef',
    });
    expect(result).toBeUndefined();
  });
});

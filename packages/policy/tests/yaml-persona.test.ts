import { describe, it, expect } from 'vitest';
import { parseYamlPolicy, loadYamlPolicy, yamlPersonaToAgentPersona } from '../src/yaml-loader.js';

describe('YAML loader — persona parsing', () => {
  it('parses top-level persona section', () => {
    const yaml = `
id: test-policy
name: Test
persona:
  trustTier: standard
  role: developer
  model: claude-sonnet-4-6
  provider: anthropic
rules:
  - action: git.push
    effect: deny
`;
    const def = parseYamlPolicy(yaml);
    expect(def.persona).toBeDefined();
    expect(def.persona!.trustTier).toBe('standard');
    expect(def.persona!.role).toBe('developer');
    expect(def.persona!.model).toBe('claude-sonnet-4-6');
    expect(def.persona!.provider).toBe('anthropic');
  });

  it('parses per-rule persona conditions with inline arrays', () => {
    const yaml = `
rules:
  - action: git.push
    effect: deny
    persona:
      trustTier: [untrusted, limited]
      role: [ci]
    reason: Low-trust or CI agents cannot push
`;
    const def = parseYamlPolicy(yaml);
    expect(def.rules).toHaveLength(1);
    expect(def.rules![0].persona).toBeDefined();
    expect(def.rules![0].persona!.trustTier).toEqual(['untrusted', 'limited']);
    expect(def.rules![0].persona!.role).toEqual(['ci']);
  });

  it('parses per-rule persona with single values', () => {
    const yaml = `
rules:
  - action: shell.exec
    effect: deny
    persona:
      trustTier: untrusted
    reason: Untrusted agents cannot exec
`;
    const def = parseYamlPolicy(yaml);
    expect(def.rules![0].persona!.trustTier).toEqual(['untrusted']);
  });

  it('converts persona conditions in loaded policy rules', () => {
    const yaml = `
rules:
  - action: git.push
    effect: deny
    persona:
      trustTier: [untrusted]
    reason: Denied
`;
    const policy = loadYamlPolicy(yaml);
    expect(policy.rules).toHaveLength(1);
    expect(policy.rules[0].conditions?.persona).toBeDefined();
    expect(policy.rules[0].conditions!.persona!.trustTier).toEqual(['untrusted']);
  });

  it('converts top-level persona to AgentPersona', () => {
    const def = {
      model: 'claude-opus-4-6',
      provider: 'anthropic',
      runtime: 'claude-code',
      trustTier: 'elevated',
      role: 'security',
      tags: ['audit', 'production'],
    };
    const persona = yamlPersonaToAgentPersona(def);
    expect(persona.modelMeta?.model).toBe('claude-opus-4-6');
    expect(persona.modelMeta?.provider).toBe('anthropic');
    expect(persona.modelMeta?.runtime).toBe('claude-code');
    expect(persona.trustTier).toBe('elevated');
    expect(persona.role).toBe('security');
    expect(persona.tags).toEqual(['audit', 'production']);
  });

  it('parses persona with tags', () => {
    const yaml = `
rules:
  - action: '*'
    effect: deny
    persona:
      tags: [nightly, canary]
    reason: Special agents restricted
`;
    const def = parseYamlPolicy(yaml);
    expect(def.rules![0].persona!.tags).toEqual(['nightly', 'canary']);
  });
});

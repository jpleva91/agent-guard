# Feature Spec: Aegis Policy Adapter

> Integration plan for reading [Aegis spec](https://github.com/cleburn/aegis-spec) `.agentpolicy/` directories and translating them into native AgentGuard policies.

## Summary

AgentGuard already has deeper runtime enforcement (kernel pipeline, 21 invariants, escalation, blast radius, event model, SQLite audit). Aegis is an open governance specification (".editorconfig for AI agents") that introduces three concepts worth adopting:

1. **Per-domain autonomy levels** — Conservative/Advisory/Delegated scoped per domain (e.g., testing=delegated, deployment=conservative), vs AgentGuard's single global value
2. **Role-based file ownership** — Different agents get different file path permissions via role definitions
3. **`.agentpolicy/` as a portable standard** — Machine-readable project governance that any tool can consume

The adapter is a pure translation layer: reads Aegis files, outputs AgentGuard policy objects. No existing functionality is replaced.

## Requirements

- [ ] Discover and load `.agentpolicy/` directories containing `constitution.json`, `governance.json`, and `roles/*.json`
- [ ] Validate Aegis JSON files against expected schemas
- [ ] Convert Aegis governance rules into AgentGuard `LoadedPolicy` objects
- [ ] Convert Aegis file permissions (forbidden/read-only/writable) into deny/allow rules with scope conditions
- [ ] Convert Aegis quality gates into policy conditions (requireTests, requireFormat)
- [ ] Map Aegis per-domain autonomy levels to intervention selection overrides
- [ ] Map Aegis roles to AgentGuard personas with file scope ownership
- [ ] Auto-discover `.agentpolicy/` in the project root during policy resolution
- [ ] Add CLI commands: `agentguard aegis import`, `aegis validate`, `aegis diff`
- [ ] Add `--aegis-policy <dir>` flag to `agentguard guard`
- [ ] Preserve audit trail distinguishing Aegis-derived rules from native rules

## Events Produced

| Event Kind | When Emitted | Required Data |
|------------|-------------|---------------|
| `AutonomyOverrideApplied` | When domain autonomy modifies an intervention decision | `{ domain, originalIntervention, appliedIntervention, autonomyLevel, actionType }` |

## Events Consumed

| Event Kind | Reaction |
|------------|----------|
| `ActionRequested` | Domain autonomy check during intervention selection |

## Interface Contract

```typescript
// packages/aegis-adapter/src/types.ts
export interface AegisConstitution {
  project: string;
  techStack: string[];
  buildCommands: Record<string, string>;
  principles: string[];
}

export interface AegisGovernance {
  permissions: AegisFilePermission;
  autonomy: AegisDomainAutonomy;
  qualityGates: Record<string, string[]>;
  escalation: Record<string, string>;
  conventions: Record<string, string>;
}

export type AegisAutonomyLevel = 'conservative' | 'advisory' | 'delegated';
export type AegisDomainAutonomy = Record<string, AegisAutonomyLevel>;

export interface AegisFilePermission {
  writable: string[];
  readOnly: string[];
  forbidden: string[];
}

export interface AegisRole {
  name: string;
  scope: string[];
  autonomyOverrides?: AegisDomainAutonomy;
  ownership?: string[];
  collaborationProtocols?: Record<string, string>;
}

export interface AegisPolicyBundle {
  constitution: AegisConstitution;
  governance: AegisGovernance;
  roles: AegisRole[];
}

// packages/aegis-adapter/src/loader.ts
export function discoverAegisPolicy(rootDir: string): AegisPolicyBundle | null;

// packages/aegis-adapter/src/converter.ts
export function convertGovernanceToPolicy(
  governance: AegisGovernance,
  constitution: AegisConstitution
): LoadedPolicy;
export function convertRoleToPersona(role: AegisRole): AgentPersona;
export function convertRoleToPolicy(role: AegisRole): LoadedPolicy;

// packages/aegis-adapter/src/autonomy.ts
export function convertAutonomyDomains(governance: AegisGovernance): DomainAutonomyMap;

// packages/aegis-adapter/src/role-resolver.ts
export function resolveAgentRole(agentId: string, roles: AegisRole[]): AegisRole | null;
export function buildRolePersona(role: AegisRole, domainAutonomy: DomainAutonomyMap): AgentPersona;
export function buildRolePolicies(roles: AegisRole[]): LoadedPolicy[];
```

## Dependencies

| Module | Why Needed |
|--------|-----------|
| `@red-codes/core` | Shared types (`AgentPersona`, `DomainAutonomyMap`, action types) |
| `@red-codes/policy` | `LoadedPolicy`, `CompositionSource`, policy evaluator types |
| `@red-codes/events` | Event schema for `AutonomyOverrideApplied` |
| `@red-codes/kernel` | Decision engine extension for domain autonomy |

## Layer Placement

- [x] `packages/aegis-adapter/` — New workspace package (pure translation layer)
- [x] `packages/core/` — New types (`DomainAutonomyMap`, extended `AgentPersona`)
- [x] `packages/kernel/` — Modified intervention selection in `decision.ts`
- [x] `packages/events/` — New event kind
- [x] `packages/policy/` — Extended `PersonaCondition`, `CompositionSource`
- [x] `apps/cli/` — New `aegis` command, modified `guard` command, modified policy resolver

## Conversion Rules

| Aegis Concept | AgentGuard Equivalent |
|---|---|
| `permissions.forbidden` paths | `deny` rules for `file.*` with `scope` conditions |
| `permissions.readOnly` paths | `deny` rules for `file.write`, `file.delete` with `scope` conditions |
| `permissions.writable` paths | `allow` rules for `file.*` with `scope` conditions |
| Quality gates (`preCommit`) | `deny` on `git.commit` with `requireTests: true` |
| Escalation protocols | Mapped to `intervention` field (`conservative`→`pause`, etc.) |
| Domain autonomy levels | `DomainAutonomyMap` on persona, modifies intervention selection |
| Roles | `AgentPersona` with file scope ownership + persona-conditioned policies |

## Implementation Increments

### Increment 1: Loader + Converter (core value)

**New package**: `packages/aegis-adapter/` with `types.ts`, `loader.ts`, `converter.ts`, `index.ts`

**Modified files**:
- `apps/cli/src/policy-resolver.ts` — Add Aegis auto-discovery as project-layer policy source
- `packages/policy/src/composer.ts` — Add `sourceType` to `CompositionSource`

### Increment 2: Domain Autonomy Model

**New files**: `packages/aegis-adapter/src/autonomy.ts`

**Modified files**:
- `packages/core/src/types.ts` — Add `DomainAutonomyMap`, extend `AgentPersona`
- `packages/kernel/src/decision.ts` — Domain-aware intervention selection
- `packages/events/src/schema.ts` — Add `AutonomyOverrideApplied` event kind

### Increment 3: Role Mapping + CLI

**New files**: `packages/aegis-adapter/src/role-resolver.ts`, `apps/cli/src/commands/aegis.ts`

**Modified files**:
- `packages/policy/src/evaluator.ts` — Add `agentId` to `PersonaCondition`
- `apps/cli/src/bin.ts` — Register `aegis` command
- `apps/cli/src/commands/guard.ts` — Add `--aegis-policy` flag

## What NOT to Integrate

- **Aegis ledger** — AgentGuard's event bus + SQLite is superior to a shared JSON file with lock protocol
- **Aegis MCP server replacement** — AgentGuard's MCP server stays; add Aegis-compatible tools later
- **Aegis file operation proxying** — (`aegis_write_file` etc.) unnecessary since AgentGuard's kernel already intercepts all operations

## Verification

```bash
# Build
pnpm build

# Test
pnpm test
pnpm test --filter=@red-codes/aegis-adapter

# Lint
pnpm lint
pnpm format

# Manual verification
agentguard guard --dry-run  # with .agentpolicy/ in project root
agentguard aegis validate .agentpolicy/
```

## Open Questions

1. Should Aegis-derived policies have higher or lower precedence than native `agentguard.yaml` project policies when both exist?
2. Should the adapter support Aegis spec versioning (e.g., `"specVersion": "1.0"` field) for forward compatibility?
3. Should domain autonomy overrides be visible in the TUI renderer output?

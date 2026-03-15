# Capability Tokens — AgentGuard

This document describes the agent capability token system: a fine-grained authorization mechanism that limits what individual agents can do, with minting, validation, expiry, and revocation.

## Motivation

Currently, AgentGuard's policy system applies rules globally — any agent that triggers a tool call is evaluated against the same policy. There is no concept of agent-specific permissions. The `PluginCapability` type exists for plugins but is not used for agent actions.

Capability tokens solve this by giving each agent a scoped permission set. An agent can only perform actions that its token authorizes, even if the global policy would allow the action.

## Token Model

```
CapabilityToken {
  id: string                    // Unique token identifier
  agentId: string               // Agent this token is issued to
  capabilities: Capability[]    // List of granted capabilities
  issuedAt: number              // Unix timestamp
  expiresAt: number             // Unix timestamp (TTL)
  scope: string                 // Scope constraint (e.g., repo path, project)
  issuer: string                // Who/what issued this token
}
```

## Capability Types

Capabilities follow the pattern `<action-class>:<verb>:<scope>`:

### File Operations

| Capability | Grants |
|-----------|--------|
| `file:read:<glob>` | Read files matching the glob pattern |
| `file:write:<glob>` | Write files matching the glob pattern |
| `file:delete:<glob>` | Delete files matching the glob pattern |
| `file:read:*` | Read any file |
| `file:write:src/**` | Write only within `src/` |

### Git Operations

| Capability | Grants |
|-----------|--------|
| `git:commit` | Create commits |
| `git:push:<branch>` | Push to specific branch |
| `git:push:*` | Push to any branch |
| `git:branch:create` | Create branches |
| `git:branch:delete` | Delete branches |
| `git:merge` | Merge branches |

### Shell Operations

| Capability | Grants |
|-----------|--------|
| `shell:exec:<command-pattern>` | Execute commands matching pattern |
| `shell:exec:*` | Execute any command |
| `shell:exec:npm*` | Execute npm commands only |
| `shell:exec:git*` | Execute git commands via shell |

### Network Operations

| Capability | Grants |
|-----------|--------|
| `network:egress:<domain>` | HTTP requests to specific domain |
| `network:egress:*` | HTTP requests to any domain |
| `network:egress:*.github.com` | GitHub API access |

### Deployment & Admin

| Capability | Grants |
|-----------|--------|
| `deploy:trigger:<environment>` | Deploy to specific environment |
| `admin:escalation-reset` | Reset escalation level |
| `admin:policy-modify` | Modify active policy |

## Lifecycle

```
Mint → Use → (Expire | Revoke)

1. MINT: Issuer creates token with specific capabilities and TTL
2. USE:  Agent presents token on each action proposal
         Kernel validates: not expired, not revoked, capabilities match action
3. EXPIRE: Token becomes invalid after TTL
4. REVOKE: Token added to revocation list (immediate invalidation)
```

## Kernel Integration

Capability validation occurs **after** policy evaluation and **before** execution:

```
Action Proposed
  → AAB Normalization
    → Policy Evaluation (allow/deny)
      → Invariant Check
        → Capability Validation  ← NEW STEP
          → If all pass: Execute via adapter
          → If capability denied: DENY with CapabilityDenied event
```

**Design rationale:** Policy is the coarse-grained check (what's allowed in this environment). Capabilities are the fine-grained check (what's allowed for this agent). An action must pass both.

## Token Storage & Revocation

```
src/capabilities/
├── token.ts        # CapabilityToken type and validation logic
├── issuer.ts       # Mint tokens with specific capabilities and TTL
├── validator.ts    # Validate token at action time
└── revocation.ts   # Token revocation list (in-memory + persisted)
```

**Revocation list:** In-memory set of revoked token IDs, persisted to event store as `CapabilityRevoked` events. On startup, the revocation list is rebuilt from the event stream.

## New Event Kinds

| Event | Trigger |
|-------|---------|
| `CapabilityDenied` | Action denied because agent's token lacks required capability |
| `CapabilityGranted` | New capability token minted for an agent |
| `CapabilityRevoked` | Token added to revocation list |

## Example Usage

### Minting a token

```typescript
const token = issuer.mint({
  agentId: 'claude-code-session-abc123',
  capabilities: [
    'file:read:*',
    'file:write:src/**',
    'git:commit',
    'git:push:feature/*',
    'shell:exec:npm test',
    'shell:exec:npm run build',
  ],
  ttl: 3600, // 1 hour
  scope: '/path/to/repo',
  issuer: 'human:jplev',
});
```

### Policy + capability interaction

```
Policy says: allow file.write to src/**
Token says:  file:write:src/components/**

Agent writes src/components/Button.tsx → ALLOW (both pass)
Agent writes src/utils/helper.ts       → DENY (capability too narrow)
Agent writes dist/bundle.js            → DENY (policy denies, capability irrelevant)
```

## Key Files to Modify

| File | Change |
|------|--------|
| `src/kernel/kernel.ts` | Add capability check step after invariant evaluation |
| `src/events/schema.ts` | Add `CapabilityDenied`, `CapabilityGranted`, `CapabilityRevoked` events |
| `src/core/types.ts` | Add capability type definitions |

## Verification

- Token lifecycle test: mint → use → expire → attempt use → denied
- Token revocation test: mint → use → revoke → attempt use → denied
- Capability narrowing: global policy allows, token denies → action denied
- Capability alignment: global policy denies → action denied regardless of token
- Invalid/malformed tokens produce clear error events

## References

- [Agent Identity & Delegation](agent-identity-delegation.md)
- [Unified Architecture](unified-architecture.md)

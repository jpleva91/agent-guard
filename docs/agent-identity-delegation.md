# Agent Identity & Delegation Chains — AgentGuard

This document describes the agent identity model, delegation chain tracking, and human-in-the-loop approval workflows.

## Implementation Status

> **Shipped in v2.4.0:** Session-level agent identity is now implemented. The features below marked with **(Shipped)** are live. Features marked with **(Aspirational)** remain planned.
>
> **Shipped capabilities:**
> - Session identity prompt — agents are prompted for role + driver at session start if `--agent-name` is not set
> - `aguard guard --agent-name <name>` CLI flag for non-interactive identity declaration
> - MCP persona — identity is surfaced through the MCP governance server
> - Worktree enforcement — agents operating in git worktrees are correctly identified and isolated
> - Cloud telemetry attribution — identity flows to cloud dashboard for per-agent grouping and analytics
> - Supported roles: `developer`, `reviewer`, `ops`, `security`, `planner`
> - Supported drivers: `human`, `claude-code`, `copilot`, `ci`
>
> **Still aspirational:** Full agent registry with lifecycle management, delegation chains with capability narrowing, capability tokens, cross-session identity persistence, and human-in-the-loop approval gates via external channels (Slack, webhook, email).

## Motivation

~~AgentGuard events include an `agentId` field, but there is no first-class identity system. All agents are anonymous — the kernel cannot distinguish between a trusted production agent and an untrusted test agent.~~ **(Partially addressed in v2.4.0 — session identity now distinguishes agents by role and driver.)** There is no tracking of delegation (human → agent → sub-agent) and no mechanism for human approval of high-risk actions beyond the PAUSE intervention type.

## Agent Identity Model

### Session Identity (Shipped)

The current implementation uses a lightweight session identity model. At session start, the agent declares:
- **Role**: one of `developer`, `reviewer`, `ops`, `security`, `planner`
- **Driver**: one of `human`, `claude-code`, `copilot`, `ci`

This identity is set via `aguard guard --agent-name <name>` or collected through an interactive prompt (auto-detecting wizard). Identity is attached to all governance events and telemetry payloads for the session.

### AgentIdentity (Aspirational)

```
AgentIdentity {
  id: string              // Unique agent identifier
  name: string            // Human-readable name
  type: string            // Agent type (e.g., "claude-code", "langchain", "autogen")
  owner: string           // Human or organization that owns this agent
  parentAgentId?: string  // If this agent was spawned by another agent
  createdAt: number       // Registration timestamp
  capabilities: string[]  // Granted capability tokens
  trust_level: string     // UNTRUSTED | BASIC | ELEVATED | TRUSTED
}
```

### Trust Levels (Aspirational)

| Level | Grants | Use Case |
|-------|--------|----------|
| UNTRUSTED | Read-only, no execution | New/unknown agents, testing |
| BASIC | File read/write within scope, test execution | Standard development agents |
| ELEVATED | Git operations, limited shell execution | Trusted CI/CD agents |
| TRUSTED | Full access per policy | Production agents with established history |

### Agent Registry (Aspirational)

```
AgentRegistry {
  register(identity: AgentIdentity): string    // Returns agent ID
  get(id: string): AgentIdentity | undefined
  update(id: string, changes: Partial<AgentIdentity>): void
  deactivate(id: string): void                 // Soft-delete, preserves history
  search(criteria: AgentSearchCriteria): AgentIdentity[]
  listActive(): AgentIdentity[]
}
```

### Agent Lifecycle (Aspirational)

```
Register → Active → (Suspended | Deactivated)
                ↑        │
                └────────┘ (reactivate)
```

| State | Description |
|-------|-------------|
| Active | Agent can propose actions, capabilities are valid |
| Suspended | Agent's actions are auto-denied, capabilities frozen |
| Deactivated | Agent removed from active registry, history preserved |

## Delegation Chains (Aspirational)

### Model

```
DelegationChain {
  rootHuman: string                 // Human who initiated the chain
  agents: DelegationLink[]          // Ordered list of delegation steps
  createdAt: number
}

DelegationLink {
  fromAgent: string                 // Delegating agent (or human) ID
  toAgent: string                   // Receiving agent ID
  delegatedCapabilities: string[]   // Capabilities granted to receiving agent
  constraints: DelegationConstraint // Additional restrictions
  timestamp: number
}

DelegationConstraint {
  maxDepth?: number      // Maximum further delegation depth
  expiresAt?: number     // Delegation expiry
  scopeRestriction?: string  // Path/branch restriction
}
```

### Capability Narrowing Rule

**A sub-agent cannot exceed its parent's capabilities.** Each delegation step can only narrow (never widen) the capability set:

```
Human (full access)
  └── Agent A (file:*, git:commit, git:push:feature/*)
        └── Agent B (file:read:*, file:write:src/**, git:commit)
              └── Agent C (file:read:src/**)  // Most restricted
```

If Agent A delegates to Agent B:
- Agent B can receive `file:read:*` (subset of Agent A's `file:*`)
- Agent B **cannot** receive `git:push:main` (Agent A doesn't have it)
- Agent B **cannot** receive `shell:exec:*` (Agent A doesn't have it)

### Delegation Visualization

```bash
agentguard identity delegation-tree <session-id>
```

```
human:jplev
├── claude-code-abc123 [ELEVATED]
│   ├── capabilities: file:*, git:commit, git:push:feature/*
│   └── sub-agent-def456 [BASIC]
│       ├── capabilities: file:read:*, file:write:src/**
│       └── sub-agent-ghi789 [UNTRUSTED]
│           └── capabilities: file:read:src/**
```

## Human-in-the-Loop Approval (Aspirational)

### Approval Gates

Policy rules can require human approval for specific actions:

```yaml
action_rules:
  - pattern: "git.push"
    target: "main"
    effect: require_approval
    approval:
      channels: [cli, slack]
      timeout: 300  # seconds
      escalate_on_timeout: true
```

### Approval Flow

```
Agent proposes action
  → Kernel evaluates → requires approval
    → Notification sent to approval channel(s)
      → Human approves: action executes
      → Human denies: action denied + event emitted
      → Timeout: action denied + escalation (if configured)
```

### Approval Channels

| Channel | Mechanism | Latency |
|---------|-----------|---------|
| CLI prompt | Interactive terminal prompt | Immediate (blocks) |
| Webhook | HTTP POST to configured endpoint | Low (async) |
| Slack | Message to configured channel with approve/deny buttons | Medium (async) |
| Email | Email with approve/deny links | High (async) |

### Approval Audit Trail

Every approval request and response is recorded:

```
ApprovalRecord {
  requestId: string
  actionId: string         // Action that triggered the approval
  requestedAt: number
  respondedAt?: number
  channel: string          // How approval was requested
  approver?: string        // Who approved/denied
  decision: 'approved' | 'denied' | 'timeout'
  reason?: string          // Optional reason from approver
}
```

## Identity Persistence (Aspirational)

### Cross-Session

Agent identities persist across sessions. When a governance session starts, the kernel resolves the agent identity from the registry and attaches it to all events.

### Identity Rotation

- Periodic key rotation for agents (configurable interval)
- Old keys remain valid for verification of historical events
- Rotation event emitted for audit trail

## New Event Kinds

| Event | Trigger |
|-------|---------|
| `AgentRegistered` | New agent identity created |
| `AgentSuspended` | Agent suspended (actions auto-denied) |
| `AgentDeactivated` | Agent deactivated |
| `DelegationCreated` | Capability delegated to sub-agent |
| `DelegationRevoked` | Delegation chain broken |
| `ApprovalRequested` | Human approval requested for action |
| `ApprovalGranted` | Human approved action |
| `ApprovalDenied` | Human denied action |
| `ApprovalTimeout` | Approval window expired |

## Target Directory Structure

```
src/identity/
├── agent.ts          # AgentIdentity type and validation
├── registry.ts       # Agent registry (CRUD + search)
├── attestation.ts    # Agent identity verification
├── delegation.ts     # Delegation chain tracking and enforcement
└── approval.ts       # Human-in-the-loop approval workflows
```

## Key Files to Modify

| File | Change |
|------|--------|
| `src/kernel/kernel.ts` | Resolve agent identity on action proposal |
| `src/events/schema.ts` | Add identity and approval event kinds |
| `src/core/types.ts` | Identity type definitions |

## Verification

- Agent lifecycle: register → active → suspend → reactivate → deactivate
- Delegation chain correctly narrows capabilities at each level
- Sub-agent cannot exceed parent's capabilities
- Approval gate blocks action until human responds
- Approval timeout triggers denial and optional escalation
- Identity persists across sessions

## References

- [Capability Tokens](capability-tokens.md)
- [Unified Architecture](unified-architecture.md)

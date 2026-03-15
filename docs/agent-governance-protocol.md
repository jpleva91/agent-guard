# Agent Governance Protocol (AGP) — Specification

This document defines the Agent Governance Protocol: an open standard for cross-platform agent governance, covering event formats, policy exchange, and audit trail interoperability.

## Purpose

As agent governance becomes an industry requirement, different tools will implement their own formats. Without a standard, governance data becomes siloed:

- Audit trails from Tool A can't be verified by Tool B
- Policies written for Platform X can't be imported to Platform Y
- Compliance teams must learn multiple formats

AGP solves this by defining standard formats for the three pillars of agent governance:
1. **Events** — what happened
2. **Policies** — what should happen
3. **Audit trails** — proof of what happened

## Protocol Scope

AGP covers the interchange formats and verification protocols. It does **not** prescribe:
- How governance decisions are made (kernel implementation)
- How policies are authored (DSL vs YAML vs JSON)
- How events are stored (JSONL vs database vs cloud)
- How adapters intercept agent actions (framework-specific)

## Standard Event Format

### Event Envelope

```json
{
  "agp_version": "1.0",
  "id": "uuid-v4",
  "kind": "string (AGP event kind)",
  "timestamp": "ISO 8601 datetime",
  "session_id": "uuid-v4",
  "agent_id": "string",
  "source": "string (producing system identifier)",
  "payload": { },
  "signature": "base64 (optional, Ed25519 or HMAC-SHA256)",
  "previous_hash": "hex (optional, SHA-256 of previous event)"
}
```

### Standard Event Kinds

#### Governance Events

| Kind | Description | Required Payload Fields |
|------|-------------|----------------------|
| `agp.action.requested` | Agent proposed an action | `action_type`, `target`, `metadata` |
| `agp.action.allowed` | Action approved by governance | `action_type`, `target`, `decision_reason` |
| `agp.action.denied` | Action blocked by governance | `action_type`, `target`, `denial_reason`, `policy_rule` |
| `agp.action.executed` | Allowed action completed | `action_type`, `target`, `result` |
| `agp.action.failed` | Allowed action failed during execution | `action_type`, `target`, `error` |

#### Escalation Events

| Kind | Description | Required Payload Fields |
|------|-------------|----------------------|
| `agp.escalation.changed` | Escalation level changed | `from_level`, `to_level`, `trigger` |
| `agp.escalation.lockdown` | System entered lockdown | `trigger`, `affected_agents` |

#### Invariant Events

| Kind | Description | Required Payload Fields |
|------|-------------|----------------------|
| `agp.invariant.violated` | Invariant check failed | `invariant_name`, `severity`, `action_type`, `detail` |

#### Lifecycle Events

| Kind | Description | Required Payload Fields |
|------|-------------|----------------------|
| `agp.session.started` | Governance session began | `agent_id`, `policy_version` |
| `agp.session.ended` | Governance session ended | `summary` (action counts, denial counts) |

#### Identity Events

| Kind | Description | Required Payload Fields |
|------|-------------|----------------------|
| `agp.agent.registered` | New agent identity created | `agent_name`, `capabilities`, `issuer` |
| `agp.delegation.created` | Capability delegated to sub-agent | `from_agent`, `to_agent`, `capabilities` |

### Standard Action Types

AGP defines a canonical action taxonomy that implementations should map to:

```
file.read, file.write, file.delete, file.move
git.commit, git.push, git.branch.create, git.branch.delete, git.merge, git.reset
shell.exec
test.run
npm.install, npm.script.run, npm.publish
http.request
deploy.trigger
infra.apply, infra.destroy
gpio.read, gpio.write
sensor.read
actuator.move, actuator.stop
```

Implementations may define additional action types using the `<class>.<verb>` naming convention.

## Standard Policy Exchange Format

### Policy Document

```json
{
  "agp_version": "1.0",
  "policy_id": "uuid-v4",
  "version": 1,
  "hash": "sha256 of policy content",
  "name": "string",
  "description": "string",
  "author": "string",
  "created_at": "ISO 8601",
  "default_effect": "allow | deny",
  "rules": [
    {
      "id": "string",
      "effect": "allow | deny | escalate",
      "conditions": {
        "action_type": "string or pattern",
        "action_class": "string",
        "target": "glob pattern",
        "branch": "string or pattern",
        "agent_id": "string",
        "capabilities_required": ["string"]
      },
      "metadata": {
        "description": "string",
        "rationale": "string"
      }
    }
  ]
}
```

### Policy Versioning

Each policy version includes:
- Incrementing version number
- SHA-256 hash of the rule set
- Author and timestamp
- Diff from previous version (optional)

## Standard Audit Trail Format

### Audit Export

```json
{
  "agp_version": "1.0",
  "export_timestamp": "ISO 8601",
  "exporter": "string (tool name and version)",
  "session_id": "uuid-v4",
  "policy_hash": "sha256",
  "events": [ ],
  "summary": {
    "total_actions": 0,
    "allowed": 0,
    "denied": 0,
    "violations": 0,
    "escalation_peak": "NORMAL | ELEVATED | HIGH | LOCKDOWN"
  },
  "chain_integrity": {
    "verified": true,
    "first_hash": "hex",
    "last_hash": "hex",
    "event_count": 0
  }
}
```

### Verification Protocol

To verify an AGP audit trail:
1. Parse the export document
2. Verify `chain_integrity.event_count` matches `events.length`
3. Recompute hash chain: for each event, verify `previous_hash` matches hash of prior event
4. If signatures present: verify each event signature against the signing public key
5. Verify `summary` fields match computed totals from events
6. Report: PASS (all checks green) or FAIL (with specific failures listed)

## Reference Implementation

### Components

| Component | Purpose |
|-----------|---------|
| `agp-serialize` | Serialize/deserialize AGP events, policies, and audit trails |
| `agp-validate` | Validate AGP documents against the specification |
| `agp-verify` | Verify audit trail integrity (hash chain + signatures) |
| `agp-convert` | Convert between AGP and tool-specific formats |

### AgentGuard Mapping

| AGP Format | AgentGuard Equivalent |
|-----------|----------------------|
| `agp.action.requested` | `ActionRequested` event kind |
| `agp.action.allowed` | `ActionAllowed` event kind |
| `agp.action.denied` | `ActionDenied` event kind |
| `agp.escalation.changed` | `StateChanged` event kind |
| `agp.invariant.violated` | `InvariantViolation` event kind |
| AGP policy document | `Policy` type from `src/policy/loader.ts` |
| AGP audit export | JSONL export from `agentguard export` |

## Governance

### Specification Licensing

Apache License 2.0 — permissive, suitable for both open-source and commercial implementations.

### Versioning

- Specification versions follow semver (major.minor)
- Major version changes indicate breaking format changes
- Minor version changes are backward-compatible additions
- All documents include `agp_version` for format detection

### Extension Mechanism

Implementations may add custom fields using the `x_` prefix:

```json
{
  "kind": "agp.action.denied",
  "payload": {
    "action_type": "git.push",
    "denial_reason": "Protected branch",
    "x_blast_radius_score": 0.85,
    "x_invariant_name": "protected-branch"
  }
}
```

Custom fields must not conflict with standard fields and must be ignored by implementations that don't understand them.

## Target Directory Structure

```
docs/protocol/
├── agp-spec.md          # This document (formal specification)
├── agp-examples.md      # Example events, policies, and audit trails
└── agp-validation.md    # Validation rules and test vectors
```

## Verification

- AGP event serialization/deserialization round-trips without data loss
- AGP policy validation rejects malformed documents
- AGP audit trail verification detects tampering
- AgentGuard events convert to/from AGP format without loss

## References

- [Cryptographic Non-Repudiation](cryptographic-non-repudiation.md)
- [Event Model](event-model.md)
- [Unified Architecture](unified-architecture.md)

# Feature Spec: Action Authorization Boundary (AAB)

## Summary

The Action Authorization Boundary is AgentGuard's core evaluation engine. It intercepts agent actions, evaluates them against declared policies and invariants, and emits governance events when violations occur. This is Phase 2's primary deliverable.

## Requirements

- [ ] Accept agent actions as structured objects (tool name, parameters, context)
- [ ] Evaluate actions against a set of loaded policies
- [ ] Emit `PolicyDenied` events when an action violates a policy
- [ ] Emit `UnauthorizedAction` events for actions outside declared scope
- [ ] Emit `InvariantViolation` events when invariant checks fail
- [ ] Compute blast radius (files affected) and emit `BlastRadiusExceeded` when over limit
- [ ] Generate evidence packs linking related governance events
- [ ] All evaluation is deterministic — same action + same policy = same result

## Events Produced

| Event Kind | When Emitted | Required Data |
|------------|-------------|---------------|
| `PolicyDenied` | Action violates a declared policy | `{ policy, action, reason }` |
| `UnauthorizedAction` | Action outside declared scope | `{ action, reason }` |
| `InvariantViolation` | Invariant check fails | `{ invariant, expected, actual }` |
| `BlastRadiusExceeded` | Too many files affected | `{ filesAffected, limit }` |
| `EvidencePackGenerated` | Related events bundled | `{ packId, eventIds }` |

## Events Consumed

| Event Kind | Reaction |
|------------|----------|
| `FileSaved` | Track file changes for blast radius computation |
| `CommitCreated` | Record commit scope for audit trail |

## Interface Contract

```js
/**
 * Evaluate an agent action against loaded policies.
 * @param {Action} action - The action to evaluate
 * @param {Policy[]} policies - Active policies
 * @returns {EvaluationResult} - { allowed: boolean, violations: Violation[] }
 */
export function evaluate(action, policies) {}

/**
 * Check invariants against current system state.
 * @param {Invariant[]} invariants - Declared invariants
 * @param {SystemState} state - Current state snapshot
 * @returns {InvariantResult[]} - Array of pass/fail results
 */
export function checkInvariants(invariants, state) {}

/**
 * Compute blast radius for a set of file changes.
 * @param {string[]} files - Changed file paths
 * @param {number} limit - Maximum allowed files
 * @returns {{ exceeded: boolean, count: number, files: string[] }}
 */
export function computeBlastRadius(files, limit) {}
```

## Dependencies

| Module | Why Needed |
|--------|-----------|
| `domain/events.js` | Event creation and validation |
| `domain/event-bus.js` | Event emission |

## Layer Placement

- [x] `domain/` — Pure logic, no environment dependencies

## Constraints

- Must remain zero-dependency
- Must be deterministic — no Date.now() in evaluation logic (timestamps injected)
- Must not import from `core/` or `game/`
- Policy format: JSON (decided per open question in current-priorities.md)

## Verification

```bash
npm test -- --grep "aab"
npm test -- --grep "governance"
```

## Open Questions

1. Policy definition language — JSON selected (simplest, zero-dep)
2. Should policies support composition (policy A extends policy B)?
3. Evidence pack retention — how long to keep, where to store?

# System Invariants

These are structural guarantees that must never be violated. Agents and contributors must preserve all invariants when making changes.

## Layer Boundary Invariants

1. **Domain purity.** Functions in `core/` must have no side effects, no DOM access, and no Node.js-specific APIs. All randomness is injected, never global.

2. **No cross-layer imports.** Layer dependencies follow a strict DAG: kernel → {events, policy, invariants, adapters, core}; events → core; policy → core; invariants → {core, events}; adapters → {core, kernel}; cli → {kernel, events, policy, core}. core has no project imports.

## Event Model Invariants

3. **Event schema validity.** Every event must have a `kind` from the canonical `ALL_EVENT_KINDS` set and all required fields for that kind.

4. **Fingerprint stability.** The same error (type + message + file + line) must always produce the same fingerprint. Deduplication depends on this.

5. **Events are append-only.** Events are never modified after creation, except for the `resolved` flag. Event ordering is immutable.

6. **Event IDs are unique.** Within a session, no two events share the same ID.

7. **EventBus delivery order.** All subscribed listeners receive events in registration order. Listener exceptions must not prevent other listeners from firing.

## Governance Invariants

8. **Kernel bypass prohibition.** All agent actions must pass through the kernel loop. No direct adapter invocation.

9. **Policy evaluation determinism.** Same action + same policy + same state = same decision. No inference, no heuristics.

10. **Escalation monotonicity within a session.** Escalation level only increases within a session (NORMAL → ELEVATED → HIGH → LOCKDOWN). Reset only on session boundary.

11. **Evidence completeness.** Every invariant violation produces an evidence pack with action, violations, and timestamp.

## Severity Invariants

12. **Severity determinism.** An invariant violation always maps to the same severity level (1-5). This mapping is static.

## Zero-Dependency Invariant

13. **Minimal runtime dependencies.** The CLI uses only `chokidar`, `commander`, and `pino` as runtime dependencies. Build tools (esbuild, terser, vitest) are dev-only.

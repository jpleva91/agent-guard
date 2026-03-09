# Invariant Contract

These are hard rules the system must never violate. Agents must verify compliance before committing code.

## Architectural Invariants

1. **Single canonical event schema.** All systems produce and consume events conforming to the schema in `src/events/`. No translation layers, no alternate event formats.

2. **Unidirectional governance.** The kernel produces governance events. Subscribers (TUI, JSONL sink, CLI inspect) consume them. Consumers must never influence governance decisions or policy evaluation.

3. **Governed action loop.** Every agent action passes through the full loop: propose, normalize, evaluate, execute, emit. No step may be skipped or bypassed.

4. **Independent renderers.** Terminal, JSONL, and any future renderers are independent EventBus subscribers. Adding a new renderer requires zero changes to the kernel, the event model, or other renderers.

## Environment Invariants

5. **core/ is environment-agnostic.** No DOM APIs (`document`, `window`, `canvas`). Pure functions only. Node.js APIs are permitted only in CLI and adapter layers.

6. **Layer isolation.** The kernel depends on policy, invariants, adapters, events, and core. No reverse dependencies. CLI depends on all layers but nothing depends on CLI.

## Runtime Invariants

7. **EventBus is synchronous.** Event emission and handler execution are synchronous. No async event handlers, no deferred delivery.

8. **ES6 modules only.** No CommonJS (`require`, `module.exports`). All source uses `import`/`export`.

9. **Invariant checking is deterministic.** Given the same action and system state, invariant checking must always produce the same result.

## Code Quality Invariants

10. **No `var` declarations.** Use `const` (preferred) or `let` only.

11. **Strict equality.** Use `===` and `!==`, never `==` or `!=`.

## Data Integrity Invariants

12. **Event IDs are unique.** Generated as `evt_{timestamp}_{counter}` with a monotonic session counter. No collisions within a session.

13. **Fingerprints are stable.** Event fingerprints are computed from `kind + sorted data keys/values` via DJB2 hash. Same input always produces same fingerprint.

14. **JSONL is append-only.** The JSONL event sink is append-only. Events are never modified or deleted after being written.

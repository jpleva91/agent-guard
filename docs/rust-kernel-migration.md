# Rust Kernel Migration — AgentGuard

This document describes the plan to migrate the AgentGuard governance kernel from TypeScript to Rust for memory safety, tamper resistance, and deterministic performance.

## Rationale

The governance kernel is the **trust boundary** — it decides whether agent actions are allowed or denied. This component must be:

- **Memory-safe** — no buffer overflows, use-after-free, or data races
- **Tamper-resistant** — compiled binary is harder to modify than interpreted TypeScript
- **Deterministic** — no garbage collection pauses during policy evaluation
- **Fast** — < 1ms p99 action evaluation (critical for real-time physical systems via Sentinel)

TypeScript/Node.js cannot guarantee these properties. Rust provides them with minimal runtime overhead while maintaining developer ergonomics.

**What stays in TypeScript:** The Control Plane (CLI, policy authoring, developer experience, TUI, event streaming) remains TypeScript. Only the governance kernel — the hot path of propose → evaluate → execute decision — migrates to Rust.

## Architecture

```
┌─────────────────────────────────────────────────┐
│          TypeScript Control Plane                 │
│                                                   │
│  CLI    TUI    Policy Authoring    Event Store    │
│                                                   │
│  npm package, user-facing, developer experience   │
└──────────────────────┬────────────────────────────┘
                       │ N-API (napi-rs)
                       ▼
┌─────────────────────────────────────────────────┐
│            Rust Governance Kernel                 │
│                                                   │
│  AAB → Policy Evaluator → Invariant Checker      │
│    → Decision Engine → Escalation Monitor         │
│                                                   │
│  Compiled as native Node.js addon (.node file)    │
└─────────────────────────────────────────────────┘
```

## Migration Strategy: Gradual, Component-by-Component

The migration proceeds from the innermost, most performance-sensitive components outward. At each stage, the Rust implementation must produce **identical results** to the TypeScript implementation on the replay corpus.

### Stage 1: Invariant Checker

**Migrate:** `src/invariants/checker.ts` + `src/invariants/definitions.ts`

**Why first:** Invariant checking is the most self-contained component. It takes an action and system state, returns pass/fail. No side effects, no complex dependencies.

**Rust module:** `kernel-rs/src/invariant.rs`

**Verification:** Run the full invariant test suite against both implementations. All results must match exactly.

### Stage 2: Policy Evaluator

**Migrate:** `src/policy/evaluator.ts`

**Why second:** The policy evaluator is the next most self-contained component. It takes an action and a policy, returns allow/deny with matched rules. The main complexity is pattern matching and scope evaluation.

**Rust module:** `kernel-rs/src/evaluator.rs`

**Verification:** Evaluate 10K+ actions against a comprehensive policy set. All decisions must match the TypeScript implementation.

### Stage 3: AAB (Action Authorization Boundary)

**Migrate:** `src/kernel/aab.ts`

**Why third:** AAB normalizes raw agent payloads into typed actions. This involves string parsing and pattern recognition (detecting git commands within shell calls, etc.). Correctness here is critical — a misclassified action bypasses governance.

**Rust module:** `kernel-rs/src/aab.rs`

**Verification:** Normalization test corpus covering all known tool formats and evasion patterns.

### Stage 4: Decision Engine + Monitor

**Migrate:** `src/kernel/decision.ts` + `src/kernel/monitor.ts`

**Why last:** These components orchestrate the other modules and manage state (escalation levels, decision history). They have the most integration points with the TypeScript control plane.

**Rust modules:** `kernel-rs/src/decision.rs`, `kernel-rs/src/monitor.rs`

**Verification:** End-to-end replay of governance sessions. All decisions and escalation state transitions must match.

## Project Structure

```
kernel-rs/
├── Cargo.toml
├── src/
│   ├── lib.rs           # Library root
│   ├── aab.rs           # Action Authorization Boundary
│   ├── evaluator.rs     # Policy evaluation engine
│   ├── invariant.rs     # Invariant checker
│   ├── decision.rs      # Decision engine
│   └── monitor.rs       # Escalation state machine
├── bindings/
│   └── napi.rs          # N-API bindings for Node.js
└── tests/
    ├── invariant_test.rs
    ├── evaluator_test.rs
    ├── aab_test.rs
    └── integration_test.rs
```

## N-API Bindings

The Rust kernel is compiled as a native Node.js addon using [napi-rs](https://napi.rs/). The TypeScript wrapper maintains full API compatibility:

```typescript
// src/kernel/kernel-native.ts (TypeScript wrapper)
import { loadBinding } from '@napi-rs/binding';

const nativeKernel = loadBinding(__dirname, 'kernel-rs');

export function evaluateAction(action: RawAgentAction, policy: Policy): GovernanceDecisionRecord {
  // Serialize to JSON, call Rust, deserialize result
  return nativeKernel.evaluateAction(JSON.stringify(action), JSON.stringify(policy));
}
```

**Serialization strategy:** JSON across the FFI boundary. While not zero-copy, JSON serialization is well under 1ms for typical action payloads and avoids complex memory management at the boundary.

### Fallback

If the native addon fails to load (unsupported platform, build failure), the kernel falls back to the TypeScript implementation with a warning:

```
[agentguard] Native kernel unavailable, falling back to TypeScript implementation
```

## Performance Targets

| Metric | TypeScript | Rust Target |
|--------|-----------|-------------|
| Action evaluation (p50) | ~5ms | < 0.1ms |
| Action evaluation (p99) | ~20ms | < 1ms |
| Memory (kernel process) | ~50MB | < 10MB |
| GC pauses | Up to 100ms | None |
| Cold start | ~500ms | < 50ms |

## Replay Corpus Verification

The primary verification mechanism is **replay-based comparison**:

1. Collect governance session recordings (JSONL event streams) from real usage
2. Extract all `ActionRequested` events as the input corpus
3. Replay each action through both TypeScript and Rust kernels
4. Compare every output: decision, matched rules, invariant results, escalation state
5. Any divergence is a migration bug — investigate and fix before proceeding

**Minimum corpus size:** 10,000 unique actions across all action classes, with at least:
- 1,000 file operations
- 500 git operations
- 500 shell commands
- 200 npm operations
- Edge cases: encoded commands, chained operations, invalid payloads

## Platform Support

The Rust native addon must be compiled for:

| Platform | Architecture | Priority |
|----------|-------------|----------|
| Linux | x86_64 | P0 |
| macOS | aarch64 (Apple Silicon) | P0 |
| macOS | x86_64 | P1 |
| Windows | x86_64 | P1 |
| Linux | aarch64 (Raspberry Pi / Sentinel) | P1 |

Pre-built binaries are distributed via npm. The `optionalDependencies` pattern ensures installation doesn't fail on unsupported platforms.

## Timeline

| Stage | Duration | Milestone |
|-------|----------|-----------|
| Stage 1: Invariant checker | 4–6 weeks | All invariant tests pass in Rust |
| Stage 2: Policy evaluator | 6–8 weeks | All policy evaluation tests pass in Rust |
| Stage 3: AAB | 4–6 weeks | All normalization tests pass in Rust |
| Stage 4: Decision + Monitor | 6–8 weeks | Full replay corpus produces identical results |
| Integration + benchmarks | 4 weeks | Performance targets met, fallback tested |

**Total estimated duration:** 6–8 months

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| N-API binding complexity | Use well-maintained napi-rs; start with simple invariant checker |
| JSON serialization overhead | Benchmark early; switch to FlatBuffers if needed |
| Platform compilation matrix | Use GitHub Actions CI matrix; pre-built binaries via napi-rs |
| Feature parity drift | Shared test corpus; any new TypeScript feature must have Rust equivalent before release |
| Team expertise gap | Start with Rust-experienced contributor; document decisions |

## References

- [Sentinel Architecture](sentinel-architecture.md) — performance requirements driven by physical systems
- [Unified Architecture](unified-architecture.md)

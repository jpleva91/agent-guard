# Rust Kernel Rewrite — Phase Roadmap

> **Spec:** `docs/superpowers/specs/2026-03-16-rust-kernel-rewrite-design.md`
> **P1 Plan:** `docs/superpowers/plans/2026-03-16-rust-kernel-p1.md` (DONE — 68 tests passing)

---

## P1: Types + AAB + Policy Evaluator ✅

**Status:** Complete — merged via PR #534

**Delivered:**
- `crates/kernel-core/src/types.rs` — All core types with serde camelCase
- `crates/kernel-core/src/actions.rs` — 23 ActionType variants + class mapping
- `crates/kernel-core/src/hash.rs` — simpleHash with UTF-16 parity
- `crates/kernel-core/src/data.rs` — 7 embedded JSON data files via include_str + LazyLock
- `crates/kernel-core/src/policy.rs` — Two-phase deny-first evaluator with traces
- `crates/kernel-core/src/aab.rs` — normalize_intent, detect_git_action, is_destructive_command
- 68 unit tests, zero clippy warnings

---

## P2: Invariants + Blast Radius + Monitor

**Goal:** Full `EngineDecision` from Rust — all 24 invariants match TS behavior.

### TODO: invariants.rs
- [ ] Port `SystemState` struct (22 optional fields, matches `packages/invariants/src/definitions.ts`)
- [ ] Port `InvariantDef` struct with check function signature
- [ ] Implement all 24 invariant check functions:
  - `no-secret-exposure` (severity 5) — match modifiedFiles against SENSITIVE_FILE_PATTERNS
  - `protected-branch` (severity 4) — !isProtected || !directPush
  - `blast-radius-limit` (severity 3) — count <= limit
  - `test-before-push` (severity 3) — if isPush: testsPass === true
  - `no-force-push` (severity 4) — !forcePush
  - `no-skill-modification` (severity 4) — skip READ_ONLY; check .claude/skills/
  - `no-scheduled-task-modification` (severity 5) — skip READ_ONLY; check .claude/scheduled-tasks/
  - `no-credential-file-creation` (severity 5) — write/move only; isCredentialPath()
  - `no-package-script-injection` (severity 4) — package.json + lifecycle scripts
  - `recursive-operation-guard` (severity 2) — find -delete, xargs destructive
  - `large-file-write` (severity 3) — writeSizeBytes <= limit (default 100KB)
  - `no-cicd-config-modification` (severity 4) — .github/workflows/, .gitlab-ci.yml, etc.
  - `no-permission-escalation` (severity 4) — sudo/doas/su in commands
  - `no-governance-self-modification` (severity 5) — .agentguard/, agentguard.yaml
  - `lockfile-integrity` (severity 4) — package.json modified => lockfile must change too
  - `no-container-config-modification` (severity 4) — Dockerfile, docker-compose.yml
  - `no-env-var-modification` (severity 4) — export/env assignment with SENSITIVE patterns
  - `no-destructive-migration` (severity 4) — migration files with DROP TABLE/SCHEMA
  - `transitive-effect-analysis` (severity 3) — scan content for nested violations (13 patterns)
  - `no-network-egress` (severity 3) — isNetworkRequest + domain allowlist
- [ ] Implement `check_all()` — iterate all invariants, collect violations (no short-circuit)
- [ ] Helper functions: isCredentialPath, isContainerConfigPath, isLifecycleConfigPath
- [ ] Port invariant pattern data from `packages/core/src/data/invariant-patterns.json` (already embedded in data.rs)
- [ ] Tests: one per invariant + edge cases

### TODO: blast.rs
- [ ] Port `computeBlastRadius(intent, threshold)` from `packages/kernel/src/blast-radius.ts`
- [ ] Factor multipliers from `blast-radius.json` (already embedded in data.rs):
  - Action multipliers: delete=3.0, write=1.5, read=0.1, git=2.0, shell=1.0
  - Path multipliers: sensitive=5.0, config=2.0
  - Command multipliers: destructive=4.0
- [ ] Risk level thresholds: high >= 50, medium >= 15
- [ ] Weighted score = rawCount * product(all_multipliers)
- [ ] Tests: multiplier combinations, risk thresholds, exceeded flag

### TODO: monitor.rs
- [ ] Port `Monitor` struct from `packages/kernel/src/monitor.ts`
- [ ] State: escalation_level, total_denials/violations/evaluations, recent_denials (VecDeque, window=10), denials_by_agent, violations_by_invariant
- [ ] Escalation config from `escalation.json` (already embedded in data.rs): denial_threshold=5, violation_threshold=3
- [ ] Thresholds: LOCKDOWN >= 2x, HIGH >= 1x, ELEVATED >= ceil(threshold/2)
- [ ] Monotonic escalation (only increases), LOCKDOWN auto-denies
- [ ] `reset_escalation()` resets all counters
- [ ] Tests: state transitions, lockdown behavior, per-agent tracking

---

## P3: Evidence + Events

**Goal:** Complete decision pipeline — evidence packs are byte-compatible with TS.

### TODO: evidence.rs
- [ ] `build_pack(intent, decision)` → EvidencePack with pack_${simpleHash(...)} ID
- [ ] `build_explainable(intent, decision)` → ExplainableEvidencePack with evaluation path, provenance
- [ ] EvidencePack struct: packId, timestamp, intent, decision, violations, events, summary, severity
- [ ] ExplainableEvidencePack: extends with schemaVersion, evaluationPath, provenance, verdictType, confidence
- [ ] Evaluation path phases: normalization, policy-evaluation, invariant-check, simulation, verdict
- [ ] Provenance sources: policy-rule, invariant, simulation, default
- [ ] Tests: pack ID determinism, summary generation, explainable path

### TODO: events.rs
- [ ] DomainEvent struct: id, kind, timestamp, fingerprint, payload
- [ ] EventKind enum: 30+ variants (governance, lifecycle, safety, reference monitor, etc.)
- [ ] Event factory: `create_event(kind, payload)` → DomainEvent
- [ ] Event ID: `evt_{timestamp}_{AtomicU64 counter}` (monotonically increasing)
- [ ] Tests: event creation, ID ordering, payload serialization

### TODO: decision.rs
- [ ] Full evaluation with context enrichment (merge systemContext into metadata)
- [ ] Network request detection (http.request action OR curl/wget/nc in shell)
- [ ] URL/domain extraction from intent
- [ ] SystemState building from enriched intent
- [ ] Authorize → invariant check → blast radius → intervention selection
- [ ] Intervention by severity: >=5 Deny, >=4 Pause, >=3 Rollback, <3 TestOnly
- [ ] Policy intervention override
- [ ] Tests: full pipeline, context enrichment, intervention selection

---

## P4: kernel-napi Bindings

**Goal:** TS kernel calls Rust via `AGENTGUARD_RUST_KERNEL=true` env flag.

### TODO: kernel-napi crate
- [ ] Create `crates/kernel-napi/` with napi-rs v2
- [ ] `evaluate()` napi function: accept 4 JSON strings, return JSON string
- [ ] `JsKernel` class: constructor, propose, get_state, reset
- [ ] JSON boundary at FFI (serde_json for all conversion)
- [ ] Add `@red-codes/kernel-napi` package.json with napi build script

### TODO: TS integration
- [ ] Create `packages/kernel/src/rust-bridge.ts` — JSON.stringify/parse wrapper
- [ ] Add `AGENTGUARD_RUST_KERNEL` env flag check in `packages/kernel/src/kernel.ts`
- [ ] Conditional delegation: Rust path when flag set, TS path otherwise
- [ ] Add napi build to Turbo pipeline (before @red-codes/kernel)

### TODO: CI
- [ ] Add `actions-rs/toolchain` to `size-check.yml`
- [ ] Add `cargo test` step
- [ ] Add `cargo clippy` step
- [ ] Add napi build + vitest integration test step

---

## P5: Conformance Test Suite

**Goal:** Rust/TS produce identical outputs on the full test suite — zero divergences.

### TODO
- [ ] Create conformance test harness: run same inputs through TS and Rust, diff JSON outputs
- [ ] Port all 44 AAB test fixtures as shared JSON
- [ ] Port policy evaluation test fixtures
- [ ] Port 24 invariant test fixtures
- [ ] Port blast radius test fixtures
- [ ] Port monitor state machine test fixtures
- [ ] Port evidence pack test fixtures
- [ ] Use `replay-comparator.ts` for full session-level conformance
- [ ] CI gate: zero divergences required to pass

---

## P6: Default Flip

**Goal:** Rust kernel is the default — TS is the fallback.

### TODO
- [ ] Flip `AGENTGUARD_RUST_KERNEL` default to `true`
- [ ] Add `AGENTGUARD_RUST_KERNEL=false` escape hatch documentation
- [ ] Run production sessions with Rust kernel (dogfooding)
- [ ] Monitor for behavioral differences via event sink
- [ ] Remove TS fallback path (after confidence period)
- [ ] Update CLAUDE.md and README.md

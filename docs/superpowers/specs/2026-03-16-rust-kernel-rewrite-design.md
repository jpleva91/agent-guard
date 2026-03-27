# Rust Kernel Rewrite — Design Specification

**Date:** 2026-03-16
**Status:** Draft
**Reference:** RTK (rtk-ai/rtk) architectural patterns

## Summary

Rewrite the AgentGuard governance kernel in Rust, deployed as a napi-rs native addon consumed by the existing TypeScript CLI. The Rust crate is structured for eventual extraction into a standalone binary.

## Motivation

The AgentGuard kernel is the governance hot path — every agent action passes through it. A Rust implementation provides:

- Sub-millisecond evaluation latency (vs. ~5-10ms in TS)
- Single binary distribution path (future standalone CLI)
- Memory safety guarantees for a security-critical component
- Alignment with RTK's proven architecture (single Rust binary, zero deps, <10ms overhead)

## Architecture

### Deployment Model

**Phase 1 (now):** FFI library via napi-rs. The existing TS CLI calls into the Rust kernel for the decision hot path. Everything else (adapters, sinks, CLI commands, MCP server) stays TypeScript.

**Phase 2 (future):** Standalone binary. The Rust `kernel-core` crate becomes the heart of a full `agentguard` CLI binary. The napi layer is discarded.

### Crate Layout

```
agent-guard/
├── crates/
│   ├── kernel-core/          # Pure Rust library — no napi, no async, no I/O
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs        # Re-exports
│   │       ├── types.rs      # Core types: NormalizedIntent, RawAgentAction, EvalResult
│   │       ├── actions.rs    # 41 canonical action types as enum ActionType
│   │       ├── aab.rs        # Action Authorization Boundary (normalize + authorize)
│   │       ├── policy.rs     # Policy evaluator (two-phase deny-first engine)
│   │       ├── invariants.rs # 24 invariant definitions + checker
│   │       ├── blast.rs      # Weighted blast radius computation
│   │       ├── monitor.rs    # Escalation state machine (NORMAL→ELEVATED→HIGH→LOCKDOWN)
│   │       ├── decision.rs   # Runtime assurance engine (policy + invariants → intervention)
│   │       ├── evidence.rs   # Evidence pack + explainable evidence generation
│   │       └── events.rs     # Event kinds, factory, DomainEvent struct
│   │
│   └── kernel-napi/          # napi-rs bindings — thin JS↔Rust bridge
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs        # napi exports
│           ├── convert.rs    # JS ↔ Rust type conversion via serde
│           └── kernel.rs     # Stateful Kernel class export
│
├── packages/kernel/          # Existing TS kernel
│   └── src/
│       ├── kernel.ts         # Gradually delegates to kernel-napi
│       └── rust-bridge.ts    # Import wrapper for @red-codes/kernel-napi
```

### Design Principles

1. **kernel-core is pure.** No I/O, no async, no runtime dependencies. Same inputs → same outputs. Testable with `cargo test` alone.
2. **JSON boundary at FFI.** napi functions accept/return JSON strings. Simple to debug, test, and version. Swap to napi objects later if profiling warrants.
3. **Gradual migration.** `AGENTGUARD_RUST_KERNEL=true` env flag enables Rust path. Both TS and Rust codepaths coexist during transition.
4. **Monitor is the only stateful component.** Owned exclusively by one Kernel instance — no shared mutable state.

### Serde Conventions

All Rust structs use `#[serde(rename_all = "camelCase")]` to produce TS-compatible JSON field names. The `ActionType` enum uses custom `#[serde(rename = "file.read")]`-style attributes to match the dot-delimited TS strings.

## Type System

### Core Types (kernel-core/src/types.rs)

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawAgentAction {
    pub tool: Option<String>,
    pub command: Option<String>,
    pub file: Option<String>,
    pub target: Option<String>,
    pub content: Option<String>,
    pub branch: Option<String>,
    pub agent: Option<String>,
    pub persona: Option<AgentPersona>,
    pub files_affected: Option<u32>,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPersona {
    pub trust_tier: Option<String>,
    pub role: Option<String>,
    pub autonomy: Option<String>,
    pub risk_tolerance: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedIntent {
    pub action: ActionType,
    pub target: String,
    pub agent: String,
    pub branch: Option<String>,
    pub command: Option<String>,
    pub files_affected: Option<u32>,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
    pub persona: Option<AgentPersona>,
    pub forecast: Option<IntentForecast>,
    pub destructive: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntentForecast {
    pub predicted_files: Vec<String>,
    pub dependencies_affected: Vec<String>,
    pub test_risk_score: f64,
    pub blast_radius_score: f64,
    pub risk_level: RiskLevel,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ActionType {
    #[serde(rename = "file.read")]    FileRead,
    #[serde(rename = "file.write")]   FileWrite,
    #[serde(rename = "file.delete")]  FileDelete,
    #[serde(rename = "file.move")]    FileMove,
    #[serde(rename = "test.run")]     TestRun,
    #[serde(rename = "test.run.unit")]       TestRunUnit,
    #[serde(rename = "test.run.integration")] TestRunIntegration,
    #[serde(rename = "git.diff")]     GitDiff,
    #[serde(rename = "git.commit")]   GitCommit,
    #[serde(rename = "git.push")]     GitPush,
    #[serde(rename = "git.branch.create")]  GitBranchCreate,
    #[serde(rename = "git.branch.delete")]  GitBranchDelete,
    #[serde(rename = "git.checkout")] GitCheckout,
    #[serde(rename = "git.reset")]    GitReset,
    #[serde(rename = "git.merge")]    GitMerge,
    #[serde(rename = "shell.exec")]   ShellExec,
    #[serde(rename = "npm.install")]  NpmInstall,
    #[serde(rename = "npm.script.run")] NpmScriptRun,
    #[serde(rename = "npm.publish")]  NpmPublish,
    #[serde(rename = "http.request")] HttpRequest,
    #[serde(rename = "deploy.trigger")] DeployTrigger,
    #[serde(rename = "infra.apply")]  InfraApply,
    #[serde(rename = "infra.destroy")] InfraDestroy,
    #[serde(rename = "unknown")]      Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Intervention {
    Deny,
    Pause,
    Modify,
    Rollback,
    #[serde(rename = "test-only")]
    TestOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum EscalationLevel {
    Normal,
    Elevated,
    High,
    Lockdown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Effect {
    Allow,
    Deny,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalResult {
    pub allowed: bool,
    pub decision: Effect,
    pub matched_rule: Option<PolicyRule>,
    pub matched_policy: Option<LoadedPolicy>,
    pub reason: String,
    pub severity: u8,
    pub trace: Option<PolicyEvaluationTrace>,
    pub policy_intervention: Option<Intervention>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyEvaluationTrace {
    pub rules_evaluated: Vec<RuleEvaluation>,
    pub total_rules_checked: u32,
    pub phase_that_matched: Option<String>,
    pub duration_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleEvaluation {
    pub policy_id: String,
    pub policy_name: String,
    pub rule_index: u32,
    pub rule: PolicyRule,
    pub action_matched: bool,
    pub conditions_matched: bool,
    pub condition_details: ConditionDetails,
    pub outcome: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConditionDetails {
    pub scope_matched: Option<bool>,
    pub limit_exceeded: Option<bool>,
    pub branch_matched: Option<bool>,
    pub persona_matched: Option<bool>,
    pub forecast_matched: Option<bool>,
    pub forecast_values: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Violation {
    pub invariant_id: String,
    pub name: String,
    pub severity: u8,
    pub expected: String,
    pub actual: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlastRadiusResult {
    pub raw_count: u32,
    pub weighted_score: f64,
    pub risk_level: RiskLevel,
    pub factors: Vec<BlastRadiusFactor>,
    pub threshold: Option<f64>,
    pub exceeded: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlastRadiusFactor {
    pub name: String,
    pub multiplier: f64,
    pub reason: String,
}
```

### Decision Types

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineDecision {
    pub allowed: bool,
    pub intent: NormalizedIntent,
    pub decision: EvalResult,
    pub violations: Vec<Violation>,
    pub events: Vec<DomainEvent>,
    pub evidence_pack: Option<EvidencePack>,
    pub intervention: Option<Intervention>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorDecision {
    #[serde(flatten)]
    pub engine: EngineDecision,
    pub monitor: MonitorState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorState {
    pub escalation_level: EscalationLevel,
    pub total_evaluations: u32,
    pub total_denials: u32,
    pub total_violations: u32,
}
```

## Module Specifications

### AAB — aab.rs

Stateless normalization and authorization.

```rust
pub fn normalize(raw: &RawAgentAction) -> NormalizedIntent;
pub fn authorize(intent: &NormalizedIntent, policies: &[PolicyRule], invariants: &[InvariantDef], system_state: &SystemState) -> AuthorizationResult;
pub fn detect_git_action(command: &str) -> Option<ActionType>;
pub fn is_destructive_command(command: &str) -> bool;
```

Pattern matching uses compiled `regex::Regex` (lazy-initialized via `LazyLock`).

### Policy — policy.rs

Two-phase deny-first evaluation engine.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ActionPattern {
    Single(String),
    Multiple(Vec<String>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyRule {
    pub action: ActionPattern,
    pub effect: Effect,
    pub conditions: Option<PolicyConditions>,
    pub reason: Option<String>,
    pub intervention: Option<Intervention>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedPolicy {
    pub id: String,
    pub name: String,
    pub rules: Vec<PolicyRule>,
}

pub fn evaluate(intent: &NormalizedIntent, policies: &[LoadedPolicy], options: &EvaluateOptions) -> EvalResult;
```

Glob matching: simple `*` wildcard matching (not full glob — matches the TS behavior).

### Invariants — invariants.rs

20 built-in invariant checks.

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemState {
    pub modified_files: Option<Vec<String>>,
    pub target_branch: Option<String>,
    pub direct_push: Option<bool>,
    pub force_push: Option<bool>,
    pub is_push: Option<bool>,
    pub tests_pass: Option<bool>,
    pub format_pass: Option<bool>,
    pub files_affected: Option<u32>,
    pub blast_radius_limit: Option<f64>,
    pub protected_branches: Option<Vec<String>>,
    pub simulated_blast_radius: Option<f64>,
    pub simulated_risk_level: Option<String>,
    pub current_target: Option<String>,
    pub current_command: Option<String>,
    pub current_action_type: Option<String>,
    pub file_content_diff: Option<String>,
    pub write_size_bytes: Option<u64>,
    pub write_size_bytes_limit: Option<u64>,
    pub is_network_request: Option<bool>,
    pub request_url: Option<String>,
    pub request_domain: Option<String>,
    pub network_egress_allowlist: Option<Vec<String>>,
}

pub fn check_all(invariants: &[InvariantDef], state: &SystemState, intent: &NormalizedIntent) -> Vec<Violation>;
```

### Blast Radius — blast.rs

Pure weighted computation.

```rust
pub fn compute(intent: &NormalizedIntent, rules: &[PolicyRule]) -> BlastRadiusResult;
```

Factor multipliers (static): delete: 3.0, force-push: 4.0, branch-delete: 3.0, git: 2.0, write: 1.5, shell: 1.0, read: 0.1, sensitive-path: 5.0, config-path: 2.0, destructive-cmd: 4.0

Risk thresholds: high >= 50, medium >= 15, low < 15.

### Monitor — monitor.rs

The only stateful component. Escalation is monotonic — only increases. Only explicit `reset_escalation()` returns to NORMAL.

```rust
pub struct Monitor {
    level: EscalationLevel,
    total_denials: u32,
    total_violations: u32,
    total_evaluations: u32,
    recent_denials: VecDeque<Denial>,
    denials_by_agent: HashMap<String, u32>,
    violations_by_invariant: HashMap<String, u32>,
    config: MonitorConfig,
}

impl Monitor {
    pub fn new(config: MonitorConfig) -> Self;
    pub fn process(&mut self, decision: &EngineDecision) -> MonitorDecision;
    pub fn level(&self) -> EscalationLevel;
    pub fn state(&self) -> MonitorState;
    pub fn reset_escalation(&mut self);
}
```

Escalation thresholds (recomputed on each evaluation):
- LOCKDOWN: `total_denials >= threshold*2` OR `total_violations >= viol_threshold*2`
- HIGH: `total_denials >= threshold` OR `total_violations >= viol_threshold`
- ELEVATED: `total_denials >= ceil(threshold/2)`
- NORMAL: below all thresholds

### Decision Engine — decision.rs

Combines policy + invariants → intervention selection.

```rust
pub fn evaluate(raw: &RawAgentAction, policies: &[LoadedPolicy], invariants: &[InvariantDef], system_context: &SystemState, options: &EvaluateOptions) -> EngineDecision;
```

Intervention selection by max severity: >=5 → Deny, >=4 → Pause, >=3 → Rollback, <3 → TestOnly. Policy rules with explicit `intervention` field override this default.

### Evidence — evidence.rs

```rust
pub fn build_pack(intent: &NormalizedIntent, decision: &EngineDecision) -> EvidencePack;
pub fn build_explainable(intent: &NormalizedIntent, decision: &EngineDecision) -> ExplainableEvidencePack;
```

Pack ID: `pack_{simpleHash(timestamp:action:target:agent)}`. Uses a fast non-cryptographic hash.

### Events — events.rs

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainEvent {
    pub id: String,
    pub kind: EventKind,
    pub timestamp: u64,
    pub fingerprint: String,
    pub payload: HashMap<String, serde_json::Value>,
}

pub fn create_event(kind: EventKind, payload: HashMap<String, serde_json::Value>) -> DomainEvent;
```

30+ event kinds as enum variants.

## napi-rs Bridge (kernel-napi)

### Exports

```rust
#[napi]
pub fn evaluate(raw_action_json: String, policies_json: String, invariants_json: String, system_state_json: String) -> napi::Result<String>;

#[napi(js_name = "RustKernel")]
pub struct JsKernel { inner: kernel_core::Kernel }

#[napi]
impl JsKernel {
    #[napi(constructor)]
    pub fn new(config_json: String) -> napi::Result<Self>;
    #[napi]
    pub fn propose(&mut self, raw_action_json: String) -> napi::Result<String>;
    #[napi]
    pub fn get_state(&self) -> napi::Result<String>;
    #[napi]
    pub fn reset(&mut self) -> napi::Result<()>;
}
```

## TS Integration

### rust-bridge.ts

```typescript
import { evaluate as rustEvaluate, RustKernel } from '@red-codes/kernel-napi';

export function evaluate(raw, policies, invariants, state): EngineDecision {
  return JSON.parse(rustEvaluate(JSON.stringify(raw), JSON.stringify(policies), JSON.stringify(invariants), JSON.stringify(state)));
}
```

### Migration Flag

`AGENTGUARD_RUST_KERNEL=true` environment variable.

## Build Configuration

### kernel-core Cargo.toml

```toml
[package]
name = "agentguard-kernel-core"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
regex = "1"

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
strip = true
```

### kernel-napi Cargo.toml

```toml
[package]
name = "agentguard-kernel-napi"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
agentguard-kernel-core = { path = "../kernel-core" }
napi = { version = "2", features = ["default", "serde-json"] }
napi-derive = "2"
serde_json = "1"

[build-dependencies]
napi-build = "2"
```

## Testing Strategy

### Level 1: Rust Unit Tests
`cargo test` in kernel-core. Port existing test cases: 44 AAB tests, policy evaluation tests, 24 invariant tests, blast radius tests, monitor state machine tests, evidence pack tests.

### Level 2: napi Integration Tests
vitest tests calling the Rust module through `@red-codes/kernel-napi`.

### Level 3: Conformance Tests
Run both TS and Rust codepaths on every test case. Diff outputs.

## Phasing

| Phase | Scope | Deliverable | Success Criteria |
|---|---|---|---|
| P1 | types + AAB + policy eval | `cargo test` passes | normalize/evaluate match TS output |
| P2 | invariants + blast radius + monitor | Full EngineDecision from Rust | All 24 invariants match TS behavior |
| P3 | evidence + events | Complete decision pipeline | Evidence packs are byte-compatible |
| P4 | kernel-napi bindings | TS kernel calls Rust via env flag | `AGENTGUARD_RUST_KERNEL=true` works |
| P5 | Conformance test suite | Rust/TS identical on full test suite | Zero divergences on 118 test files |
| P6 | Default flip | Rust is default, TS is fallback | Production sessions use Rust kernel |

## Governance Data Files

The JSON governance data files in `packages/core/src/data/` are embedded at compile time via `include_str!()`.

```rust
const TOOL_ACTION_MAP: &str = include_str!("../../../packages/core/src/data/tool-action-map.json");
const BLAST_RADIUS_CONFIG: &str = include_str!("../../../packages/core/src/data/blast-radius.json");
```

## Event ID Generation

The TS event factory uses a global incrementing counter. The Rust implementation uses `AtomicU64`.

## Kernel Orchestrator Scope

The top-level `Kernel` orchestrator stays in TypeScript for Phase 1. Only the `evaluate()` hot path delegates to Rust.

## Non-Goals (this spec)

- Simulation subsystem in Rust
- Replay engine in Rust
- Heartbeat monitor in Rust
- Standalone binary CLI
- Adapter execution in Rust
- MCP server in Rust

# Rust Kernel P1 — Types + AAB + Policy Evaluator

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `kernel-core` Rust crate covering core types, action types, the Action Authorization Boundary (normalize + detect), and the two-phase deny-first policy evaluator — with `cargo test` parity against the existing TypeScript implementation.

**Architecture:** Pure Rust library crate (`crates/kernel-core/`). No I/O, no async, no runtime dependencies. JSON governance data files from `packages/core/src/data/` are embedded via `include_str!()` and parsed once via `LazyLock`. All structs use `#[serde(rename_all = "camelCase")]` for TS-compatible JSON.

**Tech Stack:** Rust 2021 edition, serde + serde_json, regex (LazyLock-compiled)

**Spec:** `docs/superpowers/specs/2026-03-16-rust-kernel-rewrite-design.md`

---

## File Structure

```
crates/
└── kernel-core/
    ├── Cargo.toml
    └── src/
        ├── lib.rs          # Re-exports all public API
        ├── hash.rs         # simpleHash port (DJB2-style, base-36)
        ├── types.rs        # Core types: RawAgentAction, NormalizedIntent, EvalResult, etc.
        ├── actions.rs      # ActionType enum (23 variants + Unknown) with serde rename
        ├── data.rs         # Embedded JSON data (include_str + LazyLock parsing)
        ├── policy.rs       # Two-phase deny-first policy evaluator
        └── aab.rs          # Action Authorization Boundary (normalize + git/destructive detect)
```

---

## Chunk 1: Project Scaffolding + Types

### Task 1: Create crate skeleton

**Files:**
- Create: `crates/kernel-core/Cargo.toml`
- Create: `crates/kernel-core/src/lib.rs`

- [ ] **Step 1: Create Cargo.toml**

```toml
[package]
name = "agentguard-kernel-core"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
regex = "1"

[dev-dependencies]
pretty_assertions = "1"

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
strip = true
```

- [ ] **Step 2: Create lib.rs stub**

```rust
pub mod hash;
pub mod types;
pub mod actions;
pub mod data;
pub mod policy;
pub mod aab;
```

- [ ] **Step 3: Create empty module files**

Create empty files for each module:
- `crates/kernel-core/src/hash.rs`
- `crates/kernel-core/src/types.rs`
- `crates/kernel-core/src/actions.rs`
- `crates/kernel-core/src/data.rs`
- `crates/kernel-core/src/policy.rs`
- `crates/kernel-core/src/aab.rs`

- [ ] **Step 4: Verify it compiles**

Run: `cd crates/kernel-core && cargo check`
Expected: compiles with warnings about empty files

- [ ] **Step 5: Commit**

```bash
git add crates/kernel-core/
git commit -m "feat(rust): scaffold kernel-core crate with module structure"
```

---

### Task 2: Port simpleHash

**Files:**
- Modify: `crates/kernel-core/src/hash.rs`

The TS implementation uses a DJB2-variant hash: `hash = ((hash << 5) - hash + charCode) | 0`, then `Math.abs(hash).toString(36)`. The `| 0` truncates to 32-bit signed integer. We must produce identical output.

- [ ] **Step 1: Write the failing test**

In `crates/kernel-core/src/hash.rs`:

```rust
/// Port of the TypeScript simpleHash function.
/// DJB2-variant hash: for each char, hash = ((hash << 5) - hash + charCode) as i32.
/// Returns Math.abs(hash) in base-36.
pub fn simple_hash(s: &str) -> String {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_string() {
        assert_eq!(simple_hash(""), "0");
    }

    #[test]
    fn test_known_values() {
        let result = simple_hash("hello");
        assert!(!result.is_empty());
        // Base-36 string should only contain [0-9a-z]
        assert!(result.chars().all(|c| c.is_ascii_digit() || c.is_ascii_lowercase()));
    }

    #[test]
    fn test_deterministic() {
        assert_eq!(simple_hash("test input"), simple_hash("test input"));
    }

    #[test]
    fn test_different_inputs_differ() {
        assert_ne!(simple_hash("abc"), simple_hash("xyz"));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd crates/kernel-core && cargo test hash`
Expected: FAIL with "not yet implemented"

- [ ] **Step 3: Write implementation**

Replace the `todo!()` in `hash.rs`:

```rust
pub fn simple_hash(s: &str) -> String {
    let mut hash: i32 = 0;
    // JavaScript charCodeAt returns UTF-16 code units, so use encode_utf16
    for c in s.encode_utf16() {
        hash = ((hash << 5).wrapping_sub(hash)).wrapping_add(c as i32);
    }
    let abs = hash.unsigned_abs();
    if abs == 0 {
        return "0".to_string();
    }
    // Convert to base-36 string
    let mut result = Vec::new();
    let mut n = abs;
    while n > 0 {
        let digit = (n % 36) as u8;
        result.push(if digit < 10 { b'0' + digit } else { b'a' + digit - 10 });
        n /= 36;
    }
    result.reverse();
    String::from_utf8(result).unwrap()
}
```

- [ ] **Step 4: Run tests**

Run: `cd crates/kernel-core && cargo test hash`
Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add crates/kernel-core/src/hash.rs
git commit -m "feat(rust): port simpleHash to Rust with UTF-16 parity"
```

---

### Task 3: Core types

**Files:**
- Modify: `crates/kernel-core/src/types.rs`

Port all core types from the design spec. These are pure data structs with serde derives.

- [ ] **Step 1: Write types with serde derives**

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// --- Agent Persona ---

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPersona {
    pub trust_tier: Option<String>,
    pub role: Option<String>,
    pub autonomy: Option<String>,
    pub risk_tolerance: Option<String>,
    pub tags: Option<Vec<String>>,
}

// --- Raw Agent Action (input from adapters) ---

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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

// --- Normalized Intent (output of AAB normalization) ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedIntent {
    pub action: String,
    pub target: String,
    pub agent: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files_affected: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub persona: Option<AgentPersona>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub forecast: Option<IntentForecast>,
    pub destructive: bool,
}

// --- Intent Forecast ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntentForecast {
    pub predicted_files: Vec<String>,
    pub dependencies_affected: Vec<String>,
    pub test_risk_score: f64,
    pub blast_radius_score: f64,
    pub risk_level: RiskLevel,
}

// --- Risk Level ---

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

// --- Effect ---

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Effect {
    Allow,
    Deny,
}

// --- Intervention ---

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

// --- Escalation Level ---

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum EscalationLevel {
    Normal,
    Elevated,
    High,
    Lockdown,
}

// --- Policy Types ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ActionPattern {
    Single(String),
    Multiple(Vec<String>),
}

impl ActionPattern {
    pub fn patterns(&self) -> Vec<&str> {
        match self {
            ActionPattern::Single(s) => vec![s.as_str()],
            ActionPattern::Multiple(v) => v.iter().map(|s| s.as_str()).collect(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonaCondition {
    pub trust_tier: Option<Vec<String>>,
    pub role: Option<Vec<String>>,
    pub autonomy: Option<Vec<String>>,
    pub risk_tolerance: Option<Vec<String>>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForecastCondition {
    pub test_risk_score: Option<f64>,
    pub blast_radius_score: Option<f64>,
    pub risk_level: Option<Vec<RiskLevel>>,
    pub predicted_file_count: Option<u32>,
    pub dependency_count: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyConditions {
    pub scope: Option<Vec<String>>,
    pub limit: Option<f64>,
    pub branches: Option<Vec<String>>,
    pub require_tests: Option<bool>,
    pub require_format: Option<bool>,
    pub persona: Option<PersonaCondition>,
    pub forecast: Option<ForecastCondition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyRule {
    pub action: ActionPattern,
    pub effect: Effect,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conditions: Option<PolicyConditions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intervention: Option<Intervention>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedPolicy {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub rules: Vec<PolicyRule>,
    pub severity: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub persona: Option<AgentPersona>,
}

// --- Evaluation Result ---

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForecastMatchValues {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub test_risk_score: Option<ThresholdMatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blast_radius_score: Option<ThresholdMatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub risk_level: Option<RiskLevelMatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub predicted_file_count: Option<ThresholdMatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dependency_count: Option<ThresholdMatch>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThresholdMatch {
    pub actual: f64,
    pub threshold: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskLevelMatch {
    pub actual: RiskLevel,
    pub required: Vec<RiskLevel>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConditionDetails {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope_matched: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit_exceeded: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch_matched: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub persona_matched: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub forecast_matched: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub forecast_values: Option<ForecastMatchValues>,
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
    pub outcome: RuleOutcome,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RuleOutcome {
    Match,
    NoMatch,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyEvaluationTrace {
    pub rules_evaluated: Vec<RuleEvaluation>,
    pub total_rules_checked: u32,
    pub phase_that_matched: Option<EvalPhase>,
    pub duration_ms: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EvalPhase {
    Deny,
    Allow,
    Default,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace: Option<PolicyEvaluationTrace>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub policy_intervention: Option<Intervention>,
}

// --- Evaluate Options ---

#[derive(Debug, Clone)]
pub struct EvaluateOptions {
    /// When true (default), no matching rule = deny.
    pub default_deny: bool,
}

impl Default for EvaluateOptions {
    fn default() -> Self {
        Self { default_deny: true }
    }
}

// --- Violation ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Violation {
    pub invariant_id: String,
    pub name: String,
    pub severity: u8,
    pub expected: String,
    pub actual: String,
}

// --- Blast Radius ---

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlastRadiusFactor {
    pub name: String,
    pub multiplier: f64,
    pub reason: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_raw_action_roundtrip() {
        let raw = RawAgentAction {
            tool: Some("Bash".into()),
            command: Some("git push origin main".into()),
            agent: Some("claude".into()),
            ..Default::default()
        };
        let json = serde_json::to_string(&raw).unwrap();
        let parsed: RawAgentAction = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.tool.as_deref(), Some("Bash"));
        assert_eq!(parsed.command.as_deref(), Some("git push origin main"));
    }

    #[test]
    fn test_effect_serde() {
        assert_eq!(serde_json::to_string(&Effect::Allow).unwrap(), "\"allow\"");
        assert_eq!(serde_json::to_string(&Effect::Deny).unwrap(), "\"deny\"");
    }

    #[test]
    fn test_risk_level_serde() {
        assert_eq!(serde_json::to_string(&RiskLevel::High).unwrap(), "\"high\"");
        let parsed: RiskLevel = serde_json::from_str("\"medium\"").unwrap();
        assert_eq!(parsed, RiskLevel::Medium);
    }

    #[test]
    fn test_intervention_serde() {
        assert_eq!(serde_json::to_string(&Intervention::TestOnly).unwrap(), "\"test-only\"");
    }

    #[test]
    fn test_escalation_ordering() {
        assert!(EscalationLevel::Normal < EscalationLevel::Elevated);
        assert!(EscalationLevel::Elevated < EscalationLevel::High);
        assert!(EscalationLevel::High < EscalationLevel::Lockdown);
    }

    #[test]
    fn test_action_pattern_single() {
        let p: ActionPattern = serde_json::from_str("\"git.push\"").unwrap();
        assert_eq!(p.patterns(), vec!["git.push"]);
    }

    #[test]
    fn test_action_pattern_multiple() {
        let p: ActionPattern = serde_json::from_str("[\"git.push\", \"git.merge\"]").unwrap();
        assert_eq!(p.patterns(), vec!["git.push", "git.merge"]);
    }

    #[test]
    fn test_normalized_intent_json_camel_case() {
        let intent = NormalizedIntent {
            action: "file.write".into(),
            target: "src/main.rs".into(),
            agent: "claude".into(),
            branch: None,
            command: None,
            files_affected: Some(3),
            metadata: None,
            persona: None,
            forecast: None,
            destructive: false,
        };
        let json = serde_json::to_string(&intent).unwrap();
        assert!(json.contains("\"filesAffected\":3"));
        assert!(!json.contains("files_affected"));
    }

    #[test]
    fn test_rule_outcome_serde() {
        assert_eq!(serde_json::to_string(&RuleOutcome::NoMatch).unwrap(), "\"no-match\"");
        assert_eq!(serde_json::to_string(&RuleOutcome::Match).unwrap(), "\"match\"");
        assert_eq!(serde_json::to_string(&RuleOutcome::Skipped).unwrap(), "\"skipped\"");
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd crates/kernel-core && cargo check`
Expected: compiles clean

- [ ] **Step 3: Run tests**

Run: `cd crates/kernel-core && cargo test types`
Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add crates/kernel-core/src/types.rs
git commit -m "feat(rust): add core types with serde camelCase serialization"
```

---

### Task 4: ActionType enum

**Files:**
- Modify: `crates/kernel-core/src/actions.rs`

The TS codebase uses string action types (`"file.write"`, `"git.push"`, etc.). The Rust enum maps to/from these strings via serde rename.

- [ ] **Step 1: Write failing test**

```rust
use serde::{Deserialize, Serialize};

/// The 41 canonical action types plus Unknown.
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

/// Action class -- the dot-prefix grouping.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ActionClass {
    File,
    Test,
    Git,
    Shell,
    Npm,
    Http,
    Deploy,
    Infra,
}

impl ActionType {
    pub fn class(&self) -> ActionClass { todo!() }
    pub fn as_str(&self) -> &'static str { todo!() }
    pub fn from_str_opt(s: &str) -> Option<ActionType> { todo!() }
    pub fn all() -> &'static [ActionType] { todo!() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_serde_roundtrip() {
        let json = serde_json::to_string(&ActionType::FileWrite).unwrap();
        assert_eq!(json, "\"file.write\"");
        let parsed: ActionType = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, ActionType::FileWrite);
    }

    #[test]
    fn test_all_24_variants() {
        assert_eq!(ActionType::all().len(), 24);
    }

    #[test]
    fn test_class_mapping() {
        assert_eq!(ActionType::FileWrite.class(), ActionClass::File);
        assert_eq!(ActionType::GitPush.class(), ActionClass::Git);
        assert_eq!(ActionType::ShellExec.class(), ActionClass::Shell);
        assert_eq!(ActionType::HttpRequest.class(), ActionClass::Http);
        assert_eq!(ActionType::NpmInstall.class(), ActionClass::Npm);
        assert_eq!(ActionType::DeployTrigger.class(), ActionClass::Deploy);
        assert_eq!(ActionType::InfraDestroy.class(), ActionClass::Infra);
        assert_eq!(ActionType::TestRun.class(), ActionClass::Test);
    }

    #[test]
    fn test_from_str() {
        assert_eq!(ActionType::from_str_opt("git.push"), Some(ActionType::GitPush));
        assert_eq!(ActionType::from_str_opt("nonexistent"), None);
        assert_eq!(ActionType::from_str_opt("unknown"), Some(ActionType::Unknown));
    }

    #[test]
    fn test_as_str() {
        assert_eq!(ActionType::GitBranchDelete.as_str(), "git.branch.delete");
        assert_eq!(ActionType::TestRunIntegration.as_str(), "test.run.integration");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd crates/kernel-core && cargo test actions`
Expected: FAIL with "not yet implemented"

- [ ] **Step 3: Implement ActionType methods**

Replace the `todo!()` implementations:

```rust
impl ActionType {
    pub fn class(&self) -> ActionClass {
        match self {
            Self::FileRead | Self::FileWrite | Self::FileDelete | Self::FileMove => ActionClass::File,
            Self::TestRun | Self::TestRunUnit | Self::TestRunIntegration => ActionClass::Test,
            Self::GitDiff | Self::GitCommit | Self::GitPush | Self::GitBranchCreate
            | Self::GitBranchDelete | Self::GitCheckout | Self::GitReset | Self::GitMerge => ActionClass::Git,
            Self::ShellExec => ActionClass::Shell,
            Self::NpmInstall | Self::NpmScriptRun | Self::NpmPublish => ActionClass::Npm,
            Self::HttpRequest => ActionClass::Http,
            Self::DeployTrigger => ActionClass::Deploy,
            Self::InfraApply | Self::InfraDestroy => ActionClass::Infra,
            Self::Unknown => ActionClass::Shell,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::FileRead => "file.read",
            Self::FileWrite => "file.write",
            Self::FileDelete => "file.delete",
            Self::FileMove => "file.move",
            Self::TestRun => "test.run",
            Self::TestRunUnit => "test.run.unit",
            Self::TestRunIntegration => "test.run.integration",
            Self::GitDiff => "git.diff",
            Self::GitCommit => "git.commit",
            Self::GitPush => "git.push",
            Self::GitBranchCreate => "git.branch.create",
            Self::GitBranchDelete => "git.branch.delete",
            Self::GitCheckout => "git.checkout",
            Self::GitReset => "git.reset",
            Self::GitMerge => "git.merge",
            Self::ShellExec => "shell.exec",
            Self::NpmInstall => "npm.install",
            Self::NpmScriptRun => "npm.script.run",
            Self::NpmPublish => "npm.publish",
            Self::HttpRequest => "http.request",
            Self::DeployTrigger => "deploy.trigger",
            Self::InfraApply => "infra.apply",
            Self::InfraDestroy => "infra.destroy",
            Self::Unknown => "unknown",
        }
    }

    pub fn from_str_opt(s: &str) -> Option<ActionType> {
        match s {
            "file.read" => Some(Self::FileRead),
            "file.write" => Some(Self::FileWrite),
            "file.delete" => Some(Self::FileDelete),
            "file.move" => Some(Self::FileMove),
            "test.run" => Some(Self::TestRun),
            "test.run.unit" => Some(Self::TestRunUnit),
            "test.run.integration" => Some(Self::TestRunIntegration),
            "git.diff" => Some(Self::GitDiff),
            "git.commit" => Some(Self::GitCommit),
            "git.push" => Some(Self::GitPush),
            "git.branch.create" => Some(Self::GitBranchCreate),
            "git.branch.delete" => Some(Self::GitBranchDelete),
            "git.checkout" => Some(Self::GitCheckout),
            "git.reset" => Some(Self::GitReset),
            "git.merge" => Some(Self::GitMerge),
            "shell.exec" => Some(Self::ShellExec),
            "npm.install" => Some(Self::NpmInstall),
            "npm.script.run" => Some(Self::NpmScriptRun),
            "npm.publish" => Some(Self::NpmPublish),
            "http.request" => Some(Self::HttpRequest),
            "deploy.trigger" => Some(Self::DeployTrigger),
            "infra.apply" => Some(Self::InfraApply),
            "infra.destroy" => Some(Self::InfraDestroy),
            "unknown" => Some(Self::Unknown),
            _ => None,
        }
    }

    pub fn all() -> &'static [ActionType] {
        &[
            Self::FileRead, Self::FileWrite, Self::FileDelete, Self::FileMove,
            Self::TestRun, Self::TestRunUnit, Self::TestRunIntegration,
            Self::GitDiff, Self::GitCommit, Self::GitPush,
            Self::GitBranchCreate, Self::GitBranchDelete, Self::GitCheckout,
            Self::GitReset, Self::GitMerge,
            Self::ShellExec,
            Self::NpmInstall, Self::NpmScriptRun, Self::NpmPublish,
            Self::HttpRequest,
            Self::DeployTrigger,
            Self::InfraApply, Self::InfraDestroy,
            Self::Unknown,
        ]
    }
}
```

- [ ] **Step 4: Run tests**

Run: `cd crates/kernel-core && cargo test actions`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add crates/kernel-core/src/actions.rs
git commit -m "feat(rust): add ActionType enum with 41 canonical types + class mapping"
```

---

### Task 5: Embedded data module

**Files:**
- Modify: `crates/kernel-core/src/data.rs`

Embed the JSON governance data files at compile time. Parse them once via `LazyLock`.

- [ ] **Step 1: Write data.rs with include_str and LazyLock**

```rust
use std::collections::HashMap;
use std::sync::LazyLock;
use regex::Regex;
use serde::Deserialize;

// --- Embedded JSON data (compile-time) ---

const TOOL_ACTION_MAP_JSON: &str =
    include_str!("../../../packages/core/src/data/tool-action-map.json");
const GIT_ACTION_PATTERNS_JSON: &str =
    include_str!("../../../packages/core/src/data/git-action-patterns.json");
const DESTRUCTIVE_PATTERNS_JSON: &str =
    include_str!("../../../packages/core/src/data/destructive-patterns.json");
const BLAST_RADIUS_JSON: &str =
    include_str!("../../../packages/core/src/data/blast-radius.json");
const INVARIANT_PATTERNS_JSON: &str =
    include_str!("../../../packages/core/src/data/invariant-patterns.json");
const ESCALATION_JSON: &str =
    include_str!("../../../packages/core/src/data/escalation.json");

// --- Tool -> Action mapping ---

pub static TOOL_ACTION_MAP: LazyLock<HashMap<String, String>> = LazyLock::new(|| {
    serde_json::from_str(TOOL_ACTION_MAP_JSON).expect("invalid tool-action-map.json")
});

// --- Git action patterns (compiled regex) ---

#[derive(Debug, Deserialize)]
pub struct GitActionPatternRaw {
    pub patterns: Vec<String>,
    #[serde(rename = "actionType")]
    pub action_type: String,
}

pub struct CompiledGitPattern {
    pub patterns: Vec<Regex>,
    pub action_type: String,
}

pub static GIT_ACTION_PATTERNS: LazyLock<Vec<CompiledGitPattern>> = LazyLock::new(|| {
    let raw: Vec<GitActionPatternRaw> =
        serde_json::from_str(GIT_ACTION_PATTERNS_JSON).expect("invalid git-action-patterns.json");
    raw.into_iter()
        .map(|entry| CompiledGitPattern {
            patterns: entry
                .patterns
                .iter()
                .map(|p| Regex::new(p).expect("invalid git regex"))
                .collect(),
            action_type: entry.action_type,
        })
        .collect()
});

// --- Destructive command patterns (compiled regex) ---

#[derive(Debug, Deserialize)]
struct DestructivePatternRaw {
    pattern: String,
    #[allow(dead_code)]
    description: String,
    #[allow(dead_code)]
    #[serde(rename = "riskLevel")]
    risk_level: String,
    #[allow(dead_code)]
    category: String,
    flags: Option<String>,
}

pub struct CompiledDestructivePattern {
    pub pattern: Regex,
}

pub static DESTRUCTIVE_PATTERNS: LazyLock<Vec<CompiledDestructivePattern>> = LazyLock::new(|| {
    let raw: Vec<DestructivePatternRaw> =
        serde_json::from_str(DESTRUCTIVE_PATTERNS_JSON).expect("invalid destructive-patterns.json");
    raw.into_iter()
        .map(|entry| {
            let pat = if entry.flags.as_deref() == Some("i") {
                format!("(?i){}", entry.pattern)
            } else {
                entry.pattern
            };
            CompiledDestructivePattern {
                pattern: Regex::new(&pat).expect("invalid destructive regex"),
            }
        })
        .collect()
});

// --- Blast radius config ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlastRadiusConfig {
    pub default_weights: HashMap<String, f64>,
    pub sensitive_patterns: Vec<String>,
    pub config_patterns: Vec<String>,
    pub risk_thresholds: HashMap<String, f64>,
}

pub static BLAST_RADIUS_CONFIG: LazyLock<BlastRadiusConfig> = LazyLock::new(|| {
    serde_json::from_str(BLAST_RADIUS_JSON).expect("invalid blast-radius.json")
});

// --- Invariant patterns ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvariantPatternsConfig {
    pub sensitive_file_patterns: Vec<String>,
    pub credential_path_patterns: Vec<String>,
    pub credential_basename_patterns: Vec<String>,
    pub container_config_basenames: Vec<String>,
    pub lifecycle_scripts: Vec<String>,
    pub env_file_regex: String,
    pub dockerfile_suffix_regex: String,
}

pub static INVARIANT_PATTERNS: LazyLock<InvariantPatternsConfig> = LazyLock::new(|| {
    serde_json::from_str(INVARIANT_PATTERNS_JSON).expect("invalid invariant-patterns.json")
});

// --- Escalation config ---

#[derive(Debug, Deserialize)]
pub struct EscalationConfig {
    pub levels: HashMap<String, u32>,
    pub defaults: EscalationDefaults,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscalationDefaults {
    pub denial_threshold: u32,
    pub violation_threshold: u32,
    pub window_size: usize,
}

pub static ESCALATION_CONFIG: LazyLock<EscalationConfig> = LazyLock::new(|| {
    serde_json::from_str(ESCALATION_JSON).expect("invalid escalation.json")
});

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_action_map_loads() {
        assert_eq!(TOOL_ACTION_MAP.get("Bash").unwrap(), "shell.exec");
        assert_eq!(TOOL_ACTION_MAP.get("Write").unwrap(), "file.write");
        assert_eq!(TOOL_ACTION_MAP.get("WebFetch").unwrap(), "http.request");
        assert_eq!(TOOL_ACTION_MAP.len(), 13);
    }

    #[test]
    fn test_git_patterns_compile() {
        assert_eq!(GIT_ACTION_PATTERNS.len(), 5);
        assert_eq!(GIT_ACTION_PATTERNS[0].action_type, "git.force-push");
    }

    #[test]
    fn test_destructive_patterns_compile() {
        assert!(DESTRUCTIVE_PATTERNS.len() >= 80);
        // Case-insensitive patterns should match
        let has_drop = DESTRUCTIVE_PATTERNS
            .iter()
            .any(|p| p.pattern.is_match("DROP TABLE users"));
        assert!(has_drop);
        let has_drop_lower = DESTRUCTIVE_PATTERNS
            .iter()
            .any(|p| p.pattern.is_match("drop table users"));
        assert!(has_drop_lower);
    }

    #[test]
    fn test_blast_radius_config_loads() {
        assert_eq!(*BLAST_RADIUS_CONFIG.default_weights.get("delete").unwrap(), 3.0);
        assert_eq!(*BLAST_RADIUS_CONFIG.risk_thresholds.get("high").unwrap(), 50.0);
        assert_eq!(BLAST_RADIUS_CONFIG.sensitive_patterns.len(), 7);
    }

    #[test]
    fn test_escalation_config_loads() {
        assert_eq!(ESCALATION_CONFIG.defaults.denial_threshold, 5);
        assert_eq!(ESCALATION_CONFIG.defaults.violation_threshold, 3);
        assert_eq!(ESCALATION_CONFIG.defaults.window_size, 10);
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cd crates/kernel-core && cargo test data`
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add crates/kernel-core/src/data.rs
git commit -m "feat(rust): embed governance JSON data with LazyLock parsing"
```

---

## Chunk 2: Policy Evaluator

### Task 6: Policy evaluator -- matching functions

**Files:**
- Modify: `crates/kernel-core/src/policy.rs`

Port the two-phase deny-first policy evaluator from `packages/policy/src/evaluator.ts`.

- [ ] **Step 1: Write failing tests for match_action and match_scope**

```rust
use crate::types::*;

pub fn match_action(pattern: &str, action: &str) -> bool { todo!() }
pub fn match_scope(scope_patterns: &[String], target: &str) -> bool { todo!() }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_match_action_exact() {
        assert!(match_action("git.push", "git.push"));
        assert!(!match_action("git.push", "git.merge"));
    }

    #[test]
    fn test_match_action_wildcard() {
        assert!(match_action("*", "git.push"));
        assert!(match_action("*", "file.write"));
    }

    #[test]
    fn test_match_action_prefix_wildcard() {
        assert!(match_action("git.*", "git.push"));
        assert!(match_action("git.*", "git.branch.delete"));
        assert!(!match_action("git.*", "file.write"));
    }

    #[test]
    fn test_match_scope_exact() {
        let scopes = vec!["src/main.rs".into()];
        assert!(match_scope(&scopes, "src/main.rs"));
        assert!(!match_scope(&scopes, "src/lib.rs"));
    }

    #[test]
    fn test_match_scope_prefix() {
        let scopes = vec!["src/".into()];
        assert!(match_scope(&scopes, "src/main.rs"));
        assert!(!match_scope(&scopes, "tests/test.rs"));
    }

    #[test]
    fn test_match_scope_suffix() {
        let scopes = vec!["*.rs".into()];
        assert!(match_scope(&scopes, "src/main.rs"));
        assert!(!match_scope(&scopes, "src/main.ts"));
    }

    #[test]
    fn test_match_scope_star() {
        assert!(match_scope(&["*".into()], "anything"));
    }

    #[test]
    fn test_match_scope_empty_patterns_matches_all() {
        assert!(match_scope(&[], "anything"));
    }

    #[test]
    fn test_match_scope_empty_target() {
        assert!(!match_scope(&["src/".into()], ""));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd crates/kernel-core && cargo test policy`
Expected: FAIL

- [ ] **Step 3: Implement match_action and match_scope**

```rust
pub fn match_action(pattern: &str, action: &str) -> bool {
    if pattern == "*" { return true; }
    if pattern == action { return true; }
    if let Some(prefix) = pattern.strip_suffix(".*") {
        return action.starts_with(&format!("{}.", prefix));
    }
    false
}

pub fn match_scope(scope_patterns: &[String], target: &str) -> bool {
    if scope_patterns.is_empty() { return true; }
    if target.is_empty() { return false; }
    for pattern in scope_patterns {
        if pattern == "*" { return true; }
        if pattern == target { return true; }
        if pattern.ends_with('/') && target.starts_with(pattern.as_str()) { return true; }
        if let Some(suffix) = pattern.strip_prefix('*') {
            if target.ends_with(suffix) { return true; }
        }
    }
    false
}
```

- [ ] **Step 4: Run tests**

Run: `cd crates/kernel-core && cargo test policy`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add crates/kernel-core/src/policy.rs
git commit -m "feat(rust): add action/scope matching for policy evaluator"
```

---

### Task 7: Persona and forecast condition matching

**Files:**
- Modify: `crates/kernel-core/src/policy.rs`

- [ ] **Step 1: Add persona/forecast functions and tests**

Add to `policy.rs` (functions + tests). Persona matching: all specified fields must match (AND). Tags use any-match (OR). Forecast: each field is a >= threshold check.

Full implementation follows the TS `matchPersonaCondition` and `matchForecastCondition` logic exactly. See `packages/policy/src/evaluator.ts:192-275`.

- [ ] **Step 2: Run tests**

Run: `cd crates/kernel-core && cargo test policy`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add crates/kernel-core/src/policy.rs
git commit -m "feat(rust): add persona and forecast condition matching"
```

---

### Task 8: Full two-phase evaluate function

**Files:**
- Modify: `crates/kernel-core/src/policy.rs`

This is the core -- the two-phase deny-first engine with trace generation. Port from `packages/policy/src/evaluator.ts:386-555`.

**Key behaviors to match exactly:**
1. Phase 1: iterate all policies, all rules -- skip non-deny rules (mark as "skipped" in trace). For deny rules: match action patterns, then conditions. First full match returns immediately with deny.
2. Phase 2: iterate all policies, all rules -- skip non-allow rules. For allow rules: match action, then conditions. First full match returns immediately with allow.
3. Default: if no rule matched, use `default_deny` option (true = deny severity 3, false = allow severity 0).
4. `requireTests`/`requireFormat` are gate conditions -- when the flag is true AND the metadata has `testsPass`/`formatPass` = true, the deny rule is **bypassed** (condition returns not-matched).
5. Trace: record every rule evaluation with outcome, condition details, and timing.

- [ ] **Step 1: Write tests for evaluate (deny, allow, deny-before-allow, default, gates, intervention override)**

Tests should cover: simple deny match, simple allow match, deny evaluated before allow, default deny, default allow, scope condition miss, requireTests gate bypass, missing intent action, policy intervention override.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd crates/kernel-core && cargo test policy`
Expected: FAIL

- [ ] **Step 3: Implement evaluate with match_conditions helper**

The `match_conditions` internal function checks: gate conditions (requireTests/requireFormat), scope, limit, branches, persona, forecast -- in that order. Returns a `ConditionMatchResult` struct with all details.

The `evaluate` function iterates two phases with early return, builds `RuleEvaluation` trace entries, and measures timing via `Instant::now()`.

- [ ] **Step 4: Run tests**

Run: `cd crates/kernel-core && cargo test policy`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add crates/kernel-core/src/policy.rs
git commit -m "feat(rust): implement two-phase deny-first policy evaluator with traces"
```

---

## Chunk 3: Action Authorization Boundary

### Task 9: AAB -- normalize, git detection, destructive detection

**Files:**
- Modify: `crates/kernel-core/src/aab.rs`

Port `normalizeIntent`, `detectGitAction`, `isDestructiveCommand`, and `extractBranch` from `packages/kernel/src/aab.ts`.

**Key behaviors:**
- `detectGitAction`: iterate compiled git patterns (force-push checked first), return first match
- `isDestructiveCommand`: iterate compiled destructive patterns, return true on first match
- `extractBranch`: regex `\bgit\s+push\s+\S+\s+(\S+)` to extract target branch
- `normalizeIntent`: map tool to action via TOOL_ACTION_MAP, detect git from shell commands, detect destructive, use command as target when no explicit target for shell actions

- [ ] **Step 1: Write failing tests**

Tests for: git push/force-push/branch-delete/merge/commit detection, non-git returns None, destructive commands (rm -rf, DROP TABLE case insensitive, sudo), non-destructive (echo, ls, cat), branch extraction, normalize with Bash/Write/unknown tools, normalize null input, normalize destructive sets flag, normalize preserves persona.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd crates/kernel-core && cargo test aab`
Expected: FAIL

- [ ] **Step 3: Implement AAB functions**

Use `LazyLock<Regex>` for branch extraction regex. Reference `data::TOOL_ACTION_MAP`, `data::GIT_ACTION_PATTERNS`, `data::DESTRUCTIVE_PATTERNS`.

- [ ] **Step 4: Run tests**

Run: `cd crates/kernel-core && cargo test aab`
Expected: all tests PASS

- [ ] **Step 5: Run full test suite**

Run: `cd crates/kernel-core && cargo test`
Expected: all tests across all modules PASS

- [ ] **Step 6: Commit**

```bash
git add crates/kernel-core/src/aab.rs
git commit -m "feat(rust): implement AAB with normalize, git detection, destructive detection"
```

---

### Task 10: Final lib.rs re-exports and quality checks

**Files:**
- Modify: `crates/kernel-core/src/lib.rs`

- [ ] **Step 1: Update lib.rs with re-exports**

```rust
pub mod hash;
pub mod types;
pub mod actions;
pub mod data;
pub mod policy;
pub mod aab;

pub use types::*;
pub use actions::{ActionType, ActionClass};
pub use policy::evaluate;
pub use aab::{normalize_intent, detect_git_action, is_destructive_command};
pub use hash::simple_hash;
```

- [ ] **Step 2: Run full test suite**

Run: `cd crates/kernel-core && cargo test`
Expected: all tests PASS

- [ ] **Step 3: Run clippy**

Run: `cd crates/kernel-core && cargo clippy -- -D warnings`
Expected: no warnings

- [ ] **Step 4: Commit**

```bash
git add crates/kernel-core/src/lib.rs
git commit -m "feat(rust): add lib.rs re-exports for kernel-core public API"
```

---

## Summary

**P1 delivers:**
- `kernel-core` crate with zero runtime I/O
- All core types with serde camelCase serialization (TS-compatible JSON)
- 23 `ActionType` variants + class mapping
- Embedded governance data (7 JSON files) via `include_str!()` + `LazyLock`
- Two-phase deny-first policy evaluator with full trace generation
- AAB: `normalize_intent`, `detect_git_action`, `is_destructive_command`
- `simple_hash` port with UTF-16 parity
- ~50+ unit tests covering all modules

**P2 (next plan) will add:**
- `invariants.rs` -- 20 built-in invariant checks
- `blast.rs` -- weighted blast radius computation
- `monitor.rs` -- escalation state machine
- `decision.rs` -- full context enrichment + intervention selection
- `evidence.rs` -- evidence pack generation
- `events.rs` -- event factory

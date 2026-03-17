use regex::Regex;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::LazyLock;

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
const ESCALATION_JSON: &str = include_str!("../../../packages/core/src/data/escalation.json");

// --- Tool -> Action mapping ---

pub static TOOL_ACTION_MAP: LazyLock<HashMap<String, String>> = LazyLock::new(|| {
    serde_json::from_str(TOOL_ACTION_MAP_JSON).expect("invalid tool-action-map.json")
});

// --- Git action patterns (compiled regex) ---

#[derive(Debug, Deserialize)]
struct GitActionPatternRaw {
    patterns: Vec<String>,
    #[serde(rename = "actionType")]
    action_type: String,
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
    let raw: Vec<DestructivePatternRaw> = serde_json::from_str(DESTRUCTIVE_PATTERNS_JSON)
        .expect("invalid destructive-patterns.json");
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

pub static BLAST_RADIUS_CONFIG: LazyLock<BlastRadiusConfig> =
    LazyLock::new(|| serde_json::from_str(BLAST_RADIUS_JSON).expect("invalid blast-radius.json"));

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

pub static ESCALATION_CONFIG: LazyLock<EscalationConfig> =
    LazyLock::new(|| serde_json::from_str(ESCALATION_JSON).expect("invalid escalation.json"));

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_action_map_loads() {
        assert_eq!(TOOL_ACTION_MAP.get("Bash").unwrap(), "shell.exec");
        assert_eq!(TOOL_ACTION_MAP.get("Write").unwrap(), "file.write");
        assert_eq!(TOOL_ACTION_MAP.get("WebFetch").unwrap(), "http.request");
        assert_eq!(TOOL_ACTION_MAP.len(), 21);
    }

    #[test]
    fn test_git_patterns_compile() {
        assert_eq!(GIT_ACTION_PATTERNS.len(), 5);
        assert_eq!(GIT_ACTION_PATTERNS[0].action_type, "git.force-push");
    }

    #[test]
    fn test_destructive_patterns_compile() {
        assert!(DESTRUCTIVE_PATTERNS.len() >= 80);
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
        assert_eq!(
            *BLAST_RADIUS_CONFIG.default_weights.get("delete").unwrap(),
            3.0
        );
        assert_eq!(
            *BLAST_RADIUS_CONFIG.risk_thresholds.get("high").unwrap(),
            50.0
        );
        assert_eq!(BLAST_RADIUS_CONFIG.sensitive_patterns.len(), 7);
    }

    #[test]
    fn test_escalation_config_loads() {
        assert_eq!(ESCALATION_CONFIG.defaults.denial_threshold, 5);
        assert_eq!(ESCALATION_CONFIG.defaults.violation_threshold, 3);
        assert_eq!(ESCALATION_CONFIG.defaults.window_size, 300000);
    }
}

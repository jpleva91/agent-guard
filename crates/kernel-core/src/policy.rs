use std::time::Instant;

use crate::types::*;

/// Match an action pattern against an action string.
/// Supports: exact match, wildcard "*", prefix wildcard "git.*".
pub fn match_action(pattern: &str, action: &str) -> bool {
    if pattern == "*" {
        return true;
    }
    if pattern == action {
        return true;
    }
    if let Some(prefix) = pattern.strip_suffix(".*") {
        return action.starts_with(&format!("{}.", prefix));
    }
    false
}

/// Match scope patterns against a target.
/// Supports: "*", exact, prefix "/" (directory), suffix "*" (extension).
pub fn match_scope(scope_patterns: &[String], target: &str) -> bool {
    if scope_patterns.is_empty() {
        return true;
    }
    if target.is_empty() {
        return false;
    }
    for pattern in scope_patterns {
        if pattern == "*" {
            return true;
        }
        if pattern == target {
            return true;
        }
        if pattern.ends_with('/') && target.starts_with(pattern.as_str()) {
            return true;
        }
        if let Some(suffix) = pattern.strip_prefix('*') {
            if target.ends_with(suffix) {
                return true;
            }
        }
    }
    false
}

/// Match persona condition against an agent persona.
/// All specified fields must match (AND). Tags use any-match (OR).
pub fn match_persona(condition: &PersonaCondition, persona: Option<&AgentPersona>) -> bool {
    let Some(persona) = persona else {
        return false;
    };

    if let Some(tiers) = &condition.trust_tier {
        if !tiers.is_empty() {
            match &persona.trust_tier {
                Some(t) if tiers.contains(t) => {}
                _ => return false,
            }
        }
    }
    if let Some(roles) = &condition.role {
        if !roles.is_empty() {
            match &persona.role {
                Some(r) if roles.contains(r) => {}
                _ => return false,
            }
        }
    }
    if let Some(autonomies) = &condition.autonomy {
        if !autonomies.is_empty() {
            match &persona.autonomy {
                Some(a) if autonomies.contains(a) => {}
                _ => return false,
            }
        }
    }
    if let Some(tolerances) = &condition.risk_tolerance {
        if !tolerances.is_empty() {
            match &persona.risk_tolerance {
                Some(rt) if tolerances.contains(rt) => {}
                _ => return false,
            }
        }
    }
    if let Some(cond_tags) = &condition.tags {
        if !cond_tags.is_empty() {
            match &persona.tags {
                Some(ptags) if cond_tags.iter().any(|t| ptags.contains(t)) => {}
                _ => return false,
            }
        }
    }
    true
}

/// Match forecast condition against intent forecast data.
/// Each numeric field is a >= threshold check. riskLevel is set inclusion.
pub fn match_forecast(
    condition: &ForecastCondition,
    forecast: Option<&IntentForecast>,
) -> (bool, ForecastMatchValues) {
    let Some(forecast) = forecast else {
        return (false, ForecastMatchValues::default());
    };

    let mut values = ForecastMatchValues::default();

    if let Some(threshold) = condition.test_risk_score {
        values.test_risk_score = Some(ThresholdMatch {
            actual: forecast.test_risk_score,
            threshold,
        });
        if forecast.test_risk_score < threshold {
            return (false, values);
        }
    }

    if let Some(threshold) = condition.blast_radius_score {
        values.blast_radius_score = Some(ThresholdMatch {
            actual: forecast.blast_radius_score,
            threshold,
        });
        if forecast.blast_radius_score < threshold {
            return (false, values);
        }
    }

    if let Some(ref levels) = condition.risk_level {
        if !levels.is_empty() {
            values.risk_level = Some(RiskLevelMatch {
                actual: forecast.risk_level,
                required: levels.clone(),
            });
            if !levels.contains(&forecast.risk_level) {
                return (false, values);
            }
        }
    }

    if let Some(threshold) = condition.predicted_file_count {
        let actual = forecast.predicted_files.len() as f64;
        values.predicted_file_count = Some(ThresholdMatch {
            actual,
            threshold: threshold as f64,
        });
        if (forecast.predicted_files.len() as u32) < threshold {
            return (false, values);
        }
    }

    if let Some(threshold) = condition.dependency_count {
        let actual = forecast.dependencies_affected.len() as f64;
        values.dependency_count = Some(ThresholdMatch {
            actual,
            threshold: threshold as f64,
        });
        if (forecast.dependencies_affected.len() as u32) < threshold {
            return (false, values);
        }
    }

    (true, values)
}

// --- Internal condition matching ---

#[derive(Debug, Default)]
struct ConditionMatchResult {
    matched: bool,
    scope_matched: Option<bool>,
    limit_exceeded: Option<bool>,
    branch_matched: Option<bool>,
    persona_matched: Option<bool>,
    forecast_matched: Option<bool>,
    forecast_values: Option<ForecastMatchValues>,
}

fn match_conditions(
    conditions: Option<&PolicyConditions>,
    intent: &NormalizedIntent,
) -> ConditionMatchResult {
    let Some(cond) = conditions else {
        return ConditionMatchResult {
            matched: true,
            ..Default::default()
        };
    };

    // Gate conditions: bypass deny rule when flag is satisfied
    if cond.require_tests == Some(true) {
        if let Some(meta) = &intent.metadata {
            if meta.get("testsPass") == Some(&serde_json::Value::Bool(true)) {
                return ConditionMatchResult {
                    matched: false,
                    ..Default::default()
                };
            }
        }
    }
    if cond.require_format == Some(true) {
        if let Some(meta) = &intent.metadata {
            if meta.get("formatPass") == Some(&serde_json::Value::Bool(true)) {
                return ConditionMatchResult {
                    matched: false,
                    ..Default::default()
                };
            }
        }
    }

    if let Some(ref scope) = cond.scope {
        if !match_scope(scope, &intent.target) {
            return ConditionMatchResult {
                matched: false,
                scope_matched: Some(false),
                ..Default::default()
            };
        }
    }

    let scope_matched = cond.scope.as_ref().map(|_| true);
    let mut limit_exceeded = None;
    let mut branch_matched = None;

    if let Some(limit) = cond.limit {
        if let Some(files) = intent.files_affected {
            limit_exceeded = Some(files as f64 > limit);
            if limit_exceeded == Some(true) {
                return ConditionMatchResult {
                    matched: true,
                    scope_matched,
                    limit_exceeded,
                    ..Default::default()
                };
            }
        }
    }

    if let Some(ref branches) = cond.branches {
        if let Some(ref branch) = intent.branch {
            branch_matched = Some(branches.contains(branch));
            if branch_matched == Some(true) {
                return ConditionMatchResult {
                    matched: true,
                    scope_matched,
                    limit_exceeded,
                    branch_matched,
                    ..Default::default()
                };
            }
        }
    }

    let mut persona_matched = None;
    if let Some(ref persona_cond) = cond.persona {
        persona_matched = Some(match_persona(persona_cond, intent.persona.as_ref()));
        if persona_matched == Some(false) {
            return ConditionMatchResult {
                matched: false,
                scope_matched,
                limit_exceeded,
                branch_matched,
                persona_matched,
                ..Default::default()
            };
        }
    }

    let mut forecast_matched = None;
    let mut forecast_values = None;
    if let Some(ref forecast_cond) = cond.forecast {
        let (fm, fv) = match_forecast(forecast_cond, intent.forecast.as_ref());
        forecast_matched = Some(fm);
        forecast_values = Some(fv);
        if !fm {
            return ConditionMatchResult {
                matched: false,
                scope_matched,
                limit_exceeded,
                branch_matched,
                persona_matched,
                forecast_matched,
                forecast_values,
            };
        }
    }

    ConditionMatchResult {
        matched: true,
        scope_matched,
        limit_exceeded,
        branch_matched,
        persona_matched,
        forecast_matched,
        forecast_values,
    }
}

fn make_rule_eval(
    policy: &LoadedPolicy,
    rule_index: u32,
    rule: &PolicyRule,
    action_matched: bool,
    cond_result: Option<&ConditionMatchResult>,
    outcome: RuleOutcome,
) -> RuleEvaluation {
    RuleEvaluation {
        policy_id: policy.id.clone(),
        policy_name: policy.name.clone(),
        rule_index,
        rule: rule.clone(),
        action_matched,
        conditions_matched: cond_result.map_or(false, |c| c.matched),
        condition_details: match cond_result {
            Some(c) => ConditionDetails {
                scope_matched: c.scope_matched,
                limit_exceeded: c.limit_exceeded,
                branch_matched: c.branch_matched,
                persona_matched: c.persona_matched,
                forecast_matched: c.forecast_matched,
                forecast_values: c.forecast_values.clone(),
            },
            None => ConditionDetails::default(),
        },
        outcome,
    }
}

/// Two-phase deny-first policy evaluation.
///
/// Phase 1: All deny rules across all policies. First deny match -> denied.
/// Phase 2: All allow rules across all policies. First allow match -> allowed.
/// Default: If no rule matched, apply default_deny (true = deny, false = allow).
pub fn evaluate(
    intent: &NormalizedIntent,
    policies: &[LoadedPolicy],
    options: &EvaluateOptions,
) -> EvalResult {
    let start = Instant::now();
    let mut rules_evaluated: Vec<RuleEvaluation> = Vec::new();

    if intent.action.is_empty() {
        return EvalResult {
            allowed: false,
            decision: Effect::Deny,
            matched_rule: None,
            matched_policy: None,
            reason: "Intent is missing required field: action".into(),
            severity: 5,
            trace: Some(PolicyEvaluationTrace {
                rules_evaluated: vec![],
                total_rules_checked: 0,
                phase_that_matched: None,
                duration_ms: start.elapsed().as_secs_f64() * 1000.0,
            }),
            policy_intervention: None,
        };
    }

    // Phase 1: Deny rules
    for policy in policies {
        for (rule_index, rule) in policy.rules.iter().enumerate() {
            if rule.effect != Effect::Deny {
                rules_evaluated.push(make_rule_eval(
                    policy,
                    rule_index as u32,
                    rule,
                    false,
                    None,
                    RuleOutcome::Skipped,
                ));
                continue;
            }

            let actions = rule.action.patterns();
            let action_matched = actions.iter().any(|p| match_action(p, &intent.action));

            if !action_matched {
                rules_evaluated.push(make_rule_eval(
                    policy,
                    rule_index as u32,
                    rule,
                    false,
                    None,
                    RuleOutcome::NoMatch,
                ));
                continue;
            }

            let cond_result = match_conditions(rule.conditions.as_ref(), intent);

            if cond_result.matched {
                rules_evaluated.push(make_rule_eval(
                    policy,
                    rule_index as u32,
                    rule,
                    true,
                    Some(&cond_result),
                    RuleOutcome::Match,
                ));
                return EvalResult {
                    allowed: false,
                    decision: Effect::Deny,
                    matched_rule: Some(rule.clone()),
                    matched_policy: Some(policy.clone()),
                    reason: rule
                        .reason
                        .clone()
                        .unwrap_or_else(|| format!("Denied by policy \"{}\"", policy.name)),
                    severity: policy.severity,
                    policy_intervention: rule.intervention,
                    trace: Some(PolicyEvaluationTrace {
                        total_rules_checked: rules_evaluated.len() as u32,
                        rules_evaluated,
                        phase_that_matched: Some(EvalPhase::Deny),
                        duration_ms: start.elapsed().as_secs_f64() * 1000.0,
                    }),
                };
            }

            rules_evaluated.push(make_rule_eval(
                policy,
                rule_index as u32,
                rule,
                true,
                Some(&cond_result),
                RuleOutcome::NoMatch,
            ));
        }
    }

    // Phase 2: Allow rules
    for policy in policies {
        for (rule_index, rule) in policy.rules.iter().enumerate() {
            if rule.effect != Effect::Allow {
                continue;
            }

            let actions = rule.action.patterns();
            let action_matched = actions.iter().any(|p| match_action(p, &intent.action));

            if !action_matched {
                rules_evaluated.push(make_rule_eval(
                    policy,
                    rule_index as u32,
                    rule,
                    false,
                    None,
                    RuleOutcome::NoMatch,
                ));
                continue;
            }

            let cond_result = match_conditions(rule.conditions.as_ref(), intent);

            if cond_result.matched {
                rules_evaluated.push(make_rule_eval(
                    policy,
                    rule_index as u32,
                    rule,
                    true,
                    Some(&cond_result),
                    RuleOutcome::Match,
                ));
                let non_skipped = rules_evaluated
                    .iter()
                    .filter(|r| r.outcome != RuleOutcome::Skipped)
                    .count() as u32;
                return EvalResult {
                    allowed: true,
                    decision: Effect::Allow,
                    matched_rule: Some(rule.clone()),
                    matched_policy: Some(policy.clone()),
                    reason: rule
                        .reason
                        .clone()
                        .unwrap_or_else(|| format!("Allowed by policy \"{}\"", policy.name)),
                    severity: 0,
                    policy_intervention: None,
                    trace: Some(PolicyEvaluationTrace {
                        total_rules_checked: non_skipped,
                        rules_evaluated,
                        phase_that_matched: Some(EvalPhase::Allow),
                        duration_ms: start.elapsed().as_secs_f64() * 1000.0,
                    }),
                };
            }

            rules_evaluated.push(make_rule_eval(
                policy,
                rule_index as u32,
                rule,
                true,
                Some(&cond_result),
                RuleOutcome::NoMatch,
            ));
        }
    }

    // Default
    let non_skipped = rules_evaluated
        .iter()
        .filter(|r| r.outcome != RuleOutcome::Skipped)
        .count() as u32;
    let duration_ms = start.elapsed().as_secs_f64() * 1000.0;

    if options.default_deny {
        EvalResult {
            allowed: false,
            decision: Effect::Deny,
            matched_rule: None,
            matched_policy: None,
            reason: "No matching policy rule \u{2014} default deny (fail-closed)".into(),
            severity: 3,
            policy_intervention: None,
            trace: Some(PolicyEvaluationTrace {
                total_rules_checked: non_skipped,
                rules_evaluated,
                phase_that_matched: Some(EvalPhase::Default),
                duration_ms,
            }),
        }
    } else {
        EvalResult {
            allowed: true,
            decision: Effect::Allow,
            matched_rule: None,
            matched_policy: None,
            reason: "No matching policy rule \u{2014} default allow (fail-open)".into(),
            severity: 0,
            policy_intervention: None,
            trace: Some(PolicyEvaluationTrace {
                total_rules_checked: non_skipped,
                rules_evaluated,
                phase_that_matched: Some(EvalPhase::Default),
                duration_ms,
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn make_intent(action: &str, target: &str) -> NormalizedIntent {
        NormalizedIntent {
            action: action.into(),
            target: target.into(),
            agent: "claude".into(),
            destructive: false,
            branch: None,
            command: None,
            files_affected: None,
            metadata: None,
            persona: None,
            forecast: None,
        }
    }

    fn make_policy(id: &str, name: &str, severity: u8, rules: Vec<PolicyRule>) -> LoadedPolicy {
        LoadedPolicy {
            id: id.into(),
            name: name.into(),
            description: None,
            severity,
            persona: None,
            rules,
        }
    }

    fn deny_rule(action: &str, reason: &str) -> PolicyRule {
        PolicyRule {
            action: ActionPattern::Single(action.into()),
            effect: Effect::Deny,
            conditions: None,
            reason: Some(reason.into()),
            intervention: None,
        }
    }

    fn allow_rule(action: &str, reason: &str) -> PolicyRule {
        PolicyRule {
            action: ActionPattern::Single(action.into()),
            effect: Effect::Allow,
            conditions: None,
            reason: Some(reason.into()),
            intervention: None,
        }
    }

    // --- match_action ---

    #[test]
    fn test_match_action_exact() {
        assert!(match_action("git.push", "git.push"));
        assert!(!match_action("git.push", "git.merge"));
    }

    #[test]
    fn test_match_action_wildcard() {
        assert!(match_action("*", "git.push"));
    }

    #[test]
    fn test_match_action_prefix_wildcard() {
        assert!(match_action("git.*", "git.push"));
        assert!(match_action("git.*", "git.branch.delete"));
        assert!(!match_action("git.*", "file.write"));
    }

    // --- match_scope ---

    #[test]
    fn test_match_scope_exact() {
        assert!(match_scope(&["src/main.rs".into()], "src/main.rs"));
        assert!(!match_scope(&["src/main.rs".into()], "src/lib.rs"));
    }

    #[test]
    fn test_match_scope_prefix() {
        assert!(match_scope(&["src/".into()], "src/main.rs"));
        assert!(!match_scope(&["src/".into()], "tests/test.rs"));
    }

    #[test]
    fn test_match_scope_suffix() {
        assert!(match_scope(&["*.rs".into()], "src/main.rs"));
        assert!(!match_scope(&["*.rs".into()], "src/main.ts"));
    }

    #[test]
    fn test_match_scope_star() {
        assert!(match_scope(&["*".into()], "anything"));
    }

    #[test]
    fn test_match_scope_empty() {
        assert!(match_scope(&[], "anything"));
    }

    #[test]
    fn test_match_scope_empty_target() {
        assert!(!match_scope(&["src/".into()], ""));
    }

    // --- persona ---

    #[test]
    fn test_persona_match_trust_tier() {
        let cond = PersonaCondition {
            trust_tier: Some(vec!["high".into()]),
            role: None,
            autonomy: None,
            risk_tolerance: None,
            tags: None,
        };
        let persona = AgentPersona {
            trust_tier: Some("high".into()),
            ..Default::default()
        };
        assert!(match_persona(&cond, Some(&persona)));
    }

    #[test]
    fn test_persona_no_persona_fails() {
        let cond = PersonaCondition {
            trust_tier: Some(vec!["high".into()]),
            role: None,
            autonomy: None,
            risk_tolerance: None,
            tags: None,
        };
        assert!(!match_persona(&cond, None));
    }

    #[test]
    fn test_persona_tags_any_match() {
        let cond = PersonaCondition {
            tags: Some(vec!["deploy".into(), "admin".into()]),
            trust_tier: None,
            role: None,
            autonomy: None,
            risk_tolerance: None,
        };
        let persona = AgentPersona {
            tags: Some(vec!["admin".into(), "dev".into()]),
            ..Default::default()
        };
        assert!(match_persona(&cond, Some(&persona)));
    }

    // --- forecast ---

    #[test]
    fn test_forecast_above_threshold() {
        let cond = ForecastCondition {
            test_risk_score: Some(50.0),
            blast_radius_score: None,
            risk_level: None,
            predicted_file_count: None,
            dependency_count: None,
        };
        let forecast = IntentForecast {
            test_risk_score: 60.0,
            blast_radius_score: 0.0,
            risk_level: RiskLevel::Medium,
            predicted_files: vec![],
            dependencies_affected: vec![],
        };
        let (matched, values) = match_forecast(&cond, Some(&forecast));
        assert!(matched);
        assert_eq!(values.test_risk_score.unwrap().actual, 60.0);
    }

    #[test]
    fn test_forecast_below_threshold() {
        let cond = ForecastCondition {
            test_risk_score: Some(50.0),
            blast_radius_score: None,
            risk_level: None,
            predicted_file_count: None,
            dependency_count: None,
        };
        let forecast = IntentForecast {
            test_risk_score: 30.0,
            blast_radius_score: 0.0,
            risk_level: RiskLevel::Low,
            predicted_files: vec![],
            dependencies_affected: vec![],
        };
        let (matched, _) = match_forecast(&cond, Some(&forecast));
        assert!(!matched);
    }

    #[test]
    fn test_forecast_none_fails() {
        let cond = ForecastCondition {
            test_risk_score: Some(50.0),
            blast_radius_score: None,
            risk_level: None,
            predicted_file_count: None,
            dependency_count: None,
        };
        let (matched, _) = match_forecast(&cond, None);
        assert!(!matched);
    }

    // --- evaluate ---

    #[test]
    fn test_deny_rule_matches() {
        let intent = make_intent("git.push", "main");
        let policy = make_policy("p1", "test", 5, vec![deny_rule("git.push", "no push")]);
        let result = evaluate(&intent, &[policy], &EvaluateOptions::default());
        assert!(!result.allowed);
        assert_eq!(result.decision, Effect::Deny);
        assert_eq!(result.reason, "no push");
        assert_eq!(result.severity, 5);
        assert_eq!(
            result.trace.as_ref().unwrap().phase_that_matched,
            Some(EvalPhase::Deny)
        );
    }

    #[test]
    fn test_allow_rule_matches() {
        let intent = make_intent("file.read", "src/main.rs");
        let policy = make_policy("p1", "test", 3, vec![allow_rule("file.read", "reads ok")]);
        let result = evaluate(&intent, &[policy], &EvaluateOptions::default());
        assert!(result.allowed);
        assert_eq!(
            result.trace.as_ref().unwrap().phase_that_matched,
            Some(EvalPhase::Allow)
        );
    }

    #[test]
    fn test_deny_before_allow() {
        let intent = make_intent("git.push", "main");
        let policy = make_policy(
            "p1",
            "test",
            4,
            vec![
                allow_rule("git.push", "allow push"),
                deny_rule("git.push", "deny push"),
            ],
        );
        let result = evaluate(&intent, &[policy], &EvaluateOptions::default());
        assert!(!result.allowed);
        assert_eq!(result.reason, "deny push");
    }

    #[test]
    fn test_default_deny() {
        let intent = make_intent("file.write", "foo.txt");
        let result = evaluate(&intent, &[], &EvaluateOptions::default());
        assert!(!result.allowed);
        assert_eq!(result.severity, 3);
        assert_eq!(
            result.trace.as_ref().unwrap().phase_that_matched,
            Some(EvalPhase::Default)
        );
    }

    #[test]
    fn test_default_allow() {
        let intent = make_intent("file.write", "foo.txt");
        let opts = EvaluateOptions {
            default_deny: false,
        };
        let result = evaluate(&intent, &[], &opts);
        assert!(result.allowed);
        assert_eq!(result.severity, 0);
    }

    #[test]
    fn test_scope_condition_miss() {
        let intent = make_intent("file.write", "src/main.rs");
        let policy = make_policy(
            "p1",
            "test",
            4,
            vec![PolicyRule {
                action: ActionPattern::Single("file.write".into()),
                effect: Effect::Deny,
                conditions: Some(PolicyConditions {
                    scope: Some(vec!["tests/".into()]),
                    limit: None,
                    branches: None,
                    require_tests: None,
                    require_format: None,
                    persona: None,
                    forecast: None,
                }),
                reason: Some("no writes to tests".into()),
                intervention: None,
            }],
        );
        let result = evaluate(&intent, &[policy], &EvaluateOptions::default());
        assert!(!result.allowed);
        assert_eq!(
            result.trace.as_ref().unwrap().phase_that_matched,
            Some(EvalPhase::Default)
        );
    }

    #[test]
    fn test_require_tests_gate() {
        let policy = make_policy(
            "p1",
            "test",
            4,
            vec![PolicyRule {
                action: ActionPattern::Single("git.push".into()),
                effect: Effect::Deny,
                conditions: Some(PolicyConditions {
                    require_tests: Some(true),
                    scope: None,
                    limit: None,
                    branches: None,
                    require_format: None,
                    persona: None,
                    forecast: None,
                }),
                reason: Some("tests must pass".into()),
                intervention: None,
            }],
        );

        // With testsPass=true, gate bypasses the deny rule
        let mut intent = make_intent("git.push", "origin");
        intent.metadata = Some(HashMap::from([(
            "testsPass".into(),
            serde_json::Value::Bool(true),
        )]));
        let result = evaluate(&intent, &[policy.clone()], &EvaluateOptions::default());
        assert_eq!(
            result.trace.as_ref().unwrap().phase_that_matched,
            Some(EvalPhase::Default)
        );

        // Without testsPass, the deny rule should match
        let intent2 = make_intent("git.push", "origin");
        let result2 = evaluate(&intent2, &[policy], &EvaluateOptions::default());
        assert_eq!(result2.reason, "tests must pass");
    }

    #[test]
    fn test_missing_intent_action() {
        let intent = make_intent("", "");
        let result = evaluate(&intent, &[], &EvaluateOptions::default());
        assert!(!result.allowed);
        assert_eq!(result.severity, 5);
    }

    #[test]
    fn test_policy_intervention_override() {
        let intent = make_intent("git.push", "main");
        let policy = make_policy(
            "p1",
            "test",
            4,
            vec![PolicyRule {
                action: ActionPattern::Single("git.push".into()),
                effect: Effect::Deny,
                conditions: None,
                reason: Some("paused".into()),
                intervention: Some(Intervention::Pause),
            }],
        );
        let result = evaluate(&intent, &[policy], &EvaluateOptions::default());
        assert_eq!(result.policy_intervention, Some(Intervention::Pause));
    }

    #[test]
    fn test_wildcard_action_pattern() {
        let intent = make_intent("git.push", "main");
        let policy = make_policy(
            "p1",
            "test",
            4,
            vec![deny_rule("git.*", "no git operations")],
        );
        let result = evaluate(&intent, &[policy], &EvaluateOptions::default());
        assert!(!result.allowed);
        assert_eq!(result.reason, "no git operations");
    }

    #[test]
    fn test_multiple_action_patterns() {
        let intent = make_intent("git.merge", "feature");
        let policy = make_policy(
            "p1",
            "test",
            4,
            vec![PolicyRule {
                action: ActionPattern::Multiple(vec!["git.push".into(), "git.merge".into()]),
                effect: Effect::Deny,
                conditions: None,
                reason: Some("no push or merge".into()),
                intervention: None,
            }],
        );
        let result = evaluate(&intent, &[policy], &EvaluateOptions::default());
        assert!(!result.allowed);
        assert_eq!(result.reason, "no push or merge");
    }
}

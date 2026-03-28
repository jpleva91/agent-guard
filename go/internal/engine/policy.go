// Package engine provides multi-phase policy evaluation for the AgentGuard kernel.
package engine

import (
	"strings"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
)

// EvalOptions controls evaluation behavior.
type EvalOptions struct {
	DefaultDeny bool
}

// Evaluate runs multi-phase policy evaluation against an ActionContext.
// Phase 1: deny rules (first match wins).
// Phase 2: allow rules (first match wins).
// Phase 3: default decision based on DefaultDeny option.
func Evaluate(ctx action.ActionContext, policies []*action.LoadedPolicy, opts *EvalOptions) action.EvalResult {
	if opts == nil {
		opts = &EvalOptions{}
	}

	// Phase 1: Check deny rules across all policies
	for _, policy := range policies {
		for i := range policy.Rules {
			rule := &policy.Rules[i]
			if rule.Effect != "deny" {
				continue
			}
			if matchesRule(ctx, rule) {
				return action.EvalResult{
					Allowed:          false,
					Decision:         "deny",
					MatchedRule:      rule,
					MatchedPolicy:    policy,
					Reason:           rule.Reason,
					Severity:         policy.Severity,
					Suggestion:       rule.Suggestion,
					CorrectedCommand: rule.CorrectedCommand,
					Intervention:     rule.Intervention,
				}
			}
		}
	}

	// Phase 2: Check allow rules
	for _, policy := range policies {
		for i := range policy.Rules {
			rule := &policy.Rules[i]
			if rule.Effect != "allow" {
				continue
			}
			if matchesRule(ctx, rule) {
				return action.EvalResult{
					Allowed:       true,
					Decision:      "allow",
					MatchedRule:   rule,
					MatchedPolicy: policy,
					Reason:        rule.Reason,
					Severity:      policy.Severity,
				}
			}
		}
	}

	// Phase 3: Default decision
	if opts.DefaultDeny {
		return action.EvalResult{
			Allowed:  false,
			Decision: "deny",
			Reason:   "No matching policy rule — default deny (fail-closed)",
			Severity: 5,
		}
	}
	return action.EvalResult{
		Allowed:  true,
		Decision: "allow",
		Reason:   "No matching policy rule — default allow (fail-open)",
		Severity: 0,
	}
}

// matchesRule checks if an ActionContext matches a PolicyRule.
func matchesRule(ctx action.ActionContext, rule *action.PolicyRule) bool {
	// Action must match
	if !matchesAction(ctx.Action, rule.Action) {
		return false
	}

	// Branch condition (from flattened or conditions)
	branches := rule.Branches
	if rule.Conditions != nil && len(rule.Conditions.Branches) > 0 {
		branches = rule.Conditions.Branches
	}
	if len(branches) > 0 {
		if ctx.Branch == "" {
			// No branch info — for deny rules, assume match (fail-closed)
			if rule.Effect == "deny" {
				return true
			}
			return false
		}
		branchMatched := false
		for _, b := range branches {
			if b == ctx.Branch {
				branchMatched = true
				break
			}
		}
		if !branchMatched {
			return false
		}
	}

	// Target/scope condition
	target := rule.Target
	if rule.Conditions != nil && len(rule.Conditions.Scope) > 0 {
		target = rule.Conditions.Scope[0]
	}
	if target != "" {
		// Target is a substring match on command or target
		cmdLower := strings.ToLower(ctx.Command)
		targetLower := strings.ToLower(ctx.Target)
		scopeLower := strings.ToLower(target)
		if !strings.Contains(cmdLower, scopeLower) && !strings.Contains(targetLower, scopeLower) {
			return false
		}
	}

	return true
}

// matchesAction checks if an action type matches any of the rule's action patterns.
// Supports:
//   - "*" wildcard (matches any action type)
//   - Exact match: "git.push" matches "git.push"
//   - Namespace wildcard: "git.*" matches "git.push", "git.commit" (but not "file.write")
func matchesAction(actionType string, patterns action.StringOrSlice) bool {
	for _, p := range patterns {
		if p == "*" || p == actionType {
			return true
		}
		// Namespace wildcard: e.g. "git.*" matches "git.push"
		if strings.HasSuffix(p, ".*") {
			namespace := p[:len(p)-2] // strip ".*"
			if strings.HasPrefix(actionType, namespace+".") {
				return true
			}
		}
	}
	return false
}

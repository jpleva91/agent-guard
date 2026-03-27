package engine_test

import (
	"testing"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
	"github.com/AgentGuardHQ/agentguard/go/internal/engine"
)

func testPolicy() *action.LoadedPolicy {
	return &action.LoadedPolicy{
		ID:       "test",
		Name:     "Test",
		Severity: 4,
		Rules: []action.PolicyRule{
			{Action: action.StringOrSlice{"git.push"}, Effect: "deny", Branches: []string{"main", "master"}, Reason: "No push to main"},
			{Action: action.StringOrSlice{"shell.exec"}, Effect: "deny", Target: "rm -rf", Reason: "Destructive blocked"},
			{Action: action.StringOrSlice{"file.read"}, Effect: "allow", Reason: "Reading safe"},
			{Action: action.StringOrSlice{"shell.exec"}, Effect: "allow", Reason: "Shell allowed"},
			{Action: action.StringOrSlice{"git.push"}, Effect: "allow", Reason: "Push to feature branches allowed"},
		},
	}
}

func TestDenyGitPushToMain(t *testing.T) {
	ctx := action.ActionContext{Action: "git.push", Branch: "main"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{testPolicy()}, &engine.EvalOptions{DefaultDeny: true})
	if result.Allowed {
		t.Error("expected denied for push to main")
	}
	if result.Reason != "No push to main" {
		t.Errorf("expected 'No push to main', got '%s'", result.Reason)
	}
}

func TestDenyGitPushToMaster(t *testing.T) {
	ctx := action.ActionContext{Action: "git.push", Branch: "master"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{testPolicy()}, &engine.EvalOptions{DefaultDeny: true})
	if result.Allowed {
		t.Error("expected denied for push to master")
	}
}

func TestAllowGitPushToFeature(t *testing.T) {
	ctx := action.ActionContext{Action: "git.push", Branch: "fix/foo"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{testPolicy()}, &engine.EvalOptions{DefaultDeny: true})
	if !result.Allowed {
		t.Errorf("expected allowed for push to fix/foo, got denied: %s", result.Reason)
	}
}

func TestAllowFileRead(t *testing.T) {
	ctx := action.ActionContext{Action: "file.read"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{testPolicy()}, &engine.EvalOptions{DefaultDeny: true})
	if !result.Allowed {
		t.Error("expected allowed for file.read")
	}
}

func TestDefaultDenyUnknownAction(t *testing.T) {
	ctx := action.ActionContext{Action: "deploy.trigger"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{testPolicy()}, &engine.EvalOptions{DefaultDeny: true})
	if result.Allowed {
		t.Error("expected denied for unmatched action with defaultDeny")
	}
}

func TestDefaultAllowUnknownAction(t *testing.T) {
	ctx := action.ActionContext{Action: "deploy.trigger"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{testPolicy()}, &engine.EvalOptions{DefaultDeny: false})
	if !result.Allowed {
		t.Error("expected allowed for unmatched action without defaultDeny")
	}
}

func TestDenyRuleMatchesTarget(t *testing.T) {
	ctx := action.ActionContext{Action: "shell.exec", Command: "rm -rf /tmp"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{testPolicy()}, &engine.EvalOptions{DefaultDeny: true})
	if result.Allowed {
		t.Error("expected denied for rm -rf command")
	}
}

func TestAllowShellExecSafe(t *testing.T) {
	ctx := action.ActionContext{Action: "shell.exec", Command: "ls -la"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{testPolicy()}, &engine.EvalOptions{DefaultDeny: true})
	if !result.Allowed {
		t.Errorf("expected allowed for ls -la, got denied: %s", result.Reason)
	}
}

func TestSuggestionPassedThrough(t *testing.T) {
	policy := &action.LoadedPolicy{
		ID: "test", Name: "Test", Severity: 3,
		Rules: []action.PolicyRule{
			{
				Action: action.StringOrSlice{"git.push"}, Effect: "deny",
				Branches: []string{"main"},
				Reason: "No push", Suggestion: "Use feature branch",
				CorrectedCommand: "git push origin {{branch}}",
			},
		},
	}
	ctx := action.ActionContext{Action: "git.push", Branch: "main"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{policy}, &engine.EvalOptions{DefaultDeny: true})
	if result.Suggestion != "Use feature branch" {
		t.Errorf("expected suggestion, got '%s'", result.Suggestion)
	}
	if result.CorrectedCommand != "git push origin {{branch}}" {
		t.Errorf("expected correctedCommand, got '%s'", result.CorrectedCommand)
	}
}

func TestInterventionPassedThrough(t *testing.T) {
	policy := &action.LoadedPolicy{
		ID: "test", Name: "Test", Severity: 3,
		Rules: []action.PolicyRule{
			{
				Action: action.StringOrSlice{"git.push"}, Effect: "deny",
				Branches: []string{"main"},
				Reason: "No push", Intervention: "require-approval",
			},
		},
	}
	ctx := action.ActionContext{Action: "git.push", Branch: "main"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{policy}, &engine.EvalOptions{DefaultDeny: true})
	if result.Intervention != "require-approval" {
		t.Errorf("expected intervention, got '%s'", result.Intervention)
	}
}

func TestDenyBranchFailClosedNoBranch(t *testing.T) {
	// Deny rule with branches but no branch in context — should deny (fail-closed)
	ctx := action.ActionContext{Action: "git.push"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{testPolicy()}, &engine.EvalOptions{DefaultDeny: true})
	if result.Allowed {
		t.Error("expected denied when no branch info with deny rule (fail-closed)")
	}
}

func TestMatchedPolicyAndRule(t *testing.T) {
	ctx := action.ActionContext{Action: "file.read"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{testPolicy()}, &engine.EvalOptions{DefaultDeny: true})
	if result.MatchedPolicy == nil {
		t.Error("expected matched policy to be set")
	}
	if result.MatchedRule == nil {
		t.Error("expected matched rule to be set")
	}
	if result.MatchedPolicy.ID != "test" {
		t.Errorf("expected policy ID 'test', got '%s'", result.MatchedPolicy.ID)
	}
}

func TestNilOptions(t *testing.T) {
	ctx := action.ActionContext{Action: "deploy.trigger"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{testPolicy()}, nil)
	// nil opts means defaultDeny=false, so unknown should be allowed
	if !result.Allowed {
		t.Error("expected allowed with nil options (fail-open)")
	}
}

func TestDenyRulePrecedesAllowRule(t *testing.T) {
	// git.push to main matches both deny and allow — deny should win
	ctx := action.ActionContext{Action: "git.push", Branch: "main"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{testPolicy()}, &engine.EvalOptions{DefaultDeny: true})
	if result.Allowed {
		t.Error("deny should take precedence over allow for same action")
	}
	if result.Decision != "deny" {
		t.Errorf("expected deny decision, got %s", result.Decision)
	}
}

func TestMultiplePolicies(t *testing.T) {
	policy1 := &action.LoadedPolicy{
		ID: "p1", Name: "P1", Severity: 3,
		Rules: []action.PolicyRule{
			{Action: action.StringOrSlice{"file.write"}, Effect: "allow", Reason: "Write allowed in p1"},
		},
	}
	policy2 := &action.LoadedPolicy{
		ID: "p2", Name: "P2", Severity: 5,
		Rules: []action.PolicyRule{
			{Action: action.StringOrSlice{"file.write"}, Effect: "deny", Reason: "Write denied in p2"},
		},
	}
	// Deny rules checked first across all policies, so p2 deny should win
	ctx := action.ActionContext{Action: "file.write"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{policy1, policy2}, &engine.EvalOptions{DefaultDeny: true})
	if result.Allowed {
		t.Error("expected denied from p2 deny rule")
	}
	if result.Reason != "Write denied in p2" {
		t.Errorf("expected reason from p2, got '%s'", result.Reason)
	}
}

func TestSeverityFromPolicy(t *testing.T) {
	ctx := action.ActionContext{Action: "git.push", Branch: "main"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{testPolicy()}, &engine.EvalOptions{DefaultDeny: true})
	if result.Severity != 4 {
		t.Errorf("expected severity 4 from policy, got %d", result.Severity)
	}
}

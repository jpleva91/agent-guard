package action_test

import (
	"testing"

	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
	"gopkg.in/yaml.v3"
)

func TestActionContextFields(t *testing.T) {
	ctx := action.ActionContext{
		Action:      "git.push",
		ActionClass: "git",
		Target:      "origin/main",
		Destructive: false,
		Source:      "claude-code",
		Agent:       "claude-code:opus:developer",
	}
	if ctx.Action != "git.push" {
		t.Errorf("expected git.push, got %s", ctx.Action)
	}
	if ctx.ActionClass != "git" {
		t.Errorf("expected git, got %s", ctx.ActionClass)
	}
}

func TestPolicyRuleMatchSingleAction(t *testing.T) {
	rule := action.PolicyRule{
		Action: action.StringOrSlice{"git.push"},
		Effect: "deny",
		Reason: "No push to main",
	}
	if rule.Effect != "deny" {
		t.Errorf("expected deny, got %s", rule.Effect)
	}
	if len(rule.Action) != 1 || rule.Action[0] != "git.push" {
		t.Errorf("expected [git.push], got %v", rule.Action)
	}
}

func TestPolicyRuleMatchMultipleActions(t *testing.T) {
	rule := action.PolicyRule{
		Action: action.StringOrSlice{"test.run", "test.run.unit", "test.run.integration"},
		Effect: "allow",
	}
	if len(rule.Action) != 3 {
		t.Errorf("expected 3 actions, got %d", len(rule.Action))
	}
}

func TestEvalResultAllowed(t *testing.T) {
	r := action.EvalResult{Allowed: true, Decision: "allow", Reason: "File reads safe"}
	if !r.Allowed {
		t.Error("expected allowed")
	}
}

func TestEvalResultDenied(t *testing.T) {
	r := action.EvalResult{Allowed: false, Decision: "deny", Reason: "Protected branch"}
	if r.Allowed {
		t.Error("expected denied")
	}
}

func TestStringOrSliceUnmarshalSingleString(t *testing.T) {
	input := `action: git.push`
	var rule struct {
		Action action.StringOrSlice `yaml:"action"`
	}
	if err := yaml.Unmarshal([]byte(input), &rule); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if len(rule.Action) != 1 || rule.Action[0] != "git.push" {
		t.Errorf("expected [git.push], got %v", rule.Action)
	}
}

func TestStringOrSliceUnmarshalSlice(t *testing.T) {
	input := `action: [git.push, git.commit]`
	var rule struct {
		Action action.StringOrSlice `yaml:"action"`
	}
	if err := yaml.Unmarshal([]byte(input), &rule); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if len(rule.Action) != 2 {
		t.Fatalf("expected 2 actions, got %d", len(rule.Action))
	}
	if rule.Action[0] != "git.push" || rule.Action[1] != "git.commit" {
		t.Errorf("expected [git.push, git.commit], got %v", rule.Action)
	}
}

func TestStringOrSliceUnmarshalMultilineSequence(t *testing.T) {
	input := `action:
  - test.run
  - test.run.unit
  - test.run.integration`
	var rule struct {
		Action action.StringOrSlice `yaml:"action"`
	}
	if err := yaml.Unmarshal([]byte(input), &rule); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if len(rule.Action) != 3 {
		t.Fatalf("expected 3 actions, got %d", len(rule.Action))
	}
	expected := []string{"test.run", "test.run.unit", "test.run.integration"}
	for i, want := range expected {
		if rule.Action[i] != want {
			t.Errorf("action[%d]: expected %s, got %s", i, want, rule.Action[i])
		}
	}
}

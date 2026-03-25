package decision_test

import (
	"testing"
	"time"

	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
	"github.com/AgentGuardHQ/agent-guard/go/internal/decision"
)

func TestNewAllowDecisionFields(t *testing.T) {
	ctx := action.ActionContext{Action: "file.read", Target: "/etc/hosts"}
	rule := &action.PolicyRule{
		Action: action.StringOrSlice{"file.read"},
		Effect: "allow",
		Reason: "Reading safe",
	}
	d := decision.NewAllowDecision(ctx, "sess-1", rule, "default-policy")

	if d.Type != decision.Allow {
		t.Errorf("expected type ALLOW, got %s", d.Type)
	}
	if d.SessionID != "sess-1" {
		t.Errorf("expected sessionID sess-1, got %s", d.SessionID)
	}
	if d.ActionContext.Action != "file.read" {
		t.Errorf("expected action file.read, got %s", d.ActionContext.Action)
	}
	if d.PolicyRule == nil {
		t.Error("expected policy rule to be set")
	}
	if d.PolicyName != "default-policy" {
		t.Errorf("expected policyName default-policy, got %s", d.PolicyName)
	}
	if d.Reason != "Action allowed by policy" {
		t.Errorf("unexpected reason: %s", d.Reason)
	}
}

func TestNewDenyDecisionFields(t *testing.T) {
	ctx := action.ActionContext{Action: "git.push", Branch: "main"}
	rule := &action.PolicyRule{
		Action: action.StringOrSlice{"git.push"},
		Effect: "deny",
		Reason: "No push to main",
	}
	d := decision.NewDenyDecision(ctx, "sess-2", "No push to main", "5", rule, "strict")

	if d.Type != decision.Deny {
		t.Errorf("expected type DENY, got %s", d.Type)
	}
	if d.Reason != "No push to main" {
		t.Errorf("expected reason 'No push to main', got '%s'", d.Reason)
	}
	if d.Severity != "5" {
		t.Errorf("expected severity '5', got '%s'", d.Severity)
	}
	if d.PolicyName != "strict" {
		t.Errorf("expected policyName strict, got %s", d.PolicyName)
	}
}

func TestNewEscalateDecisionFields(t *testing.T) {
	ctx := action.ActionContext{Action: "shell.exec", Command: "rm -rf /"}
	d := decision.NewEscalateDecision(ctx, "sess-3", "Denial threshold exceeded", "HIGH")

	if d.Type != decision.Escalate {
		t.Errorf("expected type ESCALATE, got %s", d.Type)
	}
	if d.EscalationLevel != "HIGH" {
		t.Errorf("expected escalation level HIGH, got %s", d.EscalationLevel)
	}
	if d.Reason != "Denial threshold exceeded" {
		t.Errorf("unexpected reason: %s", d.Reason)
	}
}

func TestNewInterveneDecisionFields(t *testing.T) {
	ctx := action.ActionContext{Action: "git.push", Branch: "main"}
	d := decision.NewInterveneDecision(ctx, "sess-4", "Use feature branch", "Push to a feature branch instead", "git push origin feat/my-feature")

	if d.Type != decision.Intervene {
		t.Errorf("expected type INTERVENE, got %s", d.Type)
	}
	if d.Suggestion != "Push to a feature branch instead" {
		t.Errorf("unexpected suggestion: %s", d.Suggestion)
	}
	if d.CorrectedCommand != "git push origin feat/my-feature" {
		t.Errorf("unexpected corrected command: %s", d.CorrectedCommand)
	}
}

func TestDecisionIDsAreUnique(t *testing.T) {
	ctx := action.ActionContext{Action: "file.read"}
	seen := make(map[string]bool)

	for i := 0; i < 100; i++ {
		d := decision.NewAllowDecision(ctx, "sess", nil, "")
		if seen[d.ID] {
			t.Fatalf("duplicate ID detected: %s", d.ID)
		}
		seen[d.ID] = true
	}
}

func TestDecisionIDFormat(t *testing.T) {
	ctx := action.ActionContext{Action: "file.read"}
	d := decision.NewAllowDecision(ctx, "sess", nil, "")

	if len(d.ID) != 4+16 { // "dec_" + 16 hex chars
		t.Errorf("expected ID length 20, got %d (%s)", len(d.ID), d.ID)
	}
	if d.ID[:4] != "dec_" {
		t.Errorf("expected ID prefix 'dec_', got '%s'", d.ID[:4])
	}
}

func TestDecisionTimestampIsSet(t *testing.T) {
	before := time.Now().Add(-time.Second)
	ctx := action.ActionContext{Action: "file.read"}
	d := decision.NewAllowDecision(ctx, "sess", nil, "")
	after := time.Now().Add(time.Second)

	if d.Timestamp.Before(before) || d.Timestamp.After(after) {
		t.Errorf("timestamp %v not in expected range [%v, %v]", d.Timestamp, before, after)
	}
}

func TestNewAllowDecisionNilRule(t *testing.T) {
	ctx := action.ActionContext{Action: "file.read"}
	d := decision.NewAllowDecision(ctx, "sess", nil, "")

	if d.PolicyRule != nil {
		t.Error("expected nil policy rule")
	}
	if d.PolicyName != "" {
		t.Errorf("expected empty policy name, got %s", d.PolicyName)
	}
}

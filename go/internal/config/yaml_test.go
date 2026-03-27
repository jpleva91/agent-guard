package config_test

import (
	"testing"

	"github.com/AgentGuardHQ/agentguard/go/internal/config"
)

func TestLoadYamlPolicy(t *testing.T) {
	yamlData := `
id: test-policy
name: Test Policy
severity: 4
mode: guide
rules:
  - action: git.push
    effect: deny
    branches: [main, master]
    reason: No push to main
    suggestion: Push to a feature branch
    correctedCommand: "git push origin {{branch}}"
  - action: file.read
    effect: allow
    reason: Reading is safe
`
	policy, err := config.LoadYamlPolicy([]byte(yamlData))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if policy.ID != "test-policy" {
		t.Errorf("expected test-policy, got %s", policy.ID)
	}
	if policy.Mode != "guide" {
		t.Errorf("expected guide, got %s", policy.Mode)
	}
	if policy.Severity != 4 {
		t.Errorf("expected severity 4, got %d", policy.Severity)
	}
	if len(policy.Rules) != 2 {
		t.Fatalf("expected 2 rules, got %d", len(policy.Rules))
	}

	deny := policy.Rules[0]
	if deny.Effect != "deny" {
		t.Errorf("expected deny, got %s", deny.Effect)
	}
	if deny.Conditions == nil {
		t.Fatal("expected conditions to be populated from flattened fields")
	}
	if len(deny.Conditions.Branches) != 2 {
		t.Errorf("expected 2 branches, got %d", len(deny.Conditions.Branches))
	}
	if deny.Suggestion != "Push to a feature branch" {
		t.Errorf("unexpected suggestion: %s", deny.Suggestion)
	}
	if deny.CorrectedCommand != "git push origin {{branch}}" {
		t.Errorf("unexpected correctedCommand: %s", deny.CorrectedCommand)
	}
}

func TestLoadYamlPolicyMultiAction(t *testing.T) {
	yamlData := `
id: test
name: Test
rules:
  - action:
      - test.run
      - test.run.unit
    effect: allow
    reason: Tests are safe
`
	policy, err := config.LoadYamlPolicy([]byte(yamlData))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	rule := policy.Rules[0]
	if len(rule.Action) != 2 {
		t.Errorf("expected 2 actions, got %d", len(rule.Action))
	}
	if rule.Action[0] != "test.run" {
		t.Errorf("expected test.run, got %s", rule.Action[0])
	}
	if rule.Action[1] != "test.run.unit" {
		t.Errorf("expected test.run.unit, got %s", rule.Action[1])
	}
}

func TestLoadYamlPolicyInvariantModes(t *testing.T) {
	yamlData := `
id: test
name: Test
mode: guide
invariantModes:
  no-secret-exposure: enforce
  blast-radius-limit: educate
rules: []
`
	policy, err := config.LoadYamlPolicy([]byte(yamlData))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if policy.InvariantModes["no-secret-exposure"] != "enforce" {
		t.Errorf("expected enforce, got %s", policy.InvariantModes["no-secret-exposure"])
	}
	if policy.InvariantModes["blast-radius-limit"] != "educate" {
		t.Errorf("expected educate, got %s", policy.InvariantModes["blast-radius-limit"])
	}
}

func TestLoadYamlPolicyTargetFlattened(t *testing.T) {
	yamlData := `
id: test
name: Test
rules:
  - action: file.write
    effect: deny
    target: .env
    reason: Secrets blocked
`
	policy, err := config.LoadYamlPolicy([]byte(yamlData))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	rule := policy.Rules[0]
	if rule.Conditions == nil {
		t.Fatal("expected conditions from target flattening")
	}
	if len(rule.Conditions.Scope) != 1 || rule.Conditions.Scope[0] != ".env" {
		t.Errorf("expected scope [.env], got %v", rule.Conditions.Scope)
	}
}

func TestLoadYamlPolicyDescription(t *testing.T) {
	yamlData := `
id: test
name: Test
description: A test policy
rules: []
`
	policy, err := config.LoadYamlPolicy([]byte(yamlData))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if policy.Description != "A test policy" {
		t.Errorf("expected 'A test policy', got %s", policy.Description)
	}
}

func TestLoadYamlPolicyPack(t *testing.T) {
	yamlData := `
id: test
name: Test
pack: essentials
rules: []
`
	policy, err := config.LoadYamlPolicy([]byte(yamlData))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if policy.Pack != "essentials" {
		t.Errorf("expected essentials, got %s", policy.Pack)
	}
}

func TestLoadYamlPolicyInvalidYaml(t *testing.T) {
	_, err := config.LoadYamlPolicy([]byte("{{invalid yaml"))
	if err == nil {
		t.Error("expected error for invalid yaml")
	}
}

func TestLoadYamlPolicyRequireFlags(t *testing.T) {
	yamlData := `
id: test
name: Test
rules:
  - action: git.push
    effect: deny
    requireTests: true
    requireWorktree: true
    reason: Must test first
`
	policy, err := config.LoadYamlPolicy([]byte(yamlData))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	rule := policy.Rules[0]
	if rule.Conditions == nil {
		t.Fatal("expected conditions from require flags")
	}
	if !rule.Conditions.RequireTests {
		t.Error("expected requireTests=true")
	}
	if !rule.Conditions.RequireWorktree {
		t.Error("expected requireWorktree=true")
	}
}

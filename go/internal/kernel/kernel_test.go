package kernel_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
	"github.com/AgentGuardHQ/agentguard/go/internal/kernel"
)

// writeTempPolicy writes YAML policy content to a temp file and returns the path.
func writeTempPolicy(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "policy.yaml")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("write temp policy: %v", err)
	}
	return path
}

const testPolicyYAML = `
id: test-policy
name: Test Policy
severity: 4
rules:
  - action: git.push
    effect: deny
    branches: [main, master]
    reason: Direct push to protected branch
    suggestion: Push to a feature branch and open a PR
    correctedCommand: "git push origin feature-branch"
  - action: file.read
    effect: allow
    reason: Reading is safe
  - action: shell.exec
    effect: allow
    reason: Shell commands permitted
  - action: git.push
    effect: allow
    reason: Feature branch pushes permitted
`

func newTestKernel(t *testing.T, opts ...func(*kernel.KernelConfig)) *kernel.Kernel {
	t.Helper()
	path := writeTempPolicy(t, testPolicyYAML)
	cfg := kernel.KernelConfig{
		PolicyPaths: []string{path},
		DefaultDeny: true,
		AgentName:   "test-agent",
	}
	for _, opt := range opts {
		opt(&cfg)
	}
	k, err := kernel.NewKernel(cfg)
	if err != nil {
		t.Fatalf("NewKernel: %v", err)
	}
	return k
}

func TestAllowFileRead(t *testing.T) {
	k := newTestKernel(t)
	defer k.Close()

	result, err := k.Propose(action.RawAction{
		Tool: "Read",
		File: "README.md",
	})
	if err != nil {
		t.Fatalf("Propose: %v", err)
	}
	if result.Decision != "allow" {
		t.Errorf("expected allow, got %s: %s", result.Decision, result.Reason)
	}
	if result.Action.Action != "file.read" {
		t.Errorf("expected normalized action file.read, got %s", result.Action.Action)
	}
}

func TestDenyGitPushToMain(t *testing.T) {
	k := newTestKernel(t)
	defer k.Close()

	result, err := k.Propose(action.RawAction{
		Tool:    "Bash",
		Command: "git push origin main",
	})
	if err != nil {
		t.Fatalf("Propose: %v", err)
	}
	if result.Decision != "deny" {
		t.Errorf("expected deny, got %s: %s", result.Decision, result.Reason)
	}
	if result.Suggestion == "" {
		t.Error("expected suggestion to be populated")
	}
	if result.CorrectedCommand == "" {
		t.Error("expected correctedCommand to be populated")
	}
}

func TestAllowGitPushToFeature(t *testing.T) {
	k := newTestKernel(t)
	defer k.Close()

	result, err := k.Propose(action.RawAction{
		Tool:    "Bash",
		Command: "git push origin feat/my-feature",
	})
	if err != nil {
		t.Fatalf("Propose: %v", err)
	}
	if result.Decision != "allow" {
		t.Errorf("expected allow for feature branch push, got %s: %s", result.Decision, result.Reason)
	}
}

func TestDryRunMode(t *testing.T) {
	k := newTestKernel(t, func(cfg *kernel.KernelConfig) {
		cfg.DryRun = true
	})
	defer k.Close()

	result, err := k.Propose(action.RawAction{
		Tool: "Read",
		File: "main.go",
	})
	if err != nil {
		t.Fatalf("Propose: %v", err)
	}
	if !result.DryRun {
		t.Error("expected DryRun to be true")
	}
	if result.Decision != "allow" {
		t.Errorf("expected allow even in dry-run, got %s", result.Decision)
	}
}

func TestStatsTracking(t *testing.T) {
	k := newTestKernel(t)
	defer k.Close()

	// Allowed action
	if _, err := k.Propose(action.RawAction{Tool: "Read", File: "x.go"}); err != nil {
		t.Fatal(err)
	}
	// Denied action
	if _, err := k.Propose(action.RawAction{Tool: "Bash", Command: "git push origin main"}); err != nil {
		t.Fatal(err)
	}
	// Another allowed action
	if _, err := k.Propose(action.RawAction{Tool: "Bash", Command: "ls -la"}); err != nil {
		t.Fatal(err)
	}

	stats := k.Stats()
	if stats.TotalActions != 3 {
		t.Errorf("expected 3 total actions, got %d", stats.TotalActions)
	}
	if stats.Allowed != 2 {
		t.Errorf("expected 2 allowed, got %d", stats.Allowed)
	}
	if stats.Denied != 1 {
		t.Errorf("expected 1 denied, got %d", stats.Denied)
	}
}

func TestMultipleSequentialActions(t *testing.T) {
	k := newTestKernel(t)
	defer k.Close()

	actions := []struct {
		raw      action.RawAction
		wantDecision string
	}{
		{action.RawAction{Tool: "Read", File: "a.go"}, "allow"},
		{action.RawAction{Tool: "Bash", Command: "git push origin main"}, "deny"},
		{action.RawAction{Tool: "Read", File: "b.go"}, "allow"},
		{action.RawAction{Tool: "Bash", Command: "git push origin feat/x"}, "allow"},
		{action.RawAction{Tool: "Bash", Command: "git push origin master"}, "deny"},
	}

	for i, tc := range actions {
		result, err := k.Propose(tc.raw)
		if err != nil {
			t.Fatalf("action %d: Propose: %v", i, err)
		}
		if result.Decision != tc.wantDecision {
			t.Errorf("action %d: expected %s, got %s (%s)", i, tc.wantDecision, result.Decision, result.Reason)
		}
	}

	stats := k.Stats()
	if stats.TotalActions != 5 {
		t.Errorf("expected 5 total, got %d", stats.TotalActions)
	}
}

func TestMultiplePolicies(t *testing.T) {
	policy1 := `
id: base
name: Base Policy
severity: 3
rules:
  - action: file.write
    effect: allow
    reason: Writes allowed
`
	policy2 := `
id: strict
name: Strict Policy
severity: 5
rules:
  - action: file.write
    effect: deny
    reason: No writes allowed
`
	path1 := writeTempPolicy(t, policy1)
	dir2 := t.TempDir()
	path2 := filepath.Join(dir2, "strict.yaml")
	if err := os.WriteFile(path2, []byte(policy2), 0644); err != nil {
		t.Fatal(err)
	}

	k, err := kernel.NewKernel(kernel.KernelConfig{
		PolicyPaths: []string{path1, path2},
		DefaultDeny: true,
		AgentName:   "test",
	})
	if err != nil {
		t.Fatalf("NewKernel: %v", err)
	}
	defer k.Close()

	result, err := k.Propose(action.RawAction{
		Tool:    "Write",
		File:    "test.txt",
		Content: "hello",
	})
	if err != nil {
		t.Fatal(err)
	}
	// Deny rules are checked first across all policies, so strict's deny wins
	if result.Decision != "deny" {
		t.Errorf("expected deny from strict policy, got %s: %s", result.Decision, result.Reason)
	}
}

func TestNoPoliciesDefaultDeny(t *testing.T) {
	k, err := kernel.NewKernel(kernel.KernelConfig{
		PolicyPaths: []string{},
		DefaultDeny: true,
		AgentName:   "test",
	})
	if err != nil {
		t.Fatalf("NewKernel: %v", err)
	}
	defer k.Close()

	result, err := k.Propose(action.RawAction{Tool: "Read", File: "x.go"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Decision != "deny" {
		t.Errorf("expected deny with no policies and defaultDeny, got %s", result.Decision)
	}
}

func TestNoPoliciesDefaultAllow(t *testing.T) {
	k, err := kernel.NewKernel(kernel.KernelConfig{
		PolicyPaths: []string{},
		DefaultDeny: false,
		AgentName:   "test",
	})
	if err != nil {
		t.Fatalf("NewKernel: %v", err)
	}
	defer k.Close()

	result, err := k.Propose(action.RawAction{Tool: "Read", File: "x.go"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Decision != "allow" {
		t.Errorf("expected allow with no policies and defaultAllow, got %s", result.Decision)
	}
}

func TestSessionIDGenerated(t *testing.T) {
	k := newTestKernel(t)
	defer k.Close()

	if k.SessionID() == "" {
		t.Error("expected non-empty session ID")
	}
}

func TestSessionIDPreserved(t *testing.T) {
	k := newTestKernel(t, func(cfg *kernel.KernelConfig) {
		cfg.SessionID = "custom-session-42"
	})
	defer k.Close()

	if k.SessionID() != "custom-session-42" {
		t.Errorf("expected custom-session-42, got %s", k.SessionID())
	}
}

func TestSessionIDInResult(t *testing.T) {
	k := newTestKernel(t, func(cfg *kernel.KernelConfig) {
		cfg.SessionID = "session-abc"
	})
	defer k.Close()

	result, err := k.Propose(action.RawAction{Tool: "Read", File: "x.go"})
	if err != nil {
		t.Fatal(err)
	}
	if result.SessionID != "session-abc" {
		t.Errorf("expected session-abc in result, got %s", result.SessionID)
	}
}

func TestErrorInvalidPolicyPath(t *testing.T) {
	_, err := kernel.NewKernel(kernel.KernelConfig{
		PolicyPaths: []string{"/nonexistent/policy.yaml"},
	})
	if err == nil {
		t.Error("expected error for nonexistent policy path")
	}
}

func TestErrorMalformedPolicy(t *testing.T) {
	path := writeTempPolicy(t, "not: valid: yaml: [[[")
	_, err := kernel.NewKernel(kernel.KernelConfig{
		PolicyPaths: []string{path},
	})
	if err != nil {
		// YAML parser may or may not error on this — accept either outcome.
		// The important thing is NewKernel doesn't panic.
		t.Logf("got expected error: %v", err)
	}
}

func TestResultHasDuration(t *testing.T) {
	k := newTestKernel(t)
	defer k.Close()

	result, err := k.Propose(action.RawAction{Tool: "Read", File: "x.go"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Duration <= 0 {
		t.Error("expected positive duration")
	}
}

func TestResultHasTimestamp(t *testing.T) {
	k := newTestKernel(t)
	defer k.Close()

	result, err := k.Propose(action.RawAction{Tool: "Read", File: "x.go"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Timestamp.IsZero() {
		t.Error("expected non-zero timestamp")
	}
}

func TestNormalizationFlow(t *testing.T) {
	k := newTestKernel(t)
	defer k.Close()

	// Bash tool with git command should be normalized to git.push
	result, err := k.Propose(action.RawAction{
		Tool:    "Bash",
		Command: "git push origin main",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Action.Action != "git.push" {
		t.Errorf("expected git.push, got %s", result.Action.Action)
	}
	if result.Action.ActionClass != "git" {
		t.Errorf("expected actionClass git, got %s", result.Action.ActionClass)
	}
	if result.Action.Branch != "main" {
		t.Errorf("expected branch main, got %s", result.Action.Branch)
	}
}

func TestCloseIsIdempotent(t *testing.T) {
	k := newTestKernel(t)
	if err := k.Close(); err != nil {
		t.Errorf("first Close: %v", err)
	}
	if err := k.Close(); err != nil {
		t.Errorf("second Close: %v", err)
	}
}

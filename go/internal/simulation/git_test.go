package simulation_test

import (
	"testing"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
	"github.com/AgentGuardHQ/agentguard/go/internal/simulation"
)

func TestGitCommitLowImpact(t *testing.T) {
	sim := &simulation.GitSimulator{}
	ctx := action.ActionContext{
		Action: "git.commit",
		Branch: "feature/test",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact for git.commit")
	}
	if impacts[0].Severity != simulation.SeverityLow {
		t.Errorf("expected low severity for git.commit, got %s", impacts[0].Severity)
	}
	if !impacts[0].Reversible {
		t.Error("expected git.commit to be reversible")
	}
}

func TestGitPushToFeatureMediumImpact(t *testing.T) {
	sim := &simulation.GitSimulator{}
	ctx := action.ActionContext{
		Action: "git.push",
		Branch: "feature/my-branch",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact for git.push")
	}
	if impacts[0].Severity != simulation.SeverityMedium {
		t.Errorf("expected medium severity for push to feature branch, got %s", impacts[0].Severity)
	}
}

func TestGitPushToMainHighImpact(t *testing.T) {
	sim := &simulation.GitSimulator{}
	ctx := action.ActionContext{
		Action: "git.push",
		Branch: "main",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact for git.push to main")
	}
	if impacts[0].Severity != simulation.SeverityHigh {
		t.Errorf("expected high severity for push to main, got %s", impacts[0].Severity)
	}
}

func TestGitForcePushCriticalIrreversible(t *testing.T) {
	sim := &simulation.GitSimulator{}
	ctx := action.ActionContext{
		Action: "git.force-push",
		Branch: "main",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact for git.force-push")
	}
	if impacts[0].Severity != simulation.SeverityCritical {
		t.Errorf("expected critical severity for force push, got %s", impacts[0].Severity)
	}
	if impacts[0].Reversible {
		t.Error("expected force push to be irreversible")
	}
}

func TestGitPushWithForceFlag(t *testing.T) {
	sim := &simulation.GitSimulator{}
	ctx := action.ActionContext{
		Action:  "git.push",
		Branch:  "main",
		Command: "git push --force origin main",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact for git.push with --force")
	}
	if impacts[0].Severity != simulation.SeverityCritical {
		t.Errorf("expected critical severity when push has --force flag, got %s", impacts[0].Severity)
	}
	if impacts[0].Reversible {
		t.Error("expected force push to be irreversible")
	}
}

func TestGitBranchDeleteMediumImpact(t *testing.T) {
	sim := &simulation.GitSimulator{}
	ctx := action.ActionContext{
		Action: "git.branch.delete",
		Branch: "feature/old-branch",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact for git.branch.delete")
	}
	if impacts[0].Severity != simulation.SeverityMedium {
		t.Errorf("expected medium severity for branch delete, got %s", impacts[0].Severity)
	}
	if impacts[0].Reversible {
		t.Error("expected branch delete to be irreversible")
	}
}

func TestGitBranchDeleteProtectedCritical(t *testing.T) {
	sim := &simulation.GitSimulator{}
	ctx := action.ActionContext{
		Action: "git.branch.delete",
		Branch: "main",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact for deleting protected branch")
	}
	if impacts[0].Severity != simulation.SeverityCritical {
		t.Errorf("expected critical severity for deleting main, got %s", impacts[0].Severity)
	}
}

func TestGitMergeMediumImpact(t *testing.T) {
	sim := &simulation.GitSimulator{}
	ctx := action.ActionContext{
		Action: "git.merge",
		Branch: "feature/branch",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact for git.merge")
	}
	if impacts[0].Severity != simulation.SeverityMedium {
		t.Errorf("expected medium severity for merge, got %s", impacts[0].Severity)
	}
	if !impacts[0].Reversible {
		t.Error("expected merge to be reversible (via revert)")
	}
}

func TestGitMergeToMainHighImpact(t *testing.T) {
	sim := &simulation.GitSimulator{}
	ctx := action.ActionContext{
		Action: "git.merge",
		Branch: "main",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact for merge to main")
	}
	if impacts[0].Severity != simulation.SeverityHigh {
		t.Errorf("expected high severity for merge to main, got %s", impacts[0].Severity)
	}
}

func TestGitResetHighImpact(t *testing.T) {
	sim := &simulation.GitSimulator{}
	ctx := action.ActionContext{
		Action: "git.reset",
		Branch: "feature/branch",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact for git.reset")
	}
	if impacts[0].Severity != simulation.SeverityHigh {
		t.Errorf("expected high severity for git.reset, got %s", impacts[0].Severity)
	}
	if impacts[0].Reversible {
		t.Error("expected git.reset to be irreversible")
	}
}

func TestGitDiffNoImpact(t *testing.T) {
	sim := &simulation.GitSimulator{}
	ctx := action.ActionContext{
		Action: "git.diff",
		Branch: "main",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if impacts != nil {
		t.Errorf("expected nil impacts for git.diff, got %d", len(impacts))
	}
}

func TestNonGitActionReturnsNil(t *testing.T) {
	sim := &simulation.GitSimulator{}
	ctx := action.ActionContext{
		Action: "file.write",
		Target: "src/main.go",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if impacts != nil {
		t.Errorf("expected nil impacts for non-git action, got %d", len(impacts))
	}
}

func TestGitCheckoutLowImpact(t *testing.T) {
	sim := &simulation.GitSimulator{}
	ctx := action.ActionContext{
		Action: "git.checkout",
		Branch: "feature/new",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact for git.checkout")
	}
	if impacts[0].Severity != simulation.SeverityLow {
		t.Errorf("expected low severity for checkout, got %s", impacts[0].Severity)
	}
}

func TestGitImpactPathsIncludeBranch(t *testing.T) {
	sim := &simulation.GitSimulator{}
	ctx := action.ActionContext{
		Action: "git.push",
		Branch: "feature/test",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact")
	}
	if len(impacts[0].Paths) == 0 {
		t.Fatal("expected paths to include branch ref")
	}
	if impacts[0].Paths[0] != "refs/heads/feature/test" {
		t.Errorf("expected path refs/heads/feature/test, got %s", impacts[0].Paths[0])
	}
}

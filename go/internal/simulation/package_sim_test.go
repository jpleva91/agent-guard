package simulation_test

import (
	"testing"

	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
	"github.com/AgentGuardHQ/agent-guard/go/internal/simulation"
)

func TestNpmInstallDependencyImpact(t *testing.T) {
	sim := &simulation.PackageSimulator{}
	ctx := action.ActionContext{
		Action:  "shell.exec",
		Command: "npm install lodash",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact for npm install")
	}
	if impacts[0].Type != simulation.TypePackage {
		t.Errorf("expected package type, got %s", impacts[0].Type)
	}
	if impacts[0].Severity != simulation.SeverityLow {
		t.Errorf("expected low severity for npm install, got %s", impacts[0].Severity)
	}

	// Should affect package.json
	hasPackageJson := false
	for _, p := range impacts[0].Paths {
		if p == "package.json" {
			hasPackageJson = true
		}
	}
	if !hasPackageJson {
		t.Error("expected impact paths to include package.json")
	}
}

func TestPackageRemovalHigherImpact(t *testing.T) {
	sim := &simulation.PackageSimulator{}
	ctx := action.ActionContext{
		Action:  "shell.exec",
		Command: "npm uninstall lodash",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact for npm uninstall")
	}
	if impacts[0].Severity != simulation.SeverityMedium {
		t.Errorf("expected medium severity for npm uninstall, got %s", impacts[0].Severity)
	}
}

func TestYarnAddDetected(t *testing.T) {
	sim := &simulation.PackageSimulator{}
	ctx := action.ActionContext{
		Action:  "shell.exec",
		Command: "yarn add react",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact for yarn add")
	}
	if impacts[0].Type != simulation.TypePackage {
		t.Errorf("expected package type, got %s", impacts[0].Type)
	}
}

func TestPnpmAddDetected(t *testing.T) {
	sim := &simulation.PackageSimulator{}
	ctx := action.ActionContext{
		Action:  "shell.exec",
		Command: "pnpm add typescript",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact for pnpm add")
	}
}

func TestGlobalInstallMediumSeverity(t *testing.T) {
	sim := &simulation.PackageSimulator{}
	ctx := action.ActionContext{
		Action:  "shell.exec",
		Command: "npm install -g typescript",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact for global install")
	}
	if impacts[0].Severity != simulation.SeverityMedium {
		t.Errorf("expected medium severity for global install, got %s", impacts[0].Severity)
	}
}

func TestNpmActionInstall(t *testing.T) {
	sim := &simulation.PackageSimulator{}
	ctx := action.ActionContext{
		Action: "npm.install",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact for npm.install action")
	}
	if impacts[0].Type != simulation.TypePackage {
		t.Errorf("expected package type, got %s", impacts[0].Type)
	}
}

func TestNpmPublishHighSeverity(t *testing.T) {
	sim := &simulation.PackageSimulator{}
	ctx := action.ActionContext{
		Action: "npm.publish",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact for npm.publish")
	}
	if impacts[0].Severity != simulation.SeverityHigh {
		t.Errorf("expected high severity for npm.publish, got %s", impacts[0].Severity)
	}
	if impacts[0].Reversible {
		t.Error("expected npm.publish to be irreversible")
	}
}

func TestNonPackageCommandReturnsNil(t *testing.T) {
	sim := &simulation.PackageSimulator{}
	ctx := action.ActionContext{
		Action:  "shell.exec",
		Command: "ls -la",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if impacts != nil {
		t.Errorf("expected nil impacts for non-package command, got %d", len(impacts))
	}
}

func TestNonShellActionReturnsNil(t *testing.T) {
	sim := &simulation.PackageSimulator{}
	ctx := action.ActionContext{
		Action: "file.write",
		Target: "src/main.go",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if impacts != nil {
		t.Errorf("expected nil impacts for non-shell action, got %d", len(impacts))
	}
}

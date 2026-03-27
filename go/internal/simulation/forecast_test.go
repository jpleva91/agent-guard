package simulation_test

import (
	"testing"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
	"github.com/AgentGuardHQ/agentguard/go/internal/simulation"
)

func TestForecastAggregation(t *testing.T) {
	forecast := simulation.BuildForecast(action.ActionContext{
		Action:      "git.push",
		Branch:      "main",
		Command:     "git push --force origin main",
		Destructive: true,
	})

	if len(forecast.Impacts) == 0 {
		t.Fatal("expected at least one impact in forecast")
	}

	// Should include git impacts
	hasGit := false
	for _, imp := range forecast.Impacts {
		if imp.Type == simulation.TypeGit {
			hasGit = true
			break
		}
	}
	if !hasGit {
		t.Error("expected git impacts in forecast")
	}
}

func TestForecastRiskScoreCalculation(t *testing.T) {
	// Low-risk action
	low := simulation.BuildForecast(action.ActionContext{
		Action: "file.read",
		Target: "src/main.go",
	})
	if low.RiskScore > 0.3 {
		t.Errorf("expected low risk score for file.read, got %.2f", low.RiskScore)
	}

	// High-risk action
	high := simulation.BuildForecast(action.ActionContext{
		Action: "git.force-push",
		Branch: "main",
	})
	if high.RiskScore < 0.5 {
		t.Errorf("expected elevated risk score for force push, got %.2f", high.RiskScore)
	}

	// The high-risk action should have a higher score
	if high.RiskScore <= low.RiskScore {
		t.Errorf("expected force push risk (%.2f) > file.read risk (%.2f)",
			high.RiskScore, low.RiskScore)
	}
}

func TestForecastWarningsForHighRisk(t *testing.T) {
	forecast := simulation.BuildForecast(action.ActionContext{
		Action:      "git.force-push",
		Branch:      "main",
		Destructive: true,
	})

	if len(forecast.Warnings) == 0 {
		t.Fatal("expected warnings for high-risk force push")
	}

	// Should warn about irreversibility
	hasIrreversible := false
	for _, w := range forecast.Warnings {
		if containsSubstring(w, "Irreversible") || containsSubstring(w, "irreversible") {
			hasIrreversible = true
		}
	}
	if !hasIrreversible {
		t.Error("expected irreversible warning for force push")
	}

	// Should warn about destructive
	hasDestructive := false
	for _, w := range forecast.Warnings {
		if containsSubstring(w, "destructive") || containsSubstring(w, "Destructive") {
			hasDestructive = true
		}
	}
	if !hasDestructive {
		t.Error("expected destructive warning")
	}

	// Should warn about protected branch
	hasProtected := false
	for _, w := range forecast.Warnings {
		if containsSubstring(w, "protected") {
			hasProtected = true
		}
	}
	if !hasProtected {
		t.Error("expected protected branch warning")
	}
}

func TestForecastSummaryPresent(t *testing.T) {
	forecast := simulation.BuildForecast(action.ActionContext{
		Action: "file.write",
		Target: "src/main.go",
	})
	if forecast.Summary == "" {
		t.Error("expected non-empty summary in forecast")
	}
}

func TestForecastNoImpactsForReadOnly(t *testing.T) {
	forecast := simulation.BuildForecast(action.ActionContext{
		Action: "file.read",
		Target: "src/main.go",
	})
	if len(forecast.Impacts) != 0 {
		t.Errorf("expected no impacts for file.read, got %d", len(forecast.Impacts))
	}
	if forecast.RiskScore != 0.0 {
		t.Errorf("expected zero risk score for file.read, got %.2f", forecast.RiskScore)
	}
	if forecast.Summary != "No predicted impacts" {
		t.Errorf("expected 'No predicted impacts' summary, got %q", forecast.Summary)
	}
}

func TestRegistrySimulateAll(t *testing.T) {
	reg := simulation.NewDefaultRegistry()

	// Git action should be picked up by git simulator
	forecast := reg.SimulateAll(action.ActionContext{
		Action: "git.push",
		Branch: "feature/test",
	})
	if len(forecast.Impacts) == 0 {
		t.Fatal("expected impacts from git simulator")
	}
}

func TestRegistryCustomSimulator(t *testing.T) {
	reg := simulation.NewRegistry()

	// No simulators registered — should return empty forecast
	forecast := reg.SimulateAll(action.ActionContext{
		Action: "file.write",
		Target: "test.txt",
	})
	if len(forecast.Impacts) != 0 {
		t.Errorf("expected no impacts with empty registry, got %d", len(forecast.Impacts))
	}
}

func TestMultipleSimulatorsContribute(t *testing.T) {
	// A package install command triggers both shell detection and package detection
	// Using the default registry, the filesystem sim won't match shell.exec,
	// but the package sim will.
	forecast := simulation.BuildForecast(action.ActionContext{
		Action:  "shell.exec",
		Command: "npm install express",
	})

	if len(forecast.Impacts) == 0 {
		t.Fatal("expected at least one impact for npm install command")
	}

	hasPackage := false
	for _, imp := range forecast.Impacts {
		if imp.Type == simulation.TypePackage {
			hasPackage = true
		}
	}
	if !hasPackage {
		t.Error("expected package impact for npm install command")
	}
}

func TestForecastRiskScoreCapped(t *testing.T) {
	forecast := simulation.BuildForecast(action.ActionContext{
		Action:        "git.force-push",
		Branch:        "main",
		Command:       "git push --force origin main",
		Destructive:   true,
		FilesAffected: 100,
	})
	if forecast.RiskScore > 1.0 {
		t.Errorf("expected risk score capped at 1.0, got %.2f", forecast.RiskScore)
	}
}

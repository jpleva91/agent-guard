package simulation_test

import (
	"testing"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
	"github.com/AgentGuardHQ/agentguard/go/internal/simulation"
)

func TestFileReadNoImpact(t *testing.T) {
	sim := &simulation.FilesystemSimulator{}
	ctx := action.ActionContext{
		Action: "file.read",
		Target: "src/main.go",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if impacts != nil {
		t.Errorf("expected nil impacts for file.read, got %d", len(impacts))
	}
}

func TestFileWriteProducesFilesystemImpact(t *testing.T) {
	sim := &simulation.FilesystemSimulator{}
	ctx := action.ActionContext{
		Action: "file.write",
		Target: "src/main.go",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact for file.write")
	}
	if impacts[0].Type != simulation.TypeFilesystem {
		t.Errorf("expected filesystem type, got %s", impacts[0].Type)
	}
	if !impacts[0].Reversible {
		t.Error("expected file.write to be reversible")
	}
}

func TestFileDeleteIsIrreversible(t *testing.T) {
	sim := &simulation.FilesystemSimulator{}
	ctx := action.ActionContext{
		Action: "file.delete",
		Target: "src/temp.go",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact for file.delete")
	}
	if impacts[0].Reversible {
		t.Error("expected file.delete to be irreversible")
	}
	if impacts[0].Severity != simulation.SeverityMedium {
		t.Errorf("expected medium severity for file.delete, got %s", impacts[0].Severity)
	}
}

func TestBulkOperationsDetected(t *testing.T) {
	sim := &simulation.FilesystemSimulator{}
	ctx := action.ActionContext{
		Action:        "file.write",
		Target:        "src/",
		FilesAffected: 25,
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should have at least the base write impact and the bulk operation impact
	hasBulk := false
	for _, imp := range impacts {
		if imp.Severity == simulation.SeverityHigh && imp.Description != "" {
			if containsSubstring(imp.Description, "Bulk") || containsSubstring(imp.Description, "bulk") {
				hasBulk = true
			}
		}
	}
	if !hasBulk {
		t.Error("expected bulk operation impact for FilesAffected > 10")
	}
}

func TestSensitiveFileDetected(t *testing.T) {
	sim := &simulation.FilesystemSimulator{}
	ctx := action.ActionContext{
		Action: "file.write",
		Target: ".env.production",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	hasSensitive := false
	for _, imp := range impacts {
		if imp.Severity == simulation.SeverityHigh && containsSubstring(imp.Description, "Sensitive") {
			hasSensitive = true
		}
	}
	if !hasSensitive {
		t.Error("expected sensitive file impact for .env file")
	}
}

func TestConfigFileDetected(t *testing.T) {
	sim := &simulation.FilesystemSimulator{}
	ctx := action.ActionContext{
		Action: "file.write",
		Target: "package.json",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	hasConfig := false
	for _, imp := range impacts {
		if containsSubstring(imp.Description, "Configuration") {
			hasConfig = true
		}
	}
	if !hasConfig {
		t.Error("expected configuration file impact for package.json")
	}
}

func TestNonFileActionReturnsNil(t *testing.T) {
	sim := &simulation.FilesystemSimulator{}
	ctx := action.ActionContext{
		Action: "git.push",
		Branch: "main",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if impacts != nil {
		t.Errorf("expected nil impacts for non-file action, got %d", len(impacts))
	}
}

func TestFileMoveImpact(t *testing.T) {
	sim := &simulation.FilesystemSimulator{}
	ctx := action.ActionContext{
		Action: "file.move",
		Target: "src/old.go",
	}
	impacts, err := sim.Simulate(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(impacts) == 0 {
		t.Fatal("expected at least one impact for file.move")
	}
	if impacts[0].Severity != simulation.SeverityLow {
		t.Errorf("expected low severity for file.move, got %s", impacts[0].Severity)
	}
}

// containsSubstring is a test helper for readable assertions.
func containsSubstring(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && findSubstring(s, substr))
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

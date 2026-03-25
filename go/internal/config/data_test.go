package config_test

import (
	"testing"

	"github.com/AgentGuardHQ/agent-guard/go/internal/config"
)

func TestToolActionMap(t *testing.T) {
	m := config.ToolActionMap()
	if m["Bash"] != "shell.exec" {
		t.Errorf("expected shell.exec for Bash, got %s", m["Bash"])
	}
	if m["Read"] != "file.read" {
		t.Errorf("expected file.read for Read, got %s", m["Read"])
	}
	if m["Write"] != "file.write" {
		t.Errorf("expected file.write for Write, got %s", m["Write"])
	}
}

func TestToolActionMapIdempotent(t *testing.T) {
	m1 := config.ToolActionMap()
	m2 := config.ToolActionMap()
	if len(m1) != len(m2) {
		t.Errorf("expected same length on repeated calls, got %d vs %d", len(m1), len(m2))
	}
}

func TestDestructivePatterns(t *testing.T) {
	patterns := config.DestructivePatterns()
	if len(patterns) == 0 {
		t.Error("expected at least one destructive pattern")
	}
	// Verify a known pattern exists
	found := false
	for _, p := range patterns {
		if p.Category == "filesystem" && p.RiskLevel == "critical" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected at least one critical filesystem pattern")
	}
}

func TestGitActionPatterns(t *testing.T) {
	patterns := config.GitActionPatterns()
	if len(patterns) == 0 {
		t.Error("expected at least one git action pattern")
	}
	// Verify git.push pattern exists
	found := false
	for _, p := range patterns {
		if p.ActionType == "git.push" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected git.push action pattern")
	}
}

func TestGithubActionPatterns(t *testing.T) {
	patterns := config.GithubActionPatterns()
	if len(patterns) == 0 {
		t.Error("expected at least one github action pattern")
	}
	// Verify github.pr.create pattern exists
	found := false
	for _, p := range patterns {
		if p.ActionType == "github.pr.create" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected github.pr.create action pattern")
	}
}

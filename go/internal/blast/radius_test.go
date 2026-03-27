package blast_test

import (
	"testing"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
	"github.com/AgentGuardHQ/agentguard/go/internal/blast"
)

func TestFileReadHasLowBlastRadius(t *testing.T) {
	ctx := action.ActionContext{
		Action: "file.read",
		Target: "src/main.go",
	}
	score := blast.ComputeBlastRadius(ctx)

	if score.Level != blast.LevelLow {
		t.Errorf("expected low blast radius for file.read, got %s (score=%.2f)", score.Level, score.Score)
	}
	if score.Score >= 0.3 {
		t.Errorf("expected score < 0.3 for file.read, got %.2f", score.Score)
	}
}

func TestGitPushToMainHasHighBlastRadius(t *testing.T) {
	ctx := action.ActionContext{
		Action: "git.push",
		Branch: "main",
	}
	score := blast.ComputeBlastRadius(ctx)

	if score.Level != blast.LevelHigh && score.Level != blast.LevelCritical {
		t.Errorf("expected high or critical blast radius for git push to main, got %s (score=%.2f)", score.Level, score.Score)
	}
	// git.push (0.5) + branch-sensitivity (0.3) = 0.8
	if score.Score < 0.5 {
		t.Errorf("expected score >= 0.5 for git push to main, got %.2f", score.Score)
	}
}

func TestDestructiveCommandsHaveElevatedScores(t *testing.T) {
	ctx := action.ActionContext{
		Action:      "shell.exec",
		Command:     "rm -rf /tmp/project",
		Destructive: true,
	}
	score := blast.ComputeBlastRadius(ctx)

	// shell.exec (0.3) + destructive (0.3) = 0.6
	if score.Score < 0.5 {
		t.Errorf("expected elevated score for destructive command, got %.2f", score.Score)
	}
	if score.Level == blast.LevelLow {
		t.Errorf("expected at least medium for destructive command, got %s", score.Level)
	}

	// Verify the destructive factor is present
	found := false
	for _, f := range score.Factors {
		if f.Name == "destructive" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected destructive factor in blast radius factors")
	}
}

func TestForcePushIsCritical(t *testing.T) {
	ctx := action.ActionContext{
		Action:      "git.push",
		Branch:      "main",
		Command:     "git push --force origin main",
		Destructive: true,
	}
	score := blast.ComputeBlastRadius(ctx)

	// git.push (0.5) + destructive (0.3) + branch-sensitivity (0.3) + force-flag (0.2) = 1.3 → capped at 1.0
	if score.Level != blast.LevelCritical {
		t.Errorf("expected critical blast radius for force push to main, got %s (score=%.2f)", score.Level, score.Score)
	}
	if score.Score < 0.8 {
		t.Errorf("expected score >= 0.8 for force push, got %.2f", score.Score)
	}
}

func TestScoreCappedAtOne(t *testing.T) {
	ctx := action.ActionContext{
		Action:        "infra.destroy",
		Branch:        "main",
		Command:       "terraform destroy --force",
		Destructive:   true,
		FilesAffected: 50,
	}
	score := blast.ComputeBlastRadius(ctx)

	// infra.destroy (0.9) + destructive (0.3) + branch (0.3) + force (0.2) + bulk (0.2) = 1.9 → capped at 1.0
	if score.Score > 1.0 {
		t.Errorf("expected score capped at 1.0, got %.2f", score.Score)
	}
	if score.Score != 1.0 {
		t.Errorf("expected score to be exactly 1.0 (multiple high factors), got %.2f", score.Score)
	}
}

func TestLevelThresholds(t *testing.T) {
	tests := []struct {
		name     string
		ctx      action.ActionContext
		wantLow  float64
		wantHigh float64
		level    string
	}{
		{
			name:     "low: file.read",
			ctx:      action.ActionContext{Action: "file.read"},
			wantLow:  0.0,
			wantHigh: 0.3,
			level:    blast.LevelLow,
		},
		{
			name:     "medium: file.write with multi-file",
			ctx:      action.ActionContext{Action: "file.write", FilesAffected: 5},
			wantLow:  0.3,
			wantHigh: 0.5,
			level:    blast.LevelMedium,
		},
		{
			name:     "high: git.reset",
			ctx:      action.ActionContext{Action: "git.reset"},
			wantLow:  0.5,
			wantHigh: 0.8,
			level:    blast.LevelHigh,
		},
		{
			name:     "critical: deploy.trigger + destructive + main",
			ctx:      action.ActionContext{Action: "deploy.trigger", Branch: "main", Destructive: true},
			wantLow:  0.8,
			wantHigh: 1.01,
			level:    blast.LevelCritical,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			score := blast.ComputeBlastRadius(tt.ctx)
			if score.Score < tt.wantLow || score.Score >= tt.wantHigh {
				t.Errorf("expected score in [%.1f, %.1f), got %.2f", tt.wantLow, tt.wantHigh, score.Score)
			}
			if score.Level != tt.level {
				t.Errorf("expected level %s, got %s", tt.level, score.Level)
			}
		})
	}
}

func TestBranchSensitivity(t *testing.T) {
	branches := []struct {
		branch    string
		sensitive bool
	}{
		{"main", true},
		{"master", true},
		{"release", true},
		{"feature/foo", false},
		{"fix/bar", false},
		{"", false},
	}

	for _, b := range branches {
		t.Run("branch-"+b.branch, func(t *testing.T) {
			ctx := action.ActionContext{Action: "git.push", Branch: b.branch}
			score := blast.ComputeBlastRadius(ctx)

			hasBranchFactor := false
			for _, f := range score.Factors {
				if f.Name == "branch-sensitivity" {
					hasBranchFactor = true
					break
				}
			}
			if b.sensitive && !hasBranchFactor {
				t.Errorf("expected branch-sensitivity factor for branch %q", b.branch)
			}
			if !b.sensitive && hasBranchFactor {
				t.Errorf("did not expect branch-sensitivity factor for branch %q", b.branch)
			}
		})
	}
}

func TestFileScope(t *testing.T) {
	// No file scope factor for small operations
	ctx := action.ActionContext{Action: "file.write", FilesAffected: 1}
	score := blast.ComputeBlastRadius(ctx)
	for _, f := range score.Factors {
		if f.Name == "file-scope" {
			t.Error("did not expect file-scope factor for single file")
		}
	}

	// Multi-file factor
	ctx.FilesAffected = 5
	score = blast.ComputeBlastRadius(ctx)
	found := false
	for _, f := range score.Factors {
		if f.Name == "file-scope" && f.Weight == 0.1 {
			found = true
		}
	}
	if !found {
		t.Error("expected file-scope factor (0.1) for 5 files")
	}

	// Bulk operation factor
	ctx.FilesAffected = 20
	score = blast.ComputeBlastRadius(ctx)
	found = false
	for _, f := range score.Factors {
		if f.Name == "file-scope" && f.Weight == 0.2 {
			found = true
		}
	}
	if !found {
		t.Error("expected file-scope factor (0.2) for 20 files")
	}
}

func TestForceFlagDetection(t *testing.T) {
	tests := []struct {
		command   string
		hasForce  bool
	}{
		{"git push --force origin main", true},
		{"git push -f origin main", true},
		{"terraform destroy --force", true},
		{"git push origin main", false},
		{"echo -f flag test", true},  // -f as standalone token
		{"ls -la", false},
		{"", false},
	}

	for _, tt := range tests {
		t.Run(tt.command, func(t *testing.T) {
			ctx := action.ActionContext{Action: "shell.exec", Command: tt.command}
			score := blast.ComputeBlastRadius(ctx)
			found := false
			for _, f := range score.Factors {
				if f.Name == "force-flag" {
					found = true
					break
				}
			}
			if tt.hasForce && !found {
				t.Errorf("expected force-flag factor for command %q", tt.command)
			}
			if !tt.hasForce && found {
				t.Errorf("did not expect force-flag factor for command %q", tt.command)
			}
		})
	}
}

func TestFactorsAlwaysIncludeActionClass(t *testing.T) {
	ctx := action.ActionContext{Action: "file.read"}
	score := blast.ComputeBlastRadius(ctx)

	if len(score.Factors) == 0 {
		t.Fatal("expected at least one factor")
	}
	if score.Factors[0].Name != "action-class" {
		t.Errorf("expected first factor to be action-class, got %s", score.Factors[0].Name)
	}
}

func TestUnknownActionGetsDefaultWeight(t *testing.T) {
	ctx := action.ActionContext{Action: "custom.unknown"}
	score := blast.ComputeBlastRadius(ctx)

	// Should get default weight of 0.3
	if score.Score < 0.2 || score.Score > 0.4 {
		t.Errorf("expected default weight ~0.3 for unknown action, got %.2f", score.Score)
	}
}

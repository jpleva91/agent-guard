package confidence_test

import (
	"testing"

	"github.com/AgentGuardHQ/agentguard/go/internal/confidence"
	"github.com/AgentGuardHQ/agentguard/go/internal/monitor"
)

func TestComputeConfidence_HighConfidence(t *testing.T) {
	t.Helper()
	result := confidence.Compute(confidence.Input{
		ActionType:      "file.read",
		RetryCount:      0,
		EscalationLevel: monitor.Normal,
		FilesAffected:   1,
		MaxBlastRadius:  50,
	})
	if result.Score <= 0.9 {
		t.Errorf("expected score > 0.9 for safe action, got %f", result.Score)
	}
}

func TestComputeConfidence_LowConfidence(t *testing.T) {
	t.Helper()
	result := confidence.Compute(confidence.Input{
		ActionType:      "git.force-push",
		RetryCount:      3,
		EscalationLevel: monitor.High,
		FilesAffected:   40,
		MaxBlastRadius:  50,
	})
	if result.Score >= 0.3 {
		t.Errorf("expected score < 0.3 for dangerous action, got %f", result.Score)
	}
}

func TestComputeConfidence_UnknownAction(t *testing.T) {
	t.Helper()
	result := confidence.Compute(confidence.Input{
		ActionType:      "unknown.action",
		RetryCount:      0,
		EscalationLevel: monitor.Normal,
		FilesAffected:   1,
		MaxBlastRadius:  50,
	})
	// Unknown actions should default to medium risk (0.6)
	expectedRisk := 0.6
	if result.Breakdown.ActionRisk.Value != expectedRisk {
		t.Errorf("expected unknown action risk value %f, got %f", expectedRisk, result.Breakdown.ActionRisk.Value)
	}
}

func TestComputeConfidence_RetryDecay(t *testing.T) {
	t.Helper()
	base := confidence.Input{
		ActionType:      "file.write",
		EscalationLevel: monitor.Normal,
		FilesAffected:   1,
		MaxBlastRadius:  50,
	}

	base.RetryCount = 0
	scoreZero := confidence.Compute(base).Score

	base.RetryCount = 3
	scoreThree := confidence.Compute(base).Score

	if scoreZero <= scoreThree {
		t.Errorf("expected retry=0 score (%f) > retry=3 score (%f)", scoreZero, scoreThree)
	}
}

func TestSeverityBoost(t *testing.T) {
	t.Helper()
	cases := []struct {
		confidence float64
		maxBoost   int
		want       int
	}{
		{1.0, 3, 0},
		{0.7, 3, 0},
		{0.6, 3, 1},
		{0.3, 3, 2},
		{0.0, 3, 3},
		{0.0, 4, 4},
	}
	for _, tc := range cases {
		got := confidence.SeverityBoost(tc.confidence, tc.maxBoost)
		if got != tc.want {
			t.Errorf("SeverityBoost(%f, %d) = %d, want %d", tc.confidence, tc.maxBoost, got, tc.want)
		}
	}
}

func TestEffectiveSeverity(t *testing.T) {
	t.Helper()
	cases := []struct {
		base  int
		boost int
		want  int
	}{
		{2, 0, 2},
		{2, 2, 4},
		{4, 3, 5},
	}
	for _, tc := range cases {
		got := confidence.EffectiveSeverity(tc.base, tc.boost)
		if got != tc.want {
			t.Errorf("EffectiveSeverity(%d, %d) = %d, want %d", tc.base, tc.boost, got, tc.want)
		}
	}
}

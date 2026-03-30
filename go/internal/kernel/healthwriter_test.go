package kernel_test

import (
	"encoding/json"
	"testing"

	"github.com/AgentGuardHQ/agentguard/go/internal/kernel"
)

func TestHealthSummary_JSON(t *testing.T) {
	summary := kernel.HealthSummary{
		AvgConfidence:   0.85,
		EscalationState: "NORMAL",
		DenialRate:      0.05,
	}
	data, err := json.Marshal(summary)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded kernel.HealthSummary
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded.AvgConfidence != 0.85 {
		t.Errorf("avg_confidence: got %f, want 0.85", decoded.AvgConfidence)
	}
	if decoded.EscalationState != "NORMAL" {
		t.Errorf("escalation_state: got %s, want NORMAL", decoded.EscalationState)
	}
}

func TestComputeHealthSummary(t *testing.T) {
	stats := kernel.KernelStats{
		TotalActions: 100,
		Allowed:      95,
		Denied:       5,
	}
	summary := kernel.ComputeHealthSummary(stats, 0.82, "NORMAL")
	if summary.DenialRate != 0.05 {
		t.Errorf("denial_rate: got %f, want 0.05", summary.DenialRate)
	}
	if summary.AvgConfidence != 0.82 {
		t.Errorf("avg_confidence: got %f, want 0.82", summary.AvgConfidence)
	}
}

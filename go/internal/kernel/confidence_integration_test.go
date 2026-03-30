package kernel_test

import (
	"testing"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
	"github.com/AgentGuardHQ/agentguard/go/internal/kernel"
)

func TestPropose_ConfidencePopulated(t *testing.T) {
	k := newTestKernel(t, func(cfg *kernel.KernelConfig) {
		cfg.ConfidenceGating = &kernel.ConfidenceGating{
			Enabled:        true,
			MaxBoost:       3,
			MaxBlastRadius: 50,
		}
	})
	defer k.Close()

	result, err := k.Propose(action.RawAction{
		Tool: "Read",
		File: "README.md",
	})
	if err != nil {
		t.Fatalf("Propose: %v", err)
	}
	if result.Confidence == 0 {
		t.Error("expected non-zero confidence for file.read")
	}
	if result.Confidence < 0.9 {
		t.Errorf("expected high confidence for file.read, got %.2f", result.Confidence)
	}
}

func TestPropose_SeverityBoostApplied(t *testing.T) {
	k := newTestKernel(t, func(cfg *kernel.KernelConfig) {
		cfg.ConfidenceGating = &kernel.ConfidenceGating{
			Enabled:        true,
			MaxBoost:       3,
			MaxBlastRadius: 50,
		}
	})
	defer k.Close()

	result, err := k.Propose(action.RawAction{
		Tool:    "Bash",
		Command: "git push origin main",
	})
	if err != nil {
		t.Fatalf("Propose: %v", err)
	}
	if result.Confidence == 0 {
		t.Error("expected non-zero confidence even for denied action")
	}
	if result.EffectiveSeverity == 0 {
		t.Error("expected non-zero effective severity")
	}
}

func TestPropose_ConfidenceDisabled(t *testing.T) {
	k := newTestKernel(t, func(cfg *kernel.KernelConfig) {
		cfg.ConfidenceGating = &kernel.ConfidenceGating{
			Enabled: false,
		}
	})
	defer k.Close()

	result, err := k.Propose(action.RawAction{
		Tool: "Read",
		File: "README.md",
	})
	if err != nil {
		t.Fatalf("Propose: %v", err)
	}
	if result.Confidence != 1.0 {
		t.Errorf("expected 1.0 when disabled, got %.2f", result.Confidence)
	}
}

package monitor_test

import (
	"testing"

	"github.com/AgentGuardHQ/agentguard/go/internal/monitor"
)

func TestEscalationLevelString(t *testing.T) {
	tests := []struct {
		level monitor.EscalationLevel
		want  string
	}{
		{monitor.Normal, "NORMAL"},
		{monitor.Elevated, "ELEVATED"},
		{monitor.High, "HIGH"},
		{monitor.Lockdown, "LOCKDOWN"},
		{monitor.EscalationLevel(99), "UNKNOWN"},
	}
	for _, tt := range tests {
		if got := tt.level.String(); got != tt.want {
			t.Errorf("EscalationLevel(%d).String() = %q, want %q", tt.level, got, tt.want)
		}
	}
}

func TestParseEscalationLevel(t *testing.T) {
	tests := []struct {
		input string
		want  monitor.EscalationLevel
	}{
		{"NORMAL", monitor.Normal},
		{"ELEVATED", monitor.Elevated},
		{"HIGH", monitor.High},
		{"LOCKDOWN", monitor.Lockdown},
		{"invalid", monitor.Normal},
		{"", monitor.Normal},
	}
	for _, tt := range tests {
		if got := monitor.ParseEscalationLevel(tt.input); got != tt.want {
			t.Errorf("ParseEscalationLevel(%q) = %d, want %d", tt.input, got, tt.want)
		}
	}
}

func TestEscalationLevelOrdering(t *testing.T) {
	if monitor.Normal >= monitor.Elevated {
		t.Error("Normal should be less than Elevated")
	}
	if monitor.Elevated >= monitor.High {
		t.Error("Elevated should be less than High")
	}
	if monitor.High >= monitor.Lockdown {
		t.Error("High should be less than Lockdown")
	}
}

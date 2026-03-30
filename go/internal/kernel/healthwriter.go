package kernel

import "time"

// HealthSummary is the lightweight kernel health payload written to Redis.
type HealthSummary struct {
	AvgConfidence   float64 `json:"avg_confidence"`
	EscalationState string  `json:"escalation_state"`
	DenialRate      float64 `json:"denial_rate"`
	UpdatedAt       string  `json:"updated_at"`
}

// ComputeHealthSummary builds a HealthSummary from kernel stats.
func ComputeHealthSummary(stats KernelStats, avgConfidence float64, escalationState string) HealthSummary {
	var denialRate float64
	if stats.TotalActions > 0 {
		denialRate = float64(stats.Denied) / float64(stats.TotalActions)
	}
	return HealthSummary{
		AvgConfidence:   avgConfidence,
		EscalationState: escalationState,
		DenialRate:      denialRate,
		UpdatedAt:       time.Now().UTC().Format(time.RFC3339),
	}
}

// Package signals provides a governance intelligence API for external consumption.
// It aggregates internal kernel events into consumable signals for dashboards,
// CI pipelines, and monitoring tools. This is a read-only API — it never mutates
// the event store.
package signals

// Signal represents a governance intelligence signal for external consumption.
type Signal struct {
	Kind      string            `json:"kind"`
	Timestamp int64             `json:"timestamp"`
	Value     any               `json:"value"`
	Metadata  map[string]string `json:"metadata,omitempty"`
}

// SignalKind constants define the known signal types.
const (
	DenialRate           = "governance.denial_rate"
	EscalationLevel      = "governance.escalation_level"
	InvariantHitRate     = "governance.invariant_hit_rate"
	BlastRadiusTrend     = "governance.blast_radius_trend"
	AgentComplianceScore = "governance.agent_compliance"
	ActionThroughput     = "governance.action_throughput"
	TopViolations        = "governance.top_violations"
	SessionHealth        = "governance.session_health"
)

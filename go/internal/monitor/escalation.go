// Package monitor provides the escalation state machine for the AgentGuard Go kernel.
// Escalation levels: NORMAL → ELEVATED → HIGH → LOCKDOWN.
package monitor

// EscalationLevel represents the current session security posture.
type EscalationLevel int

const (
	Normal   EscalationLevel = 0
	Elevated EscalationLevel = 1
	High     EscalationLevel = 2
	Lockdown EscalationLevel = 3
)

// String returns the human-readable name of the escalation level.
func (e EscalationLevel) String() string {
	switch e {
	case Normal:
		return "NORMAL"
	case Elevated:
		return "ELEVATED"
	case High:
		return "HIGH"
	case Lockdown:
		return "LOCKDOWN"
	default:
		return "UNKNOWN"
	}
}

// ParseEscalationLevel parses a string escalation level name.
func ParseEscalationLevel(s string) EscalationLevel {
	switch s {
	case "NORMAL":
		return Normal
	case "ELEVATED":
		return Elevated
	case "HIGH":
		return High
	case "LOCKDOWN":
		return Lockdown
	default:
		return Normal
	}
}

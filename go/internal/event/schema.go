// Package event provides the canonical event model for the AgentGuard Go kernel.
package event

import (
	"time"
)

// Kind represents the category of an event.
type Kind string

const (
	// Governance events
	KindPolicyDenied       Kind = "PolicyDenied"
	KindUnauthorizedAction Kind = "UnauthorizedAction"
	KindInvariantViolation Kind = "InvariantViolation"

	// Lifecycle events
	KindRunStarted        Kind = "RunStarted"
	KindRunEnded          Kind = "RunEnded"
	KindCheckpointReached Kind = "CheckpointReached"
	KindStateChanged      Kind = "StateChanged"

	// Reference monitor events
	KindActionRequested Kind = "ActionRequested"
	KindActionAllowed   Kind = "ActionAllowed"
	KindActionDenied    Kind = "ActionDenied"
	KindActionEscalated Kind = "ActionEscalated"
	KindActionExecuted  Kind = "ActionExecuted"
	KindActionFailed    Kind = "ActionFailed"

	// Safety events
	KindBlastRadiusExceeded Kind = "BlastRadiusExceeded"

	// Heartbeat events
	KindHeartbeatEmitted   Kind = "HeartbeatEmitted"
	KindHeartbeatMissed    Kind = "HeartbeatMissed"
	KindAgentUnresponsive  Kind = "AgentUnresponsive"
)

// Category groups event kinds for filtering.
type Category string

const (
	CategoryGovernance Category = "governance"
	CategoryLifecycle  Category = "lifecycle"
	CategoryRefMonitor Category = "ref_monitor"
	CategorySafety     Category = "safety"
	CategoryHeartbeat  Category = "heartbeat"
)

// CategoryOf returns the category for a given event kind.
func CategoryOf(k Kind) Category {
	switch k {
	case KindPolicyDenied, KindUnauthorizedAction, KindInvariantViolation:
		return CategoryGovernance
	case KindRunStarted, KindRunEnded, KindCheckpointReached, KindStateChanged:
		return CategoryLifecycle
	case KindActionRequested, KindActionAllowed, KindActionDenied,
		KindActionEscalated, KindActionExecuted, KindActionFailed:
		return CategoryRefMonitor
	case KindBlastRadiusExceeded:
		return CategorySafety
	case KindHeartbeatEmitted, KindHeartbeatMissed, KindAgentUnresponsive:
		return CategoryHeartbeat
	default:
		return ""
	}
}

// Event is the canonical event type that flows through the kernel event bus.
type Event struct {
	ID        string         `json:"id"`
	Kind      Kind           `json:"kind"`
	Timestamp time.Time      `json:"timestamp"`
	RunID     string         `json:"runId"`
	SessionID string         `json:"sessionId,omitempty"`
	AgentID   string         `json:"agentId,omitempty"`
	Data      map[string]any `json:"data,omitempty"`
}

// NewEvent creates a new Event with the given kind and run ID.
// The ID is set to a simple timestamp-based value; the timestamp is set to now.
func NewEvent(kind Kind, runID string, data map[string]any) Event {
	now := time.Now()
	return Event{
		ID:        now.Format("20060102T150405.000000000"),
		Kind:      kind,
		Timestamp: now,
		RunID:     runID,
		Data:      data,
	}
}

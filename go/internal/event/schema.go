// Package event defines the canonical event model for the AgentGuard Go kernel.
// All system activity becomes events. The kernel produces governance events.
// Subscribers (signals API, audit trail) consume them.
package event

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

// Kind represents the type of a domain event.
type Kind string

// Event kinds — canonical event types mirroring the TypeScript event model.
const (
	// Session lifecycle
	RunStarted         Kind = "RunStarted"
	RunEnded           Kind = "RunEnded"
	StateChanged       Kind = "StateChanged"
	CheckpointReached  Kind = "CheckpointReached"

	// Reference Monitor (Agent Action Boundary)
	ActionRequested Kind = "ActionRequested"
	ActionAllowed   Kind = "ActionAllowed"
	ActionDenied    Kind = "ActionDenied"
	ActionEscalated Kind = "ActionEscalated"
	ActionExecuted  Kind = "ActionExecuted"
	ActionFailed    Kind = "ActionFailed"

	// Confidence-Gated HITL
	PauseRequested Kind = "PauseRequested"
	PauseResolved  Kind = "PauseResolved"

	// Governance
	PolicyDenied         Kind = "PolicyDenied"
	UnauthorizedAction   Kind = "UnauthorizedAction"
	InvariantViolation   Kind = "InvariantViolation"
	BlastRadiusExceeded  Kind = "BlastRadiusExceeded"
	MergeGuardFailure    Kind = "MergeGuardFailure"
	EvidencePackGenerated Kind = "EvidencePackGenerated"

	// Decision & Simulation
	DecisionRecorded    Kind = "DecisionRecorded"
	SimulationCompleted Kind = "SimulationCompleted"

	// Policy
	PolicyComposed      Kind = "PolicyComposed"
	PolicyTraceRecorded Kind = "PolicyTraceRecorded"

	// Pipeline
	PipelineStarted    Kind = "PipelineStarted"
	StageCompleted     Kind = "StageCompleted"
	StageFailed        Kind = "StageFailed"
	PipelineCompleted  Kind = "PipelineCompleted"
	PipelineFailed     Kind = "PipelineFailed"
	FileScopeViolation Kind = "FileScopeViolation"

	// Developer Signals
	FileSaved       Kind = "FileSaved"
	TestCompleted   Kind = "TestCompleted"
	BuildCompleted  Kind = "BuildCompleted"
	CommitCreated   Kind = "CommitCreated"
	CodeReviewed    Kind = "CodeReviewed"
	DeployCompleted Kind = "DeployCompleted"
	LintCompleted   Kind = "LintCompleted"

	// Token Optimization
	TokenOptimizationApplied Kind = "TokenOptimizationApplied"

	// Agent Liveness
	HeartbeatEmitted  Kind = "HeartbeatEmitted"
	HeartbeatMissed   Kind = "HeartbeatMissed"
	AgentUnresponsive Kind = "AgentUnresponsive"

	// Integrity & Trust
	HookIntegrityVerified Kind = "HookIntegrityVerified"
	HookIntegrityFailed   Kind = "HookIntegrityFailed"
	PolicyTrustVerified   Kind = "PolicyTrustVerified"
	PolicyTrustDenied     Kind = "PolicyTrustDenied"

	// Analytics & Learning
	AdoptionAnalyzed       Kind = "AdoptionAnalyzed"
	AdoptionAnalysisFailed Kind = "AdoptionAnalysisFailed"
	DenialPatternDetected  Kind = "DenialPatternDetected"

	// Drift & Validation
	IntentDriftDetected  Kind = "IntentDriftDetected"
	CapabilityValidated  Kind = "CapabilityValidated"
	IdeSocketAccessBlocked Kind = "IdeSocketAccessBlocked"
)

// Category groups event kinds for filtering.
type Category string

const (
	CategoryGovernance  Category = "governance"
	CategoryLifecycle   Category = "lifecycle"
	CategoryRefMonitor  Category = "ref_monitor"
	CategorySafety      Category = "safety"
	CategoryHeartbeat   Category = "heartbeat"
)

// CategoryOf returns the category for an event kind.
func CategoryOf(k Kind) Category {
	switch k {
	case RunStarted, RunEnded, CheckpointReached, StateChanged:
		return CategoryLifecycle
	case ActionRequested, ActionAllowed, ActionDenied, ActionEscalated, ActionExecuted, ActionFailed, PauseRequested, PauseResolved:
		return CategoryRefMonitor
	case PolicyDenied, UnauthorizedAction, InvariantViolation, BlastRadiusExceeded, MergeGuardFailure, EvidencePackGenerated:
		return CategoryGovernance
	case HeartbeatEmitted, HeartbeatMissed, AgentUnresponsive:
		return CategoryHeartbeat
	default:
		return ""
	}
}

// Event is the canonical domain event structure.
type Event struct {
	ID        string         `json:"id"`
	Kind      Kind           `json:"kind"`
	Timestamp int64          `json:"timestamp"`
	RunID     string         `json:"runId,omitempty"`
	SessionID string         `json:"sessionId,omitempty"`
	Data      map[string]any `json:"data,omitempty"`
}

// NewEvent creates a new event with a random ID and current timestamp.
func NewEvent(kind Kind, runID string, data map[string]any) Event {
	return Event{
		ID:        randomID(),
		Kind:      kind,
		Timestamp: time.Now().UnixMilli(),
		RunID:     runID,
		Data:      data,
	}
}

// NewEventAt creates a new event with a specific timestamp (for testing).
func NewEventAt(kind Kind, ts int64, data map[string]any) Event {
	return Event{
		ID:        randomID(),
		Kind:      kind,
		Timestamp: ts,
		Data:      data,
	}
}

func randomID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

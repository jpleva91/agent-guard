// Package event provides the canonical event model for the AgentGuard Go kernel.
//
// All system activity becomes events. The kernel produces governance events.
// Subscribers (TUI renderer, SQLite sink, CLI inspect) consume them.
// This package defines event kinds, the Event struct, a factory function,
// and validation.
package event

import (
	"crypto/rand"
	"errors"
	"fmt"
	"time"
)

// EventKind is a string discriminator for all canonical event types.
type EventKind string

// --- Session / Lifecycle ---

const (
	StateChanged      EventKind = "StateChanged"
	RunStarted        EventKind = "RunStarted"
	RunEnded          EventKind = "RunEnded"
	CheckpointReached EventKind = "CheckpointReached"
)

// --- Governance ---

const (
	PolicyDenied         EventKind = "PolicyDenied"
	UnauthorizedAction   EventKind = "UnauthorizedAction"
	InvariantViolation   EventKind = "InvariantViolation"
	BlastRadiusExceeded  EventKind = "BlastRadiusExceeded"
	MergeGuardFailure    EventKind = "MergeGuardFailure"
	EvidencePackGenerated EventKind = "EvidencePackGenerated"
)

// --- Reference Monitor (Agent Action Boundary) ---

const (
	ActionRequested EventKind = "ActionRequested"
	ActionAllowed   EventKind = "ActionAllowed"
	ActionDenied    EventKind = "ActionDenied"
	ActionEscalated EventKind = "ActionEscalated"
	ActionExecuted  EventKind = "ActionExecuted"
	ActionFailed    EventKind = "ActionFailed"
)

// --- Decision Records ---

const (
	DecisionRecorded EventKind = "DecisionRecorded"
)

// --- Policy Composition ---

const (
	PolicyComposed EventKind = "PolicyComposed"
)

// --- Policy Traces ---

const (
	PolicyTraceRecorded EventKind = "PolicyTraceRecorded"
)

// --- Simulation ---

const (
	SimulationCompleted EventKind = "SimulationCompleted"
)

// --- Pipeline ---

const (
	PipelineStarted    EventKind = "PipelineStarted"
	StageCompleted     EventKind = "StageCompleted"
	StageFailed        EventKind = "StageFailed"
	PipelineCompleted  EventKind = "PipelineCompleted"
	PipelineFailed     EventKind = "PipelineFailed"
	FileScopeViolation EventKind = "FileScopeViolation"
)

// --- Developer Signals ---

const (
	FileSaved       EventKind = "FileSaved"
	TestCompleted   EventKind = "TestCompleted"
	BuildCompleted  EventKind = "BuildCompleted"
	CommitCreated   EventKind = "CommitCreated"
	CodeReviewed    EventKind = "CodeReviewed"
	DeployCompleted EventKind = "DeployCompleted"
	LintCompleted   EventKind = "LintCompleted"
)

// --- Token Optimization ---

const (
	TokenOptimizationApplied EventKind = "TokenOptimizationApplied"
)

// --- Agent Liveness ---

const (
	HeartbeatEmitted  EventKind = "HeartbeatEmitted"
	HeartbeatMissed   EventKind = "HeartbeatMissed"
	AgentUnresponsive EventKind = "AgentUnresponsive"
)

// --- Integrity & Trust ---

const (
	HookIntegrityVerified EventKind = "HookIntegrityVerified"
	HookIntegrityFailed   EventKind = "HookIntegrityFailed"
	PolicyTrustVerified   EventKind = "PolicyTrustVerified"
	PolicyTrustDenied     EventKind = "PolicyTrustDenied"
)

// --- Adoption Analytics ---

const (
	AdoptionAnalyzed      EventKind = "AdoptionAnalyzed"
	AdoptionAnalysisFailed EventKind = "AdoptionAnalysisFailed"
)

// --- Denial Learning ---

const (
	DenialPatternDetected EventKind = "DenialPatternDetected"
)

// --- Intent Drift ---

const (
	IntentDriftDetected EventKind = "IntentDriftDetected"
)

// --- Capability Validation ---

const (
	CapabilityValidated EventKind = "CapabilityValidated"
)

// --- Environmental Enforcement ---

const (
	IdeSocketAccessBlocked EventKind = "IdeSocketAccessBlocked"
)

// AllEventKinds is the complete set of known event kinds.
// Used for validation and enumeration.
var AllEventKinds = []EventKind{
	// Session
	StateChanged, RunStarted, RunEnded, CheckpointReached,
	// Governance
	PolicyDenied, UnauthorizedAction, InvariantViolation,
	BlastRadiusExceeded, MergeGuardFailure, EvidencePackGenerated,
	// Reference Monitor
	ActionRequested, ActionAllowed, ActionDenied,
	ActionEscalated, ActionExecuted, ActionFailed,
	// Decision Records
	DecisionRecorded,
	// Policy Composition
	PolicyComposed,
	// Policy Traces
	PolicyTraceRecorded,
	// Simulation
	SimulationCompleted,
	// Pipeline
	PipelineStarted, StageCompleted, StageFailed,
	PipelineCompleted, PipelineFailed, FileScopeViolation,
	// Developer Signals
	FileSaved, TestCompleted, BuildCompleted,
	CommitCreated, CodeReviewed, DeployCompleted, LintCompleted,
	// Token Optimization
	TokenOptimizationApplied,
	// Agent Liveness
	HeartbeatEmitted, HeartbeatMissed, AgentUnresponsive,
	// Integrity & Trust
	HookIntegrityVerified, HookIntegrityFailed,
	PolicyTrustVerified, PolicyTrustDenied,
	// Adoption Analytics
	AdoptionAnalyzed, AdoptionAnalysisFailed,
	// Denial Learning
	DenialPatternDetected,
	// Intent Drift
	IntentDriftDetected,
	// Capability Validation
	CapabilityValidated,
	// Environmental Enforcement
	IdeSocketAccessBlocked,
}

// validKinds is a lookup set built from AllEventKinds for O(1) validation.
var validKinds map[EventKind]struct{}

func init() {
	validKinds = make(map[EventKind]struct{}, len(AllEventKinds))
	for _, k := range AllEventKinds {
		validKinds[k] = struct{}{}
	}
}

// IsValidKind reports whether kind is a recognized event kind.
func IsValidKind(kind EventKind) bool {
	_, ok := validKinds[kind]
	return ok
}

// Event is the canonical domain event for the AgentGuard kernel.
// Every governance action, lifecycle transition, and system signal
// is represented as an Event flowing through the event bus and store.
type Event struct {
	ID        string            `json:"id"`
	Kind      EventKind         `json:"kind"`
	Timestamp time.Time         `json:"timestamp"`
	SessionID string            `json:"sessionId"`
	RunID     string            `json:"runId,omitempty"`
	Source    string            `json:"source,omitempty"`
	Payload   map[string]any    `json:"payload,omitempty"`
	Metadata  map[string]string `json:"metadata,omitempty"`
}

// NewEvent creates a new Event with an auto-generated UUID and the current
// timestamp. The payload is attached as-is; use Validate to check the result.
func NewEvent(kind EventKind, sessionID string, payload map[string]any) Event {
	return Event{
		ID:        generateUUID(),
		Kind:      kind,
		Timestamp: time.Now(),
		SessionID: sessionID,
		Payload:   payload,
	}
}

// Validate checks that an Event has the minimum required fields.
// It returns nil if the event is valid.
func Validate(e Event) error {
	var errs []error

	if e.ID == "" {
		errs = append(errs, errors.New("event ID is required"))
	}
	if e.Kind == "" {
		errs = append(errs, errors.New("event kind is required"))
	} else if !IsValidKind(e.Kind) {
		errs = append(errs, fmt.Errorf("unknown event kind: %s", e.Kind))
	}
	if e.SessionID == "" {
		errs = append(errs, errors.New("event sessionID is required"))
	}
	if e.Timestamp.IsZero() {
		errs = append(errs, errors.New("event timestamp is required"))
	}

	return joinErrors(errs)
}

// joinErrors concatenates multiple errors into a single error.
// Returns nil if the slice is empty. Compatible with Go 1.18 (no errors.Join).
func joinErrors(errs []error) error {
	var nonNil []error
	for _, e := range errs {
		if e != nil {
			nonNil = append(nonNil, e)
		}
	}
	if len(nonNil) == 0 {
		return nil
	}
	msg := nonNil[0].Error()
	for _, e := range nonNil[1:] {
		msg += "\n" + e.Error()
	}
	return errors.New(msg)
}

// generateUUID produces a version-4 UUID using crypto/rand.
// No external dependencies required.
func generateUUID() string {
	var buf [16]byte
	// crypto/rand.Read always returns len(buf) on supported platforms.
	_, _ = rand.Read(buf[:])
	// Set version 4 and variant bits per RFC 4122.
	buf[6] = (buf[6] & 0x0f) | 0x40
	buf[8] = (buf[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		buf[0:4], buf[4:6], buf[6:8], buf[8:10], buf[10:16])
}

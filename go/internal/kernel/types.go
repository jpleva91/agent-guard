// Package kernel provides the governed action kernel — the central orchestrator
// for the AgentGuard runtime. It ties normalization, policy evaluation, and
// result building into a single propose() call that mirrors the TypeScript
// kernel pipeline: propose -> normalize -> evaluate -> (invariant check) ->
// execute -> emit.
package kernel

import (
	"time"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
	"github.com/AgentGuardHQ/agentguard/go/internal/event"
)

// KernelConfig holds the configuration for a Kernel instance.
type KernelConfig struct {
	// PolicyPaths is the list of YAML/JSON policy files to load.
	PolicyPaths []string
	// DryRun when true evaluates policies but skips execution.
	DryRun bool
	// DisabledInvariants lists invariant IDs that should be skipped.
	DisabledInvariants []string
	// DefaultDeny when true denies actions that match no rule (fail-closed).
	DefaultDeny bool
	// AgentName identifies the agent in governance decisions.
	AgentName string
	// SessionID is an optional pre-assigned session identifier.
	// If empty, the kernel generates one automatically.
	SessionID string
	// EventBus is an optional event bus for publishing KE-3 governance events.
	// When set, the kernel emits ActionRequested, ActionAllowed, and ActionDenied
	// events for every Propose call. Telemetry failures never block enforcement.
	EventBus *event.Bus
}

// KernelResult is the output of a single Propose call. It captures the
// full governance decision — what was decided, why, and any corrective
// suggestions offered by the policy.
type KernelResult struct {
	// Decision is the governance outcome: "allow", "deny", "escalate", or "intervene".
	Decision string `json:"decision"`
	// Reason is the human-readable justification for the decision.
	Reason string `json:"reason"`
	// Action is the normalized vendor-neutral action context.
	Action action.ActionContext `json:"action"`
	// EvalResult is the raw policy evaluation result.
	EvalResult action.EvalResult `json:"evalResult"`
	// BlastRadius is a placeholder score (blast/ package built separately).
	BlastRadius float64 `json:"blastRadius"`
	// InvariantViolations lists any invariant violations detected (placeholder).
	InvariantViolations []string `json:"invariantViolations,omitempty"`
	// Suggestion is a corrective suggestion from the matched policy rule.
	Suggestion string `json:"suggestion,omitempty"`
	// CorrectedCommand is the policy-suggested command replacement.
	CorrectedCommand string `json:"correctedCommand,omitempty"`
	// Duration is the wall-clock time spent in the Propose call.
	Duration time.Duration `json:"duration"`
	// Timestamp is when the decision was made.
	Timestamp time.Time `json:"timestamp"`
	// DryRun indicates whether execution was skipped.
	DryRun bool `json:"dryRun"`
	// SessionID is the kernel session that produced this result.
	SessionID string `json:"sessionId"`
}

// KernelStats tracks aggregate governance statistics for a kernel session.
type KernelStats struct {
	TotalActions int `json:"totalActions"`
	Allowed      int `json:"allowed"`
	Denied       int `json:"denied"`
	Escalated    int `json:"escalated"`
	Errors       int `json:"errors"`
}

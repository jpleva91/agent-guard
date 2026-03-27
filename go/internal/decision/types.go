// Package decision provides decision record types and storage for the AgentGuard kernel.
// Every governance evaluation produces a DecisionRecord that captures what was decided,
// why, and the full context at evaluation time.
package decision

import (
	"time"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
)

// DecisionType classifies the outcome of a governance evaluation.
type DecisionType string

const (
	// Allow means the action is permitted to execute.
	Allow DecisionType = "ALLOW"
	// Deny means the action is blocked.
	Deny DecisionType = "DENY"
	// Escalate means the action triggered an escalation level change.
	Escalate DecisionType = "ESCALATE"
	// Intervene means the action was modified or replaced by a corrective suggestion.
	Intervene DecisionType = "INTERVENE"
)

// InvariantResult captures the outcome of a single invariant check.
type InvariantResult struct {
	InvariantID string `json:"invariantId"`
	Name        string `json:"name"`
	Severity    int    `json:"severity"`
	Expected    string `json:"expected"`
	Actual      string `json:"actual"`
	Hold        bool   `json:"hold"`
}

// DecisionRecord is an immutable record of a single governance decision.
// It captures the full evaluation context including the action, matched policy,
// invariant results, escalation state, and any corrective suggestions.
type DecisionRecord struct {
	// ID is a unique identifier for this decision (crypto/rand based).
	ID string `json:"id"`
	// Type classifies the decision outcome.
	Type DecisionType `json:"type"`
	// Timestamp is when the decision was made.
	Timestamp time.Time `json:"timestamp"`
	// SessionID links this decision to a governance session.
	SessionID string `json:"sessionId"`
	// ActionContext is the normalized action that was evaluated.
	ActionContext action.ActionContext `json:"actionContext"`
	// PolicyRule is the policy rule that matched (nil if no match).
	PolicyRule *action.PolicyRule `json:"policyRule,omitempty"`
	// PolicyName is the name of the policy that contained the matched rule.
	PolicyName string `json:"policyName,omitempty"`
	// InvariantResults are the outcomes of invariant checks.
	InvariantResults []InvariantResult `json:"invariantResults,omitempty"`
	// Reason is the human-readable explanation for the decision.
	Reason string `json:"reason"`
	// Severity is the numeric severity level (0-5).
	Severity string `json:"severity,omitempty"`
	// Suggestion is a corrective suggestion message.
	Suggestion string `json:"suggestion,omitempty"`
	// CorrectedCommand is a replacement command when intervention type is modify.
	CorrectedCommand string `json:"correctedCommand,omitempty"`
	// EscalationLevel is the escalation level at decision time.
	EscalationLevel string `json:"escalationLevel,omitempty"`
	// Evidence holds additional context for audit and debugging.
	Evidence map[string]any `json:"evidence,omitempty"`
	// Duration is how long the evaluation took.
	Duration time.Duration `json:"duration"`
}

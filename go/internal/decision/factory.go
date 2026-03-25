package decision

import (
	"crypto/rand"
	"encoding/hex"
	"time"

	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
)

// generateID returns a unique decision record ID using crypto/rand.
// Format: "dec_<16 hex chars>" (8 random bytes).
func generateID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		// Fallback: this should never happen in practice.
		panic("decision: crypto/rand failed: " + err.Error())
	}
	return "dec_" + hex.EncodeToString(b)
}

// NewAllowDecision creates a DecisionRecord for an allowed action.
func NewAllowDecision(
	ctx action.ActionContext,
	sessionID string,
	rule *action.PolicyRule,
	policyName string,
) DecisionRecord {
	return DecisionRecord{
		ID:            generateID(),
		Type:          Allow,
		Timestamp:     time.Now(),
		SessionID:     sessionID,
		ActionContext: ctx,
		PolicyRule:    rule,
		PolicyName:    policyName,
		Reason:        "Action allowed by policy",
	}
}

// NewDenyDecision creates a DecisionRecord for a denied action.
func NewDenyDecision(
	ctx action.ActionContext,
	sessionID string,
	reason string,
	severity string,
	rule *action.PolicyRule,
	policyName string,
) DecisionRecord {
	return DecisionRecord{
		ID:            generateID(),
		Type:          Deny,
		Timestamp:     time.Now(),
		SessionID:     sessionID,
		ActionContext: ctx,
		PolicyRule:    rule,
		PolicyName:    policyName,
		Reason:        reason,
		Severity:      severity,
	}
}

// NewEscalateDecision creates a DecisionRecord for an escalated action.
func NewEscalateDecision(
	ctx action.ActionContext,
	sessionID string,
	reason string,
	level string,
) DecisionRecord {
	return DecisionRecord{
		ID:              generateID(),
		Type:            Escalate,
		Timestamp:       time.Now(),
		SessionID:       sessionID,
		ActionContext:   ctx,
		Reason:          reason,
		EscalationLevel: level,
	}
}

// NewInterveneDecision creates a DecisionRecord for an action that was
// modified or replaced with a corrective suggestion.
func NewInterveneDecision(
	ctx action.ActionContext,
	sessionID string,
	reason string,
	suggestion string,
	corrected string,
) DecisionRecord {
	return DecisionRecord{
		ID:               generateID(),
		Type:             Intervene,
		Timestamp:        time.Now(),
		SessionID:        sessionID,
		ActionContext:    ctx,
		Reason:           reason,
		Suggestion:       suggestion,
		CorrectedCommand: corrected,
	}
}

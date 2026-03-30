// Package confidence computes a 0.0-1.0 confidence score from four weighted
// signals: action risk tier, retry count, escalation state, and blast radius.
// The score is used downstream to modify action severity.
package confidence

import (
	"math"

	"github.com/AgentGuardHQ/agentguard/go/internal/monitor"
)

// Signal weights — must sum to 1.0.
const (
	WeightActionRisk      = 0.40
	WeightRetryCount      = 0.25
	WeightEscalationState = 0.20
	WeightBlastRadius     = 0.15
)

// Input holds the raw signals fed into the confidence computation.
type Input struct {
	ActionType      string
	RetryCount      int
	EscalationLevel monitor.EscalationLevel
	FilesAffected   int
	MaxBlastRadius  int
}

// SignalContribution records a single signal's value, its weight, and its
// weighted contribution to the final score.
type SignalContribution struct {
	Value        float64 `json:"value"`
	Weight       float64 `json:"weight"`
	Contribution float64 `json:"contribution"`
}

// Breakdown provides per-signal transparency into the score computation.
type Breakdown struct {
	ActionRisk      SignalContribution `json:"actionRisk"`
	RetryCount      SignalContribution `json:"retryCount"`
	EscalationState SignalContribution `json:"escalationState"`
	BlastRadius     SignalContribution `json:"blastRadius"`
}

// Result holds the final confidence score and its per-signal breakdown.
type Result struct {
	Score     float64   `json:"score"`
	Breakdown Breakdown `json:"breakdown"`
}

// Compute returns a confidence Result for the given Input.
// The score is a weighted linear combination of the four signals, clamped to [0,1].
func Compute(in Input) Result {
	ar := ActionRiskValue(in.ActionType)
	rc := retryValue(in.RetryCount)
	es := EscalationValue(in.EscalationLevel)
	br := BlastRadiusValue(in.FilesAffected, in.MaxBlastRadius)

	arContrib := ar * WeightActionRisk
	rcContrib := rc * WeightRetryCount
	esContrib := es * WeightEscalationState
	brContrib := br * WeightBlastRadius

	score := arContrib + rcContrib + esContrib + brContrib
	score = clamp(score, 0.0, 1.0)

	return Result{
		Score: score,
		Breakdown: Breakdown{
			ActionRisk:      SignalContribution{Value: ar, Weight: WeightActionRisk, Contribution: arContrib},
			RetryCount:      SignalContribution{Value: rc, Weight: WeightRetryCount, Contribution: rcContrib},
			EscalationState: SignalContribution{Value: es, Weight: WeightEscalationState, Contribution: esContrib},
			BlastRadius:     SignalContribution{Value: br, Weight: WeightBlastRadius, Contribution: brContrib},
		},
	}
}

// SeverityBoost returns floor((1 - confidence) * maxBoost).
func SeverityBoost(conf float64, maxBoost int) int {
	return int(math.Floor((1 - conf) * float64(maxBoost)))
}

// EffectiveSeverity returns min(baseSeverity + boost, 5).
func EffectiveSeverity(baseSeverity, boost int) int {
	s := baseSeverity + boost
	if s > 5 {
		return 5
	}
	return s
}

// EscalationValue maps an escalation level to a 0.0-1.0 confidence signal.
// Higher escalation = lower confidence.
func EscalationValue(level monitor.EscalationLevel) float64 {
	switch level {
	case monitor.Normal:
		return 1.0
	case monitor.Elevated:
		return 0.5
	case monitor.High:
		return 0.2
	case monitor.Lockdown:
		return 0.0
	default:
		return 0.0
	}
}

// BlastRadiusValue maps files affected to a 0.0-1.0 confidence signal.
// 1 file = 1.0 (highest confidence), linear decay to 0.0 at max.
func BlastRadiusValue(filesAffected, max int) float64 {
	if max <= 1 {
		return 1.0
	}
	if filesAffected <= 1 {
		return 1.0
	}
	if filesAffected >= max {
		return 0.0
	}
	return 1.0 - float64(filesAffected-1)/float64(max-1)
}

// retryValue maps retry count to a 0.0-1.0 confidence signal.
// 0 retries = 1.0, exponential decay: 1 / (1 + retryCount).
func retryValue(retryCount int) float64 {
	if retryCount <= 0 {
		return 1.0
	}
	return 1.0 / (1.0 + float64(retryCount))
}

// clamp restricts v to [lo, hi].
func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

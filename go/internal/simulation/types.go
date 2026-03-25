// Package simulation provides pre-execution impact prediction for the AgentGuard kernel.
//
// Each simulator evaluates a specific class of actions (filesystem, git, package)
// and returns a list of predicted impacts. The forecast builder aggregates
// simulator results into a composite risk assessment.
package simulation

import (
	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
)

// Impact severity constants.
const (
	SeverityNone     = "none"
	SeverityLow      = "low"
	SeverityMedium   = "medium"
	SeverityHigh     = "high"
	SeverityCritical = "critical"
)

// Impact type constants.
const (
	TypeFilesystem = "filesystem"
	TypeGit        = "git"
	TypePackage    = "package"
)

// Impact describes a single predicted side effect of an action.
type Impact struct {
	// Type is the impact category: filesystem, git, or package.
	Type string
	// Description is a human-readable summary of the impact.
	Description string
	// Severity is the assessed severity: none, low, medium, high, or critical.
	Severity string
	// Paths lists the file or ref paths affected by this impact.
	Paths []string
	// Reversible indicates whether the impact can be undone.
	Reversible bool
}

// Forecast is the aggregate risk assessment for an action.
type Forecast struct {
	// Impacts is the list of individual predicted impacts from all simulators.
	Impacts []Impact
	// RiskScore is the composite risk score (0.0–1.0).
	RiskScore float64
	// Summary is a human-readable description of the overall risk.
	Summary string
	// Warnings lists specific risk concerns that require attention.
	Warnings []string
}

// Simulator predicts the impact of an action without executing it.
type Simulator interface {
	// Simulate evaluates the action context and returns predicted impacts.
	// Returns nil impacts (not an error) if the action type is not relevant.
	Simulate(ctx action.ActionContext) ([]Impact, error)
}

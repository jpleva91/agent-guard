// Package blast provides blast radius computation for the AgentGuard kernel.
//
// The blast radius is a weighted score (0.0–1.0) that estimates the impact of
// an agent action. It considers action class, destructive flags, branch
// sensitivity, file scope, and force operations to produce a composite score
// along with the contributing factors.
package blast

import (
	"math"
	"strings"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
)

// Level constants for blast radius severity.
const (
	LevelLow      = "low"
	LevelMedium   = "medium"
	LevelHigh     = "high"
	LevelCritical = "critical"
)

// Factor describes a single contributor to the blast radius score.
type Factor struct {
	// Name is a short identifier for this factor (e.g., "action-class", "destructive").
	Name string
	// Weight is the additive contribution to the score (0.0–1.0 range).
	Weight float64
	// Description explains why this factor applies.
	Description string
}

// BlastScore is the result of a blast radius computation.
type BlastScore struct {
	// Score is the composite blast radius (0.0–1.0, capped).
	Score float64
	// Level is the human-readable severity: low, medium, high, or critical.
	Level string
	// Factors lists every contributor that added to the score.
	Factors []Factor
}

// protectedBranches are branch names that receive elevated blast radius.
var protectedBranches = map[string]bool{
	"main":    true,
	"master":  true,
	"release": true,
}

// actionClassWeights maps action class prefixes to their base weight ranges.
// The weight represents the base contribution of the action class to the score.
var actionClassWeights = map[string]float64{
	"file.read":          0.1,
	"file.write":         0.2,
	"file.delete":        0.3,
	"file.move":          0.2,
	"git.diff":           0.3,
	"git.commit":         0.3,
	"git.push":           0.5,
	"git.branch.create":  0.3,
	"git.branch.delete":  0.4,
	"git.checkout":       0.3,
	"git.reset":          0.6,
	"git.merge":          0.5,
	"git.worktree.add":   0.2,
	"git.worktree.remove": 0.3,
	"git.worktree.list":  0.1,
	"shell.exec":         0.3,
	"npm.install":        0.3,
	"npm.script.run":     0.2,
	"npm.publish":        0.5,
	"http.request":       0.2,
	"deploy.trigger":     0.8,
	"infra.apply":        0.9,
	"infra.destroy":      0.9,
	"mcp.call":           0.3,
	"test.run":           0.1,
	"test.run.unit":      0.1,
	"test.run.integration": 0.1,
}

// ComputeBlastRadius computes a weighted blast radius score for an action.
//
// The score is composed additively from independent factors:
//   - Action class weight: base weight from the action type
//   - Destructive flag: +0.3 if the action is marked destructive
//   - Branch sensitivity: +0.3 for main/master/release branches
//   - File scope: +0.1 for multi-file operations (>3 files), +0.2 for bulk (>10)
//   - Force flags: +0.2 if the command contains --force or -f
//
// The final score is capped at 1.0.
func ComputeBlastRadius(ctx action.ActionContext) BlastScore {
	var factors []Factor
	score := 0.0

	// Factor 1: Action class weight
	classWeight := lookupActionWeight(ctx.Action)
	factors = append(factors, Factor{
		Name:        "action-class",
		Weight:      classWeight,
		Description: "Base weight for action type: " + ctx.Action,
	})
	score += classWeight

	// Factor 2: Destructive flag
	if ctx.Destructive {
		factors = append(factors, Factor{
			Name:        "destructive",
			Weight:      0.3,
			Description: "Action is marked as destructive",
		})
		score += 0.3
	}

	// Factor 3: Branch sensitivity
	if ctx.Branch != "" && protectedBranches[ctx.Branch] {
		factors = append(factors, Factor{
			Name:        "branch-sensitivity",
			Weight:      0.3,
			Description: "Targets protected branch: " + ctx.Branch,
		})
		score += 0.3
	}

	// Factor 4: File scope
	filesAffected := ctx.FilesAffected
	if filesAffected > 10 {
		factors = append(factors, Factor{
			Name:        "file-scope",
			Weight:      0.2,
			Description: "Bulk operation affecting many files",
		})
		score += 0.2
	} else if filesAffected > 3 {
		factors = append(factors, Factor{
			Name:        "file-scope",
			Weight:      0.1,
			Description: "Multi-file operation",
		})
		score += 0.1
	}

	// Factor 5: Force flags in command
	if hasForceFlag(ctx.Command) {
		factors = append(factors, Factor{
			Name:        "force-flag",
			Weight:      0.2,
			Description: "Command contains force flag (--force or -f)",
		})
		score += 0.2
	}

	// Cap at 1.0
	score = math.Min(score, 1.0)

	return BlastScore{
		Score:   score,
		Level:   scoreToLevel(score),
		Factors: factors,
	}
}

// lookupActionWeight returns the base weight for an action type.
// Falls back to class-prefix matching, then a conservative default.
func lookupActionWeight(actionType string) float64 {
	// Exact match first
	if w, ok := actionClassWeights[actionType]; ok {
		return w
	}
	// Prefix match: try progressively shorter prefixes
	// e.g., "git.push" prefix "git." would catch unknown git actions
	parts := strings.Split(actionType, ".")
	for i := len(parts) - 1; i > 0; i-- {
		prefix := strings.Join(parts[:i], ".")
		if w, ok := actionClassWeights[prefix]; ok {
			return w
		}
	}
	// Conservative default for unknown action types
	return 0.3
}

// scoreToLevel converts a numeric score to a severity level string.
//
//	<0.3: low, <0.5: medium, <0.8: high, >=0.8: critical
func scoreToLevel(score float64) string {
	switch {
	case score < 0.3:
		return LevelLow
	case score < 0.5:
		return LevelMedium
	case score < 0.8:
		return LevelHigh
	default:
		return LevelCritical
	}
}

// hasForceFlag checks whether a command string contains --force or a bare -f flag.
func hasForceFlag(command string) bool {
	if command == "" {
		return false
	}
	lower := strings.ToLower(command)
	if strings.Contains(lower, "--force") {
		return true
	}
	// Check for -f as a standalone flag (not part of another flag like -rf)
	// We look for " -f " or " -f" at end or "-f " at start
	for _, token := range strings.Fields(lower) {
		if token == "-f" {
			return true
		}
	}
	return false
}

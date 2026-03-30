package confidence

// RiskTier classifies an action's inherent risk level.
type RiskTier int

const (
	RiskLow      RiskTier = 0
	RiskMedium   RiskTier = 1
	RiskHigh     RiskTier = 2
	RiskCritical RiskTier = 3
)

// RiskTierValue maps a RiskTier to its 0.0-1.0 confidence signal.
func RiskTierValue(tier RiskTier) float64 {
	switch tier {
	case RiskLow:
		return 1.0
	case RiskMedium:
		return 0.6
	case RiskHigh:
		return 0.3
	case RiskCritical:
		return 0.1
	default:
		return 0.6 // default to medium
	}
}

// ActionRiskTiers maps all 41 canonical action types to their risk tier.
var ActionRiskTiers = map[string]RiskTier{
	// Low risk — read-only, observational
	"file.read":            RiskLow,
	"git.diff":             RiskLow,
	"git.branch.list":      RiskLow,
	"git.worktree.list":    RiskLow,
	"github.pr.list":       RiskLow,
	"github.pr.view":       RiskLow,
	"github.pr.checks":     RiskLow,
	"github.issue.list":    RiskLow,
	"github.run.list":      RiskLow,
	"github.run.view":      RiskLow,
	"http.request":         RiskLow,
	"test.run":             RiskLow,
	"test.run.unit":        RiskLow,
	"test.run.integration": RiskLow,
	"mcp.call":             RiskLow,

	// Medium risk — mutating but recoverable
	"file.write":           RiskMedium,
	"file.move":            RiskMedium,
	"git.commit":           RiskMedium,
	"git.push":             RiskMedium,
	"git.checkout":         RiskMedium,
	"git.branch.create":    RiskMedium,
	"git.branch.delete":    RiskMedium,
	"git.merge":            RiskMedium,
	"git.worktree.add":     RiskMedium,
	"git.worktree.remove":  RiskMedium,
	"npm.install":          RiskMedium,
	"npm.script.run":       RiskMedium,
	"github.pr.create":     RiskMedium,
	"github.issue.create":  RiskMedium,

	// High risk — destructive or hard to reverse
	"shell.exec":              RiskHigh,
	"git.reset":               RiskHigh,
	"file.delete":             RiskHigh,
	"deploy.trigger":          RiskHigh,
	"infra.apply":             RiskHigh,
	"npm.publish":             RiskHigh,
	"github.pr.merge":         RiskHigh,
	"github.pr.close":         RiskHigh,
	"github.issue.close":      RiskHigh,
	"github.release.create":   RiskHigh,
	"github.api":              RiskHigh,

	// Critical risk — irreversible
	"git.force-push":  RiskCritical,
	"infra.destroy":   RiskCritical,
}

// ActionRiskValue returns the confidence signal (0.0-1.0) for a given action type.
// Unknown action types default to medium risk (0.6).
func ActionRiskValue(actionType string) float64 {
	tier, ok := ActionRiskTiers[actionType]
	if !ok {
		return RiskTierValue(RiskMedium)
	}
	return RiskTierValue(tier)
}

package simulation

import (
	"fmt"
	"strings"

	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
)

// protectedBranches are branch names that elevate git operation severity.
var gitProtectedBranches = map[string]bool{
	"main":    true,
	"master":  true,
	"release": true,
}

// GitSimulator predicts the impact of git operations.
type GitSimulator struct{}

// Simulate evaluates git.* actions and returns predicted impacts.
//
// Operation impacts:
//   - commit: new commit created (low, reversible)
//   - push: remote branch updated (medium for feature, high for protected)
//   - force-push: remote history rewritten (critical, irreversible)
//   - branch.delete: branch removed (medium, irreversible)
//   - merge: branches merged (medium, reversible via revert)
//   - reset: working tree changes lost (high, potentially irreversible)
func (s *GitSimulator) Simulate(ctx action.ActionContext) ([]Impact, error) {
	if !isGitAction(ctx.Action) {
		return nil, nil
	}

	branch := ctx.Branch
	if branch == "" {
		branch = ctx.Args.Branch
	}
	isProtected := gitProtectedBranches[branch]

	var impacts []Impact

	switch ctx.Action {
	case "git.commit":
		impacts = append(impacts, Impact{
			Type:        TypeGit,
			Description: "New commit created",
			Severity:    SeverityLow,
			Paths:       branchPaths(branch),
			Reversible:  true,
		})

	case "git.push":
		sev := SeverityMedium
		desc := fmt.Sprintf("Push to remote branch: %s", branch)
		if isProtected {
			sev = SeverityHigh
			desc = fmt.Sprintf("Push to protected branch: %s", branch)
		}
		// Check for force flag in command
		if hasForceFlag(ctx.Command) {
			return s.simulateForcePush(branch)
		}
		impacts = append(impacts, Impact{
			Type:        TypeGit,
			Description: desc,
			Severity:    sev,
			Paths:       branchPaths(branch),
			Reversible:  true,
		})

	case "git.force-push":
		return s.simulateForcePush(branch)

	case "git.branch.delete":
		sev := SeverityMedium
		desc := fmt.Sprintf("Delete branch: %s", branch)
		if isProtected {
			sev = SeverityCritical
			desc = fmt.Sprintf("Delete protected branch: %s", branch)
		}
		impacts = append(impacts, Impact{
			Type:        TypeGit,
			Description: desc,
			Severity:    sev,
			Paths:       branchPaths(branch),
			Reversible:  false,
		})

	case "git.merge":
		sev := SeverityMedium
		desc := fmt.Sprintf("Merge into branch: %s", branch)
		if isProtected {
			sev = SeverityHigh
			desc = fmt.Sprintf("Merge into protected branch: %s", branch)
		}
		impacts = append(impacts, Impact{
			Type:        TypeGit,
			Description: desc,
			Severity:    sev,
			Paths:       branchPaths(branch),
			Reversible:  true, // can revert the merge commit
		})

	case "git.reset":
		impacts = append(impacts, Impact{
			Type:        TypeGit,
			Description: "Git reset — working tree changes may be lost",
			Severity:    SeverityHigh,
			Paths:       branchPaths(branch),
			Reversible:  false, // hard reset loses uncommitted changes
		})

	case "git.checkout":
		impacts = append(impacts, Impact{
			Type:        TypeGit,
			Description: fmt.Sprintf("Checkout branch: %s", branch),
			Severity:    SeverityLow,
			Paths:       branchPaths(branch),
			Reversible:  true,
		})

	case "git.branch.create":
		impacts = append(impacts, Impact{
			Type:        TypeGit,
			Description: fmt.Sprintf("Create branch: %s", branch),
			Severity:    SeverityLow,
			Paths:       branchPaths(branch),
			Reversible:  true,
		})

	case "git.diff", "git.worktree.list":
		// Read-only operations — no impact
		return nil, nil

	default:
		// Unknown git action — conservative medium
		impacts = append(impacts, Impact{
			Type:        TypeGit,
			Description: fmt.Sprintf("Git operation: %s", ctx.Action),
			Severity:    SeverityMedium,
			Paths:       branchPaths(branch),
			Reversible:  true,
		})
	}

	return impacts, nil
}

// simulateForcePush returns the impacts for a force push operation.
func (s *GitSimulator) simulateForcePush(branch string) ([]Impact, error) {
	desc := fmt.Sprintf("Force push rewrites remote history on branch: %s", branch)
	sev := SeverityCritical
	return []Impact{{
		Type:        TypeGit,
		Description: desc,
		Severity:    sev,
		Paths:       branchPaths(branch),
		Reversible:  false,
	}}, nil
}

// isGitAction checks whether an action type is a git operation.
func isGitAction(actionType string) bool {
	return strings.HasPrefix(actionType, "git.")
}

// branchPaths returns the path list for a branch ref.
func branchPaths(branch string) []string {
	if branch == "" {
		return nil
	}
	return []string{"refs/heads/" + branch}
}

// hasForceFlag checks for --force or -f in a command string.
func hasForceFlag(command string) bool {
	if command == "" {
		return false
	}
	lower := strings.ToLower(command)
	if strings.Contains(lower, "--force") {
		return true
	}
	for _, token := range strings.Fields(lower) {
		if token == "-f" {
			return true
		}
	}
	return false
}

package simulation

import (
	"fmt"
	"strings"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
)

// installPatterns match package install commands.
var installPatterns = []string{
	"npm install", "npm i ", "yarn add", "pnpm add", "pnpm install",
}

// removePatterns match package removal commands.
var removePatterns = []string{
	"npm uninstall", "npm remove", "yarn remove", "pnpm remove",
}

// PackageSimulator predicts the impact of package management operations.
type PackageSimulator struct{}

// Simulate evaluates shell.exec and npm.* actions for package management impact.
//
// Detected operations:
//   - npm/yarn/pnpm install/add: dependency added (low-medium)
//   - npm/yarn/pnpm uninstall/remove: dependency removed (medium)
//   - package.json modification: dependency configuration changed (medium)
func (s *PackageSimulator) Simulate(ctx action.ActionContext) ([]Impact, error) {
	// Check for explicit npm action types
	if strings.HasPrefix(ctx.Action, "npm.") {
		return s.simulateNpmAction(ctx)
	}

	// Check for shell.exec with package commands
	if ctx.Action != "shell.exec" {
		return nil, nil
	}

	command := ctx.Command
	if command == "" {
		command = ctx.Args.Command
	}
	if command == "" {
		return nil, nil
	}

	lower := strings.ToLower(command)

	// Check for install commands
	if matchesAnyPrefix(lower, installPatterns) {
		return s.simulateInstall(command)
	}

	// Check for remove commands
	if matchesAnyPrefix(lower, removePatterns) {
		return s.simulateRemove(command)
	}

	return nil, nil
}

// simulateNpmAction handles explicit npm.install and npm.script.run actions.
func (s *PackageSimulator) simulateNpmAction(ctx action.ActionContext) ([]Impact, error) {
	switch ctx.Action {
	case "npm.install":
		return []Impact{{
			Type:        TypePackage,
			Description: "Package installation via npm.install action",
			Severity:    SeverityLow,
			Paths:       []string{"package.json", "node_modules/"},
			Reversible:  true,
		}}, nil

	case "npm.publish":
		return []Impact{{
			Type:        TypePackage,
			Description: "Package published to registry",
			Severity:    SeverityHigh,
			Paths:       []string{"package.json"},
			Reversible:  false, // unpublish has a time window
		}}, nil

	case "npm.script.run":
		return []Impact{{
			Type:        TypePackage,
			Description: fmt.Sprintf("Running npm script: %s", ctx.Command),
			Severity:    SeverityLow,
			Paths:       []string{"package.json"},
			Reversible:  true,
		}}, nil

	default:
		return nil, nil
	}
}

// simulateInstall predicts the impact of a package install command.
func (s *PackageSimulator) simulateInstall(command string) ([]Impact, error) {
	// Check for global install
	lower := strings.ToLower(command)
	if strings.Contains(lower, " -g") || strings.Contains(lower, " --global") {
		return []Impact{{
			Type:        TypePackage,
			Description: fmt.Sprintf("Global package installation: %s", command),
			Severity:    SeverityMedium,
			Paths:       []string{"global:node_modules/"},
			Reversible:  true,
		}}, nil
	}

	return []Impact{{
		Type:        TypePackage,
		Description: fmt.Sprintf("Package installation: %s", command),
		Severity:    SeverityLow,
		Paths:       []string{"package.json", "node_modules/", "package-lock.json"},
		Reversible:  true,
	}}, nil
}

// simulateRemove predicts the impact of a package removal command.
func (s *PackageSimulator) simulateRemove(command string) ([]Impact, error) {
	return []Impact{{
		Type:        TypePackage,
		Description: fmt.Sprintf("Package removal: %s", command),
		Severity:    SeverityMedium,
		Paths:       []string{"package.json", "node_modules/", "package-lock.json"},
		Reversible:  true,
	}}, nil
}

// matchesAnyPrefix checks if s starts with any of the given prefixes.
func matchesAnyPrefix(s string, prefixes []string) bool {
	for _, p := range prefixes {
		if strings.HasPrefix(s, p) || strings.Contains(s, p) {
			return true
		}
	}
	return false
}

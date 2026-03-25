package simulation

import (
	"fmt"
	"strings"

	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
)

// sensitivePatterns are path substrings that indicate sensitive files.
var sensitivePatterns = []string{".env", "credentials", ".pem", ".key", "secret", "token"}

// configPatterns are path substrings that indicate configuration files.
var configPatterns = []string{
	"package.json", "tsconfig.json", "eslint", ".prettierrc",
	"webpack.config", "vite.config", "next.config", "jest.config",
	"vitest.config", ".babelrc", "babel.config",
}

// lockfilePatterns are path substrings that indicate lockfiles.
var lockfilePatterns = []string{"package-lock.json", "yarn.lock", "pnpm-lock.yaml"}

// ciPatterns are path substrings that indicate CI/CD configuration.
var ciPatterns = []string{".github/", ".gitlab-ci", "Jenkinsfile", ".circleci/", "Dockerfile"}

// FilesystemSimulator predicts the impact of file operations.
type FilesystemSimulator struct{}

// Simulate evaluates file.read, file.write, file.delete, and file.move actions.
// Read operations produce no impact. Write and delete operations are assessed for
// path sensitivity (secrets, config files, lockfiles, CI configs).
func (s *FilesystemSimulator) Simulate(ctx action.ActionContext) ([]Impact, error) {
	if !isFileAction(ctx.Action) {
		return nil, nil
	}

	target := ctx.Target
	if target == "" {
		target = ctx.Args.FilePath
	}

	// Read operations have no impact
	if ctx.Action == "file.read" {
		return nil, nil
	}

	var impacts []Impact

	// Determine base impact
	switch ctx.Action {
	case "file.delete":
		impacts = append(impacts, Impact{
			Type:        TypeFilesystem,
			Description: fmt.Sprintf("Delete file: %s", target),
			Severity:    SeverityMedium,
			Paths:       []string{target},
			Reversible:  false,
		})
	case "file.write":
		impacts = append(impacts, Impact{
			Type:        TypeFilesystem,
			Description: fmt.Sprintf("Write file: %s", target),
			Severity:    SeverityLow,
			Paths:       []string{target},
			Reversible:  true,
		})
	case "file.move":
		impacts = append(impacts, Impact{
			Type:        TypeFilesystem,
			Description: fmt.Sprintf("Move file: %s", target),
			Severity:    SeverityLow,
			Paths:       []string{target},
			Reversible:  true,
		})
	}

	// Assess path sensitivity
	if target != "" {
		lower := strings.ToLower(target)

		if matchesAny(lower, sensitivePatterns) {
			impacts = append(impacts, Impact{
				Type:        TypeFilesystem,
				Description: fmt.Sprintf("Sensitive file affected: %s", target),
				Severity:    SeverityHigh,
				Paths:       []string{target},
				Reversible:  impacts[0].Reversible,
			})
		}

		if matchesAny(lower, configPatterns) {
			impacts = append(impacts, Impact{
				Type:        TypeFilesystem,
				Description: fmt.Sprintf("Configuration file affected: %s", target),
				Severity:    SeverityMedium,
				Paths:       []string{target},
				Reversible:  impacts[0].Reversible,
			})
		}

		if matchesAny(lower, lockfilePatterns) {
			impacts = append(impacts, Impact{
				Type:        TypeFilesystem,
				Description: fmt.Sprintf("Lockfile affected: %s", target),
				Severity:    SeverityMedium,
				Paths:       []string{target},
				Reversible:  impacts[0].Reversible,
			})
		}

		if matchesAny(lower, ciPatterns) {
			impacts = append(impacts, Impact{
				Type:        TypeFilesystem,
				Description: fmt.Sprintf("CI/CD config affected: %s", target),
				Severity:    SeverityMedium,
				Paths:       []string{target},
				Reversible:  impacts[0].Reversible,
			})
		}
	}

	// Detect bulk operations
	if ctx.FilesAffected > 10 {
		impacts = append(impacts, Impact{
			Type:        TypeFilesystem,
			Description: fmt.Sprintf("Bulk operation affecting %d files", ctx.FilesAffected),
			Severity:    SeverityHigh,
			Paths:       []string{target},
			Reversible:  false,
		})
	}

	return impacts, nil
}

// isFileAction checks whether an action type is a file operation.
func isFileAction(actionType string) bool {
	return strings.HasPrefix(actionType, "file.")
}

// matchesAny returns true if s contains any of the given patterns.
func matchesAny(s string, patterns []string) bool {
	for _, p := range patterns {
		if strings.Contains(s, p) {
			return true
		}
	}
	return false
}

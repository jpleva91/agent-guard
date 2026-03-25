package hook

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// ErrPolicyNotFound is returned when no policy file can be located.
var ErrPolicyNotFound = errors.New("no agentguard policy file found")

// defaultPolicyNames are the filenames searched for when walking directories.
var defaultPolicyNames = []string{"agentguard.yaml", "agentguard.yml"}

// FindPolicyFile locates the AgentGuard policy file using a priority search:
//  1. AGENTGUARD_POLICY environment variable (exact path).
//  2. Walk up from the current working directory looking for agentguard.yaml/yml.
//  3. User config directory: ~/.config/agentguard/policy.yaml.
//
// Returns the absolute path to the first policy file found, or ErrPolicyNotFound.
func FindPolicyFile() (string, error) {
	// 1. Explicit env var
	if envPath := os.Getenv("AGENTGUARD_POLICY"); envPath != "" {
		abs, err := filepath.Abs(envPath)
		if err != nil {
			return "", err
		}
		if _, err := os.Stat(abs); err != nil {
			return "", fmt.Errorf("AGENTGUARD_POLICY points to missing file: %s", abs)
		}
		return abs, nil
	}

	// 2. Walk up from cwd
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		for _, name := range defaultPolicyNames {
			candidate := filepath.Join(dir, name)
			if _, err := os.Stat(candidate); err == nil {
				return candidate, nil
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break // reached root
		}
		dir = parent
	}

	// 3. User config directory
	home, err := os.UserHomeDir()
	if err == nil {
		candidate := filepath.Join(home, ".config", "agentguard", "policy.yaml")
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}

	return "", ErrPolicyNotFound
}

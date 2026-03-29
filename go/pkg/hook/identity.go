package hook

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const identityFile = ".agentguard-identity"

// ResolveIdentity finds the agent identity from (in priority order):
// 1. AGENTGUARD_AGENT_NAME env var
// 2. .agentguard-identity file (walk up from workspace)
// 3. Empty string (no identity)
func ResolveIdentity(workspace string) string {
	// 1. Env var override
	if name := os.Getenv("AGENTGUARD_AGENT_NAME"); name != "" {
		return name
	}

	// 2. Walk up from workspace to find .agentguard-identity
	dirs := []string{workspace}
	if cwd, err := os.Getwd(); err == nil && cwd != workspace {
		dirs = append([]string{cwd}, dirs...)
	}

	for _, dir := range dirs {
		for d := dir; ; {
			path := filepath.Join(d, identityFile)
			if data, err := os.ReadFile(path); err == nil {
				identity := strings.TrimSpace(string(data))
				if identity != "" {
					return identity
				}
			}
			parent := filepath.Dir(d)
			if parent == d {
				break
			}
			d = parent
		}
	}

	return ""
}

// IdentityWizardPrompt returns a formatted prompt asking the user to set their identity.
func IdentityWizardPrompt() string {
	driver := detectDriver()
	model := detectModel()

	return fmt.Sprintf(`AgentGuard Identity Setup
═════════════════════════

No agent identity found. Ask the user for their identity, then write it to .agentguard-identity in the project root.

Auto-detected:
  Driver: %s
  Model:  %s

Suggested default: %s:%s:developer

Format: <driver>:<user-or-model>:<role>
  Roles: developer, reviewer, ops, security, planner
  Examples: claude-code:opus:developer, human:jared:reviewer, ci:github-actions:ops

Ask the user:
  "AgentGuard needs an identity for this session. I detected %s:%s. What identity should I use? (default: %s:%s:developer)"

Then write their answer (or the default) to .agentguard-identity in the project root.`,
		driver, model, driver, model, driver, model, driver, model)
}

// IsIdentityWrite returns true if this action is writing the identity file.
// These are allowed through even when identity is missing (bootstrap).
func IsIdentityWrite(input HookInput) bool {
	fields := input.InputFields()
	if fields == nil {
		return false
	}
	if fp, ok := fields["file_path"].(string); ok {
		return strings.HasSuffix(fp, identityFile)
	}
	if cmd, ok := fields["command"].(string); ok {
		return strings.Contains(cmd, identityFile) ||
			strings.Contains(cmd, "write-persona")
	}
	return false
}

func detectDriver() string {
	if os.Getenv("CLAUDE_SESSION_ID") != "" || os.Getenv("CLAUDE_TOOL_NAME") != "" {
		return "claude-code"
	}
	if os.Getenv("COPILOT_SESSION_ID") != "" {
		return "copilot"
	}
	if os.Getenv("CODEX_SESSION_ID") != "" {
		return "codex"
	}
	if os.Getenv("GEMINI_SESSION_ID") != "" {
		return "gemini"
	}
	return "human"
}

func detectModel() string {
	// Claude Code doesn't expose model name via env, but we can infer from session
	if os.Getenv("CLAUDE_SESSION_ID") != "" {
		return "unknown"
	}
	return "unknown"
}

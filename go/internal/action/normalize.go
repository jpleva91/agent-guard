package action

import (
	"strings"
	"time"
)

// ResolveActionClass extracts the first segment of an action type as its class.
func ResolveActionClass(actionType string) string {
	parts := strings.SplitN(actionType, ".", 2)
	if len(parts) == 0 {
		return "unknown"
	}
	switch parts[0] {
	case "file", "test", "git", "github", "shell", "npm", "http", "deploy", "infra", "mcp":
		return parts[0]
	default:
		return "unknown"
	}
}

// ExtractBranch extracts the target branch from a git push command.
// Handles compound commands (&&, ||, ;), flags, and refspec notation.
func ExtractBranch(command string) string {
	segments := strings.FieldsFunc(command, func(r rune) bool {
		return r == '&' || r == '|' || r == ';'
	})
	for _, seg := range segments {
		seg = strings.TrimSpace(seg)
		if !strings.Contains(seg, "git") || !strings.Contains(seg, "push") {
			continue
		}
		idx := strings.Index(seg, "push")
		if idx < 0 {
			continue
		}
		after := strings.TrimSpace(seg[idx+4:])
		tokens := strings.Fields(after)
		var positional []string
		for i := 0; i < len(tokens); i++ {
			tok := tokens[i]
			if strings.HasPrefix(tok, "-") {
				// Skip flags that take a value argument
				valueFlags := map[string]bool{
					"-o": true, "--push-option": true,
					"--receive-pack": true, "--exec": true, "--repo": true,
				}
				if !strings.Contains(tok, "=") && valueFlags[tok] && i+1 < len(tokens) {
					i++
				}
				continue
			}
			positional = append(positional, tok)
		}
		if len(positional) >= 2 {
			ref := positional[1]
			// Handle refspec: strip src: prefix, +prefix, refs/heads/
			if colonIdx := strings.LastIndex(ref, ":"); colonIdx >= 0 {
				ref = ref[colonIdx+1:]
			}
			ref = strings.TrimPrefix(ref, "+")
			ref = strings.TrimPrefix(ref, "refs/heads/")
			return ref
		}
	}
	return ""
}

// Normalizer converts RawActions into ActionContexts using a tool-action map
// and a Scanner for git/github/destructive pattern detection.
type Normalizer struct {
	toolMap map[string]string
	scanner *Scanner
}

// NewNormalizer creates a Normalizer with the given tool-action map and scanner.
func NewNormalizer(toolMap map[string]string, scanner *Scanner) *Normalizer {
	return &Normalizer{toolMap: toolMap, scanner: scanner}
}

// Normalize converts a RawAction into a vendor-neutral ActionContext.
// It uses the ToolActionMap for default action resolution, then applies
// Scanner-based overrides for git, github, and destructive commands.
func (n *Normalizer) Normalize(raw RawAction, source string) ActionContext {
	// Default action from tool-action map
	actionType := n.toolMap[raw.Tool]
	if actionType == "" {
		// Try lowercase
		actionType = n.toolMap[strings.ToLower(raw.Tool)]
	}
	if actionType == "" {
		actionType = "unknown"
	}

	target := raw.Target
	if target == "" {
		target = raw.File
	}
	if target == "" {
		target = raw.Command
	}

	branch := raw.Branch
	destructive := false

	// For shell.exec, detect specific action types via scanner.
	// Prefer AST-based scanning for compound commands (&&, ||, ;, |)
	// as it is more precise and faster for multi-command strings.
	if actionType == "shell.exec" && raw.Command != "" {
		cmd := raw.Command

		if PreferAST(cmd) {
			// AST-based scanning: parse into commands, scan each independently
			results := n.scanner.ScanAST(cmd)
			for _, r := range results {
				if r.Category != "" && r.Matched {
					// Destructive match
					destructive = true
				} else if r.Matched && actionType == "shell.exec" {
					// First git/github match wins for action type
					actionType = r.ActionType
					if branch == "" {
						branch = ExtractBranch(cmd)
					}
				}
			}
		} else {
			// Regex-based scanning (fallback for simple commands)
			// GitHub detection first (before git, since gh commands also contain "git")
			if ghResult := n.scanner.ScanGithubAction(cmd); ghResult != nil {
				actionType = ghResult.ActionType
			} else if gitResult := n.scanner.ScanGitAction(cmd); gitResult != nil {
				actionType = gitResult.ActionType
				if branch == "" {
					branch = ExtractBranch(cmd)
				}
			}

			// Destructive detection (independent of git/github)
			if matches := n.scanner.ScanDestructive(cmd); len(matches) > 0 {
				destructive = true
			}
		}
	}

	actionClass := ResolveActionClass(actionType)
	agent := raw.Agent
	if agent == "" {
		agent = source
	}

	return ActionContext{
		Action:        actionType,
		ActionClass:   actionClass,
		Target:        target,
		Destructive:   destructive,
		Source:        source,
		NormalizedAt:  time.Now().UnixMilli(),
		Agent:         agent,
		Branch:        branch,
		Command:       raw.Command,
		FilesAffected: raw.FilesAffected,
		Metadata:      raw.Metadata,
		Actor: ActorIdentity{
			AgentID: agent,
		},
		Args: ActionArguments{
			FilePath: raw.File,
			Command:  raw.Command,
			Branch:   branch,
			Content:  raw.Content,
			Metadata: raw.Metadata,
		},
	}
}

// Normalize is a package-level convenience function that creates a Normalizer
// from the provided tool map and scanner, then normalizes the action.
// For repeated use, prefer creating a Normalizer via NewNormalizer.
func Normalize(raw RawAction, source string, toolMap map[string]string, scanner *Scanner) ActionContext {
	n := &Normalizer{toolMap: toolMap, scanner: scanner}
	return n.Normalize(raw, source)
}

package hook

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

// RunClaudeHook is the main entry point for the `agentguard claude-hook` command.
// Handles all hook events: PreToolUse, PostToolUse, Stop, Notification.
//
// Exit codes:
//   - 0: action allowed (or non-PreToolUse event)
//   - 2: action denied by policy/invariant
//   - 1: internal error
func RunClaudeHook() error {
	// Load .env from project root
	LoadProjectEnv()

	// Read hook input (stdin JSON, env vars as fallback)
	input, err := FromEnv()
	if err != nil {
		return fmt.Errorf("reading hook input: %w", err)
	}

	workspace := os.Getenv("AGENTGUARD_WORKSPACE")
	if workspace == "" {
		workspace, _ = os.Getwd()
	}

	switch input.Event {
	case PreToolUse:
		return handleClaudePreToolUse(input, workspace)
	case PostToolUse:
		handleClaudePostToolUse(input, workspace)
		return nil
	case "Stop":
		handleClaudeStop(input, workspace)
		return nil
	case "Notification":
		handleClaudeNotification(workspace)
		return nil
	default:
		// Unknown event — allow through
		return nil
	}
}

func handleClaudePreToolUse(input HookInput, workspace string) error {
	// --- Agent Identity Check ---
	identity := ResolveIdentity(workspace)
	if identity == "" && !IsIdentityWrite(input) {
		// No identity set — block with wizard prompt (except identity writes)
		writeClaudeDeny(IdentityWizardPrompt())
		os.Exit(2)
		return nil
	}

	// --- Root Session Tracking ---
	WriteRootSession(input.SessionID, workspace)

	// --- Find policy file ---
	policyPath, err := FindPolicyFile()
	if err != nil {
		// No policy = fail-open (unconfigured)
		writeAllowResponse()
		return nil
	}

	// --- Create handler (loads policy + invariants) ---
	handler, err := NewHandler([]string{policyPath})
	if err != nil {
		return fmt.Errorf("loading policy %s: %w", policyPath, err)
	}

	// --- Inject session state into handler metadata ---
	sessionState := ReadSessionState(input.SessionID)
	handler.sessionState = &sessionState
	handler.identity = identity
	handler.workspace = workspace

	// --- Evaluate ---
	response := handler.Handle(input)

	// --- Track file writes in session state ---
	if response.Decision == "allow" {
		fields := input.InputFields()
		if fields != nil {
			if fp, ok := fields["file_path"].(string); ok && fp != "" {
				if input.Tool == "Write" || input.Tool == "Edit" {
					WriteSessionState(input.SessionID, SessionState{WrittenFiles: []string{fp}})
				}
			}
		}
	}

	// --- Cloud telemetry ---
	tc := NewTelemetryClient()
	if tc != nil {
		tc.Send(TelemetryEvent{
			Type:      "governance.decision",
			RunID:     input.SessionID,
			SessionID: input.SessionID,
			AgentID:   identity,
			Action:    response.Reason,
			Decision:  response.Decision,
			Tool:      input.Tool,
			Mode:      handler.mode,
		})
		// Brief pause to let the goroutine fire (hook is short-lived)
		time.Sleep(50 * time.Millisecond)
	}

	// --- Write response ---
	return writeClaudeResponse(response)
}

func handleClaudePostToolUse(input HookInput, workspace string) {
	// Only process Bash tool results
	if input.Tool != "Bash" {
		return
	}

	fields := input.InputFields()
	if fields == nil {
		return
	}

	command, _ := fields["command"].(string)
	output, _ := fields["tool_output"].(map[string]any)

	exitCode := 0
	stderr := ""
	if output != nil {
		if ec, ok := output["exit_code"].(float64); ok {
			exitCode = int(ec)
		}
		if se, ok := output["stderr"].(string); ok {
			stderr = se
		}
	}

	// Report bash errors to stderr
	if exitCode != 0 && strings.TrimSpace(stderr) != "" {
		msg := stderr
		if len(msg) > 80 {
			msg = msg[:80] + "..."
		}
		fmt.Fprintf(os.Stderr, "\n  \033[31mError detected:\033[0m %s\n\n", msg)
	}

	// Track format/test pass in session state
	TrackPostToolUse(input.SessionID, input)

	// Detect PR creation → spawn session viewer
	if exitCode == 0 && command != "" {
		cmdLower := strings.ToLower(command)
		if strings.Contains(cmdLower, "gh pr create") || strings.Contains(cmdLower, "gh pr merge") {
			go spawnSessionViewer(workspace)
			fmt.Fprintf(os.Stderr, "\n  \033[36mℹ\033[0m  PR detected — session viewer generated\n\n")
		}
	}

	// RTK tracking
	if strings.HasPrefix(command, "rtk ") || strings.Contains(command, "/rtk ") {
		fmt.Fprintf(os.Stderr, "\n  \033[36m⚡\033[0m rtk: token-optimized output\n")
	}
}

func handleClaudeStop(input HookInput, workspace string) {
	// Clean root session marker
	CleanRootSession(input.SessionID, workspace)

	// Spawn session viewer generation
	spawnSessionViewer(workspace)
	fmt.Fprintf(os.Stderr, "  \033[32m✓\033[0m Session viewer generated\n")
}

func handleClaudeNotification(workspace string) {
	// Spawn live session viewer server (detached)
	spawnLiveViewer(workspace)
}

// --- Claude Code JSON response format ---

func writeClaudeResponse(resp HookResponse) error {
	if resp.Decision == "allow" {
		writeAllowResponse()
		return nil
	}

	writeClaudeDeny(resp.Reason)
	os.Exit(2)
	return nil
}

func writeClaudeDeny(reason string) {
	output := claudeHookOutput{
		HookSpecificOutput: claudeHookDecision{
			HookEventName:           "PreToolUse",
			PermissionDecision:      "deny",
			PermissionDecisionReason: reason,
		},
	}
	data, _ := json.Marshal(output)
	fmt.Println(string(data))
}

func writeAllowResponse() {
	// Claude Code: empty stdout with exit 0 = allow
}

type claudeHookOutput struct {
	HookSpecificOutput claudeHookDecision `json:"hookSpecificOutput"`
}

type claudeHookDecision struct {
	HookEventName            string `json:"hookEventName"`
	PermissionDecision       string `json:"permissionDecision"`
	PermissionDecisionReason string `json:"permissionDecisionReason,omitempty"`
}

// --- Subprocess helpers ---

func resolveCliCommand(workspace string) string {
	// Dev mode: use local dist
	devBin := workspace + "/apps/cli/dist/bin.js"
	if _, err := os.Stat(devBin); err == nil {
		return "node " + devBin
	}
	// Check parent workspace (when running from agent-guard subdir)
	parentBin := workspace + "/../agent-guard/apps/cli/dist/bin.js"
	if _, err := os.Stat(parentBin); err == nil {
		return "node " + parentBin
	}
	return "agentguard"
}

func spawnSessionViewer(workspace string) {
	cli := resolveCliCommand(workspace)
	parts := strings.Fields(cli)
	args := append(parts[1:], "session-viewer", "--last", "--no-open")
	cmd := exec.Command(parts[0], args...)
	cmd.Stdout = nil
	cmd.Stderr = nil
	cmd.Start() // fire and forget
}

func spawnLiveViewer(workspace string) {
	cli := resolveCliCommand(workspace)
	parts := strings.Fields(cli)
	args := append(parts[1:], "session-viewer", "--last", "--live")
	cmd := exec.Command(parts[0], args...)
	cmd.Stdout = nil
	cmd.Stderr = nil
	cmd.SysProcAttr = nil // detached
	cmd.Start()
}

package hook

import (
	"encoding/json"
	"fmt"
	"os"
)

// RunClaudeHook is the main entry point for the `agentguard claude-hook` command.
// It reads environment variables set by Claude Code, finds the policy file,
// evaluates the action, and writes a JSON response to stdout.
//
// Exit codes:
//   - 0: action allowed (or PostToolUse)
//   - 2: action denied by policy
//   - 1: internal error
func RunClaudeHook() error {
	// 1. Read env vars
	input, err := FromEnv()
	if err != nil {
		return fmt.Errorf("reading hook input: %w", err)
	}

	// 2. Find policy file
	policyPath, err := FindPolicyFile()
	if err != nil {
		// No policy file = allow everything (fail-open when unconfigured)
		fmt.Fprintln(os.Stderr, "[AgentGuard] No policy file found, allowing action")
		writeAllowResponse()
		return nil
	}

	// 3. Create handler
	handler, err := NewHandler([]string{policyPath})
	if err != nil {
		return fmt.Errorf("loading policy %s: %w", policyPath, err)
	}

	// 4. Evaluate
	response := handler.Handle(input)

	// 5. Output JSON and exit with appropriate code
	return writeClaudeResponse(response)
}

// writeClaudeResponse writes the hook response in Claude Code's expected format
// and exits with the appropriate code.
func writeClaudeResponse(resp HookResponse) error {
	if resp.Decision == "allow" {
		// Claude Code: exit 0 with empty or minimal stdout = allow
		writeAllowResponse()
		return nil
	}

	// Denied: write Claude Code hook format and exit 2
	output := claudeHookOutput{
		HookSpecificOutput: claudeHookDecision{
			HookEventName:           "PreToolUse",
			PermissionDecision:      "deny",
			PermissionDecisionReason: resp.Reason,
		},
	}

	data, err := json.Marshal(output)
	if err != nil {
		return fmt.Errorf("marshaling response: %w", err)
	}
	fmt.Println(string(data))
	os.Exit(2)
	return nil // unreachable, but satisfies the compiler
}

// writeAllowResponse outputs an empty JSON response for allowed actions.
func writeAllowResponse() {
	// Claude Code: empty stdout with exit 0 = allow
}

// claudeHookOutput is the top-level JSON structure Claude Code expects.
type claudeHookOutput struct {
	HookSpecificOutput claudeHookDecision `json:"hookSpecificOutput"`
}

// claudeHookDecision is the nested decision structure within the hook output.
type claudeHookDecision struct {
	HookEventName            string `json:"hookEventName"`
	PermissionDecision       string `json:"permissionDecision"`
	PermissionDecisionReason string `json:"permissionDecisionReason,omitempty"`
}

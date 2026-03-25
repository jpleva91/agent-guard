package hook

import (
	"encoding/json"
	"fmt"
	"os"
)

// copilotToolMap maps Copilot CLI tool names to AgentGuard canonical tool names.
// Copilot CLI uses lowercase tool names; AgentGuard uses PascalCase internally.
var copilotToolMap = map[string]string{
	"bash":       "Bash",
	"powershell": "Bash",
	"view":       "Read",
	"edit":       "Edit",
	"create":     "Write",
	"glob":       "Glob",
	"grep":       "Grep",
	"web_fetch":  "WebFetch",
	"task":       "Agent",
}

// RunCopilotHook is the main entry point for the `agentguard copilot-hook` command.
// It reads a Copilot CLI hook payload from stdin, finds the policy file,
// evaluates the action, and writes a JSON response to stdout.
//
// Copilot CLI hooks differ from Claude Code hooks:
//   - Input comes from stdin as JSON (not env vars).
//   - Tool names are lowercase and need mapping.
//   - Response format uses permissionDecision/permissionDecisionReason.
//   - Exit code is always 0 (the JSON response controls allow/deny).
func RunCopilotHook() error {
	// 1. Read stdin
	var payload copilotPayload
	decoder := json.NewDecoder(os.Stdin)
	if err := decoder.Decode(&payload); err != nil {
		return fmt.Errorf("reading copilot hook payload: %w", err)
	}

	// 2. Map to HookInput
	input := copilotToHookInput(payload)

	// 3. Find policy file
	policyPath, err := FindPolicyFile()
	if err != nil {
		// No policy = allow
		fmt.Fprintln(os.Stderr, "[AgentGuard] No policy file found, allowing action")
		return nil
	}

	// 4. Create handler with copilot source
	handler, err := NewHandler([]string{policyPath})
	if err != nil {
		return fmt.Errorf("loading policy %s: %w", policyPath, err)
	}

	// 5. Evaluate
	response := handler.Handle(input)

	// 6. Output Copilot response format
	return writeCopilotResponse(response)
}

// copilotPayload is the JSON payload sent by Copilot CLI hooks.
type copilotPayload struct {
	Timestamp  int64  `json:"timestamp,omitempty"`
	Cwd        string `json:"cwd,omitempty"`
	ToolName   string `json:"toolName"`
	ToolArgs   string `json:"toolArgs,omitempty"`
	ToolResult *struct {
		ResultType      string `json:"resultType,omitempty"`
		TextResultForLm string `json:"textResultForLlm,omitempty"`
	} `json:"toolResult,omitempty"`
	SessionID string `json:"sessionId,omitempty"`
}

// copilotToHookInput converts a Copilot CLI payload to a generic HookInput.
func copilotToHookInput(p copilotPayload) HookInput {
	// Map tool name
	tool := p.ToolName
	if mapped, ok := copilotToolMap[p.ToolName]; ok {
		tool = mapped
	}

	// Determine event type
	event := PreToolUse
	if p.ToolResult != nil {
		event = PostToolUse
	}

	// Parse toolArgs JSON string into raw message
	var input json.RawMessage
	if p.ToolArgs != "" && json.Valid([]byte(p.ToolArgs)) {
		input = json.RawMessage(p.ToolArgs)
	}

	sessionID := p.SessionID
	if sessionID == "" {
		sessionID = os.Getenv("COPILOT_SESSION_ID")
	}

	return HookInput{
		Tool:      tool,
		Input:     input,
		SessionID: sessionID,
		Event:     event,
	}
}

// copilotResponse is the JSON response format expected by Copilot CLI hooks.
type copilotResponse struct {
	PermissionDecision       string `json:"permissionDecision"`
	PermissionDecisionReason string `json:"permissionDecisionReason,omitempty"`
}

// writeCopilotResponse writes the response in Copilot CLI's expected format.
// Copilot CLI always uses exit code 0; the JSON controls allow/deny.
func writeCopilotResponse(resp HookResponse) error {
	if resp.Decision == "allow" {
		// Copilot CLI: empty stdout = allow
		return nil
	}

	output := copilotResponse{
		PermissionDecision:       "deny",
		PermissionDecisionReason: resp.Reason,
	}
	data, err := json.Marshal(output)
	if err != nil {
		return fmt.Errorf("marshaling copilot response: %w", err)
	}
	fmt.Println(string(data))
	return nil
}

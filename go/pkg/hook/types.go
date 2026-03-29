// Package hook provides hook handlers for AI coding agent integrations.
// It supports Claude Code and GitHub Copilot hook protocols, reading
// environment variables and evaluating actions against loaded policies.
package hook

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
)

// HookEvent identifies the lifecycle phase of a hook invocation.
type HookEvent string

const (
	// PreToolUse fires before the agent executes a tool call.
	PreToolUse HookEvent = "PreToolUse"
	// PostToolUse fires after the agent executes a tool call.
	PostToolUse HookEvent = "PostToolUse"
)

// HookInput is the parsed representation of a hook invocation.
// It captures the tool name, raw JSON input, session ID, and event type
// regardless of which agent platform originated the call.
type HookInput struct {
	Tool      string          `json:"tool"`
	Input     json.RawMessage `json:"input"`
	SessionID string          `json:"sessionId"`
	Event     HookEvent       `json:"event"`
}

// HookResponse is the JSON output written to stdout for the calling agent.
// Decision controls whether the tool call proceeds:
//   - "allow": tool call proceeds (exit 0)
//   - "deny":  tool call is blocked with a reason shown to the agent (exit 2)
//   - "block": alias for deny (hard block, non-retryable)
type HookResponse struct {
	Decision         string `json:"decision"`
	Reason           string `json:"reason,omitempty"`
	Suggestion       string `json:"suggestion,omitempty"`
	CorrectedCommand string `json:"correctedCommand,omitempty"`
}

// FromEnv reads hook input from environment variables set by Claude Code.
// Falls back to reading JSON from stdin when env vars are not set.
// Required: CLAUDE_TOOL_NAME (env) or tool_name (stdin JSON), CLAUDE_HOOK_EVENT_NAME.
// Optional: CLAUDE_TOOL_INPUT (JSON), CLAUDE_SESSION_ID.
func FromEnv() (HookInput, error) {
	tool := os.Getenv("CLAUDE_TOOL_NAME")

	// Env vars not set — try reading JSON payload from stdin.
	// Claude Code sends hook payloads via stdin, not env vars.
	if tool == "" {
		stdinInput, err := FromStdin()
		if err == nil {
			return stdinInput, nil
		}
		return HookInput{}, errors.New("CLAUDE_TOOL_NAME not set and stdin read failed: " + err.Error())
	}

	eventStr := os.Getenv("CLAUDE_HOOK_EVENT_NAME")
	if eventStr == "" {
		eventStr = string(PreToolUse) // default to PreToolUse
	}

	event := HookEvent(eventStr)
	// Accept all known hook events (PreToolUse, PostToolUse, Stop, Notification)
	validEvents := map[HookEvent]bool{PreToolUse: true, PostToolUse: true, "Stop": true, "Notification": true}
	if !validEvents[event] {
		return HookInput{}, fmt.Errorf("unknown hook event: %s", eventStr)
	}

	var input json.RawMessage
	if raw := os.Getenv("CLAUDE_TOOL_INPUT"); raw != "" {
		// Validate that it's valid JSON
		if !json.Valid([]byte(raw)) {
			return HookInput{}, fmt.Errorf("CLAUDE_TOOL_INPUT is not valid JSON")
		}
		input = json.RawMessage(raw)
	}

	return HookInput{
		Tool:      tool,
		Input:     input,
		SessionID: os.Getenv("CLAUDE_SESSION_ID"),
		Event:     event,
	}, nil
}

// FromStdin reads a Claude Code hook payload from stdin JSON.
// The payload format is: {"tool_name":"...", "tool_input":{...}, "session_id":"...", ...}
func FromStdin() (HookInput, error) {
	data, err := io.ReadAll(os.Stdin)
	if err != nil {
		return HookInput{}, fmt.Errorf("reading stdin: %w", err)
	}
	if len(data) == 0 {
		return HookInput{}, errors.New("stdin is empty")
	}

	var payload struct {
		ToolName  string          `json:"tool_name"`
		ToolInput json.RawMessage `json:"tool_input"`
		SessionID string          `json:"session_id"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return HookInput{}, fmt.Errorf("parsing stdin JSON: %w", err)
	}
	if payload.ToolName == "" {
		return HookInput{}, errors.New("tool_name not found in stdin payload")
	}

	return HookInput{
		Tool:      payload.ToolName,
		Input:     payload.ToolInput,
		SessionID: payload.SessionID,
		Event:     PreToolUse, // stdin payloads are always PreToolUse
	}, nil
}

// InputFields parses the raw JSON input into a string-keyed map.
// Returns an empty map if input is nil or unparseable.
func (h HookInput) InputFields() map[string]any {
	if len(h.Input) == 0 {
		return nil
	}
	var fields map[string]any
	if err := json.Unmarshal(h.Input, &fields); err != nil {
		return nil
	}
	return fields
}

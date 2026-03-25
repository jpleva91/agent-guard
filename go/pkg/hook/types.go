// Package hook provides hook handlers for AI coding agent integrations.
// It supports Claude Code and GitHub Copilot hook protocols, reading
// environment variables and evaluating actions against loaded policies.
package hook

import (
	"encoding/json"
	"errors"
	"fmt"
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
// Required: CLAUDE_TOOL_NAME, CLAUDE_HOOK_EVENT_NAME.
// Optional: CLAUDE_TOOL_INPUT (JSON), CLAUDE_SESSION_ID.
func FromEnv() (HookInput, error) {
	tool := os.Getenv("CLAUDE_TOOL_NAME")
	if tool == "" {
		return HookInput{}, errors.New("CLAUDE_TOOL_NAME not set")
	}

	eventStr := os.Getenv("CLAUDE_HOOK_EVENT_NAME")
	if eventStr == "" {
		return HookInput{}, errors.New("CLAUDE_HOOK_EVENT_NAME not set")
	}

	event := HookEvent(eventStr)
	if event != PreToolUse && event != PostToolUse {
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

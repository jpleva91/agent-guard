package hook

import (
	"encoding/json"
	"os"
	"testing"
)

func TestFromEnv(t *testing.T) {
	// Set up env vars
	os.Setenv("CLAUDE_TOOL_NAME", "Bash")
	os.Setenv("CLAUDE_TOOL_INPUT", `{"command":"git push origin main"}`)
	os.Setenv("CLAUDE_SESSION_ID", "test-session-123")
	os.Setenv("CLAUDE_HOOK_EVENT_NAME", "PreToolUse")
	defer func() {
		os.Unsetenv("CLAUDE_TOOL_NAME")
		os.Unsetenv("CLAUDE_TOOL_INPUT")
		os.Unsetenv("CLAUDE_SESSION_ID")
		os.Unsetenv("CLAUDE_HOOK_EVENT_NAME")
	}()

	input, err := FromEnv()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if input.Tool != "Bash" {
		t.Errorf("expected tool Bash, got %s", input.Tool)
	}
	if input.SessionID != "test-session-123" {
		t.Errorf("expected session test-session-123, got %s", input.SessionID)
	}
	if input.Event != PreToolUse {
		t.Errorf("expected PreToolUse, got %s", input.Event)
	}
	if len(input.Input) == 0 {
		t.Error("expected non-empty input")
	}
}

func TestFromEnvPostToolUse(t *testing.T) {
	os.Setenv("CLAUDE_TOOL_NAME", "Write")
	os.Setenv("CLAUDE_HOOK_EVENT_NAME", "PostToolUse")
	defer func() {
		os.Unsetenv("CLAUDE_TOOL_NAME")
		os.Unsetenv("CLAUDE_HOOK_EVENT_NAME")
	}()

	input, err := FromEnv()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if input.Event != PostToolUse {
		t.Errorf("expected PostToolUse, got %s", input.Event)
	}
}

func TestFromEnvMissingToolName(t *testing.T) {
	os.Unsetenv("CLAUDE_TOOL_NAME")
	os.Setenv("CLAUDE_HOOK_EVENT_NAME", "PreToolUse")
	defer os.Unsetenv("CLAUDE_HOOK_EVENT_NAME")

	_, err := FromEnv()
	if err == nil {
		t.Error("expected error when CLAUDE_TOOL_NAME is missing")
	}
}

func TestFromEnvMissingEventName(t *testing.T) {
	os.Setenv("CLAUDE_TOOL_NAME", "Bash")
	os.Unsetenv("CLAUDE_HOOK_EVENT_NAME")
	defer os.Unsetenv("CLAUDE_TOOL_NAME")

	_, err := FromEnv()
	if err == nil {
		t.Error("expected error when CLAUDE_HOOK_EVENT_NAME is missing")
	}
}

func TestFromEnvInvalidEventName(t *testing.T) {
	os.Setenv("CLAUDE_TOOL_NAME", "Bash")
	os.Setenv("CLAUDE_HOOK_EVENT_NAME", "InvalidEvent")
	defer func() {
		os.Unsetenv("CLAUDE_TOOL_NAME")
		os.Unsetenv("CLAUDE_HOOK_EVENT_NAME")
	}()

	_, err := FromEnv()
	if err == nil {
		t.Error("expected error for unknown event name")
	}
}

func TestFromEnvInvalidJSON(t *testing.T) {
	os.Setenv("CLAUDE_TOOL_NAME", "Bash")
	os.Setenv("CLAUDE_TOOL_INPUT", "{not valid json")
	os.Setenv("CLAUDE_HOOK_EVENT_NAME", "PreToolUse")
	defer func() {
		os.Unsetenv("CLAUDE_TOOL_NAME")
		os.Unsetenv("CLAUDE_TOOL_INPUT")
		os.Unsetenv("CLAUDE_HOOK_EVENT_NAME")
	}()

	_, err := FromEnv()
	if err == nil {
		t.Error("expected error for invalid JSON in CLAUDE_TOOL_INPUT")
	}
}

func TestFromEnvNoInput(t *testing.T) {
	os.Setenv("CLAUDE_TOOL_NAME", "Read")
	os.Setenv("CLAUDE_HOOK_EVENT_NAME", "PreToolUse")
	os.Unsetenv("CLAUDE_TOOL_INPUT")
	defer func() {
		os.Unsetenv("CLAUDE_TOOL_NAME")
		os.Unsetenv("CLAUDE_HOOK_EVENT_NAME")
	}()

	input, err := FromEnv()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if input.Input != nil {
		t.Error("expected nil input when CLAUDE_TOOL_INPUT is not set")
	}
}

func TestInputFields(t *testing.T) {
	input := HookInput{
		Tool:  "Bash",
		Input: json.RawMessage(`{"command":"ls -la","file_path":"/tmp"}`),
		Event: PreToolUse,
	}
	fields := input.InputFields()
	if fields == nil {
		t.Fatal("expected non-nil fields")
	}
	if cmd, ok := fields["command"].(string); !ok || cmd != "ls -la" {
		t.Errorf("expected command 'ls -la', got %v", fields["command"])
	}
	if fp, ok := fields["file_path"].(string); !ok || fp != "/tmp" {
		t.Errorf("expected file_path '/tmp', got %v", fields["file_path"])
	}
}

func TestInputFieldsNilInput(t *testing.T) {
	input := HookInput{Tool: "Read", Event: PreToolUse}
	fields := input.InputFields()
	if fields != nil {
		t.Error("expected nil fields for nil input")
	}
}

func TestInputFieldsInvalidJSON(t *testing.T) {
	input := HookInput{
		Tool:  "Read",
		Input: json.RawMessage(`not json`),
		Event: PreToolUse,
	}
	fields := input.InputFields()
	if fields != nil {
		t.Error("expected nil fields for invalid JSON")
	}
}

func TestHookResponseJSONSerialization(t *testing.T) {
	resp := HookResponse{
		Decision:         "deny",
		Reason:           "No push to main",
		Suggestion:       "Use a feature branch",
		CorrectedCommand: "git push origin feature/my-branch",
	}
	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}

	var decoded HookResponse
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if decoded.Decision != "deny" {
		t.Errorf("expected deny, got %s", decoded.Decision)
	}
	if decoded.Reason != "No push to main" {
		t.Errorf("expected reason, got %s", decoded.Reason)
	}
	if decoded.Suggestion != "Use a feature branch" {
		t.Errorf("expected suggestion, got %s", decoded.Suggestion)
	}
	if decoded.CorrectedCommand != "git push origin feature/my-branch" {
		t.Errorf("expected corrected command, got %s", decoded.CorrectedCommand)
	}
}

func TestHookResponseAllowOmitsEmpty(t *testing.T) {
	resp := HookResponse{Decision: "allow"}
	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	s := string(data)
	// omitempty fields should not appear
	if json.Valid(data) == false {
		t.Error("expected valid JSON")
	}
	var decoded map[string]any
	json.Unmarshal(data, &decoded)
	if _, ok := decoded["reason"]; ok {
		t.Errorf("expected reason to be omitted, got %s", s)
	}
	if _, ok := decoded["suggestion"]; ok {
		t.Errorf("expected suggestion to be omitted, got %s", s)
	}
}

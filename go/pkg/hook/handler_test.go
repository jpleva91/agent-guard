package hook

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// writeTempPolicy writes a YAML policy file to a temp dir and returns its path.
func writeTempPolicy(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "agentguard.yaml")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("write temp policy: %v", err)
	}
	return path
}

const testPolicyYAML = `
id: test-policy
name: Test Policy
severity: 4
rules:
  - action: git.push
    effect: deny
    branches: [main, master]
    reason: No push to protected branches
    suggestion: Use a feature branch instead
    correctedCommand: "git push origin feature/my-branch"
  - action: file.read
    effect: allow
    reason: Reading files is safe
  - action: shell.exec
    effect: allow
    reason: Shell commands allowed
  - action: file.write
    effect: allow
    reason: Writing files allowed
`

func TestHandleAllowFileRead(t *testing.T) {
	policyPath := writeTempPolicy(t, testPolicyYAML)
	handler, err := NewHandler([]string{policyPath})
	if err != nil {
		t.Fatalf("create handler: %v", err)
	}

	input := HookInput{
		Tool:  "Read",
		Input: json.RawMessage(`{"file_path":"/tmp/test.txt"}`),
		Event: PreToolUse,
	}

	resp := handler.Handle(input)
	if resp.Decision != "allow" {
		t.Errorf("expected allow, got %s (reason: %s)", resp.Decision, resp.Reason)
	}
}

func TestHandleDenyGitPushToMain(t *testing.T) {
	policyPath := writeTempPolicy(t, testPolicyYAML)
	handler, err := NewHandler([]string{policyPath})
	if err != nil {
		t.Fatalf("create handler: %v", err)
	}

	input := HookInput{
		Tool:  "Bash",
		Input: json.RawMessage(`{"command":"git push origin main"}`),
		Event: PreToolUse,
	}

	resp := handler.Handle(input)
	if resp.Decision != "deny" {
		t.Errorf("expected deny, got %s", resp.Decision)
	}
	if resp.Reason != "No push to protected branches" {
		t.Errorf("expected reason 'No push to protected branches', got '%s'", resp.Reason)
	}
}

func TestHandleSuggestionPassThrough(t *testing.T) {
	policyPath := writeTempPolicy(t, testPolicyYAML)
	handler, err := NewHandler([]string{policyPath})
	if err != nil {
		t.Fatalf("create handler: %v", err)
	}

	input := HookInput{
		Tool:  "Bash",
		Input: json.RawMessage(`{"command":"git push origin main"}`),
		Event: PreToolUse,
	}

	resp := handler.Handle(input)
	if resp.Suggestion != "Use a feature branch instead" {
		t.Errorf("expected suggestion, got '%s'", resp.Suggestion)
	}
	if resp.CorrectedCommand != "git push origin feature/my-branch" {
		t.Errorf("expected corrected command, got '%s'", resp.CorrectedCommand)
	}
}

func TestHandleDefaultDenyUnknownAction(t *testing.T) {
	policyPath := writeTempPolicy(t, testPolicyYAML)
	handler, err := NewHandler([]string{policyPath})
	if err != nil {
		t.Fatalf("create handler: %v", err)
	}

	// CustomTool has no matching rule -> default deny
	input := HookInput{
		Tool:  "CustomTool",
		Input: json.RawMessage(`{}`),
		Event: PreToolUse,
	}

	resp := handler.Handle(input)
	if resp.Decision != "deny" {
		t.Errorf("expected deny for unknown action, got %s", resp.Decision)
	}
}

func TestHandlePostToolUseAlwaysAllows(t *testing.T) {
	policyPath := writeTempPolicy(t, testPolicyYAML)
	handler, err := NewHandler([]string{policyPath})
	if err != nil {
		t.Fatalf("create handler: %v", err)
	}

	// Even a normally-denied action should be allowed in PostToolUse
	input := HookInput{
		Tool:  "Bash",
		Input: json.RawMessage(`{"command":"git push origin main"}`),
		Event: PostToolUse,
	}

	resp := handler.Handle(input)
	if resp.Decision != "allow" {
		t.Errorf("expected allow for PostToolUse, got %s", resp.Decision)
	}
}

func TestHandleAllowShellExec(t *testing.T) {
	policyPath := writeTempPolicy(t, testPolicyYAML)
	handler, err := NewHandler([]string{policyPath})
	if err != nil {
		t.Fatalf("create handler: %v", err)
	}

	input := HookInput{
		Tool:  "Bash",
		Input: json.RawMessage(`{"command":"ls -la"}`),
		Event: PreToolUse,
	}

	resp := handler.Handle(input)
	if resp.Decision != "allow" {
		t.Errorf("expected allow for ls, got %s (reason: %s)", resp.Decision, resp.Reason)
	}
}

func TestHandleAllowFileWrite(t *testing.T) {
	policyPath := writeTempPolicy(t, testPolicyYAML)
	handler, err := NewHandler([]string{policyPath})
	if err != nil {
		t.Fatalf("create handler: %v", err)
	}

	input := HookInput{
		Tool:  "Write",
		Input: json.RawMessage(`{"file_path":"src/main.go","content":"package main"}`),
		Event: PreToolUse,
	}

	resp := handler.Handle(input)
	if resp.Decision != "allow" {
		t.Errorf("expected allow for file write, got %s (reason: %s)", resp.Decision, resp.Reason)
	}
}

func TestHandleNilInput(t *testing.T) {
	policyPath := writeTempPolicy(t, testPolicyYAML)
	handler, err := NewHandler([]string{policyPath})
	if err != nil {
		t.Fatalf("create handler: %v", err)
	}

	input := HookInput{
		Tool:  "Read",
		Event: PreToolUse,
	}

	// Should not panic with nil input
	resp := handler.Handle(input)
	// file.read has an allow rule
	if resp.Decision != "allow" {
		t.Errorf("expected allow for Read with nil input, got %s", resp.Decision)
	}
}

func TestNewHandlerInvalidPolicyPath(t *testing.T) {
	_, err := NewHandler([]string{"/nonexistent/path/policy.yaml"})
	if err == nil {
		t.Error("expected error for nonexistent policy path")
	}
}

func TestNewHandlerInvalidPolicyContent(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "bad.yaml")
	os.WriteFile(path, []byte("{{invalid yaml"), 0644)

	_, err := NewHandler([]string{path})
	if err == nil {
		t.Error("expected error for invalid YAML policy")
	}
}

func TestHandleMultiplePolicies(t *testing.T) {
	policy1 := writeTempPolicy(t, `
id: p1
name: P1
severity: 3
rules:
  - action: file.write
    effect: allow
    reason: Write allowed by p1
`)

	dir2 := t.TempDir()
	policy2Path := filepath.Join(dir2, "policy2.yaml")
	os.WriteFile(policy2Path, []byte(`
id: p2
name: P2
severity: 5
rules:
  - action: file.write
    effect: deny
    reason: Write denied by p2
`), 0644)

	// Deny rules are checked first across all policies
	handler, err := NewHandler([]string{policy1, policy2Path})
	if err != nil {
		t.Fatalf("create handler: %v", err)
	}

	input := HookInput{
		Tool:  "Write",
		Input: json.RawMessage(`{"file_path":"test.txt","content":"hello"}`),
		Event: PreToolUse,
	}

	resp := handler.Handle(input)
	if resp.Decision != "deny" {
		t.Errorf("expected deny from p2, got %s", resp.Decision)
	}
	if resp.Reason != "Write denied by p2" {
		t.Errorf("expected reason from p2, got '%s'", resp.Reason)
	}
}

func TestBuildRawActionFromBashInput(t *testing.T) {
	input := HookInput{
		Tool:      "Bash",
		Input:     json.RawMessage(`{"command":"git status"}`),
		SessionID: "sess-123",
		Event:     PreToolUse,
	}
	raw := buildRawAction(input)
	if raw.Tool != "Bash" {
		t.Errorf("expected Bash, got %s", raw.Tool)
	}
	if raw.Command != "git status" {
		t.Errorf("expected 'git status', got %s", raw.Command)
	}
	if raw.Agent != "claude-code:sess-123" {
		t.Errorf("expected agent identity, got %s", raw.Agent)
	}
}

func TestBuildRawActionFromWriteInput(t *testing.T) {
	input := HookInput{
		Tool:  "Write",
		Input: json.RawMessage(`{"file_path":"src/main.go","content":"package main"}`),
		Event: PreToolUse,
	}
	raw := buildRawAction(input)
	if raw.File != "src/main.go" {
		t.Errorf("expected file src/main.go, got %s", raw.File)
	}
	if raw.Content != "package main" {
		t.Errorf("expected content, got %s", raw.Content)
	}
}

func TestBuildRawActionFromGrepInput(t *testing.T) {
	input := HookInput{
		Tool:  "Grep",
		Input: json.RawMessage(`{"pattern":"TODO"}`),
		Event: PreToolUse,
	}
	raw := buildRawAction(input)
	if raw.Target != "TODO" {
		t.Errorf("expected target TODO from pattern, got %s", raw.Target)
	}
}

func TestAgentFromSessionEmpty(t *testing.T) {
	agent := agentFromSession("")
	if agent != "claude-code" {
		t.Errorf("expected claude-code, got %s", agent)
	}
}

func TestAgentFromSessionWithID(t *testing.T) {
	agent := agentFromSession("abc-123")
	if agent != "claude-code:abc-123" {
		t.Errorf("expected claude-code:abc-123, got %s", agent)
	}
}

func TestResultToResponseAllow(t *testing.T) {
	result := resultToResponse(allowResult())
	if result.Decision != "allow" {
		t.Errorf("expected allow, got %s", result.Decision)
	}
}

func TestResultToResponseDeny(t *testing.T) {
	result := resultToResponse(denyResult())
	if result.Decision != "deny" {
		t.Errorf("expected deny, got %s", result.Decision)
	}
	if result.Reason == "" {
		t.Error("expected non-empty reason for deny")
	}
}

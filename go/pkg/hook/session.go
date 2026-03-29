package hook

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

// SessionState persists across hook invocations within a single Claude Code session.
// Stored as JSON in $TMPDIR/agentguard/session-{sessionId}.json.
type SessionState struct {
	FormatPass   bool              `json:"formatPass,omitempty"`
	TestsPass    bool              `json:"testsPass,omitempty"`
	WrittenFiles []string          `json:"writtenFiles,omitempty"`
	RetryCounts  map[string]int    `json:"retryCounts,omitempty"`
	AgentName    string            `json:"agentName,omitempty"`
}

func sessionDir() string {
	return filepath.Join(os.TempDir(), "agentguard")
}

func sessionPath(sessionID string) string {
	return filepath.Join(sessionDir(), fmt.Sprintf("session-%s.json", sessionID))
}

// ReadSessionState loads session state from disk. Returns empty state if not found.
func ReadSessionState(sessionID string) SessionState {
	if sessionID == "" {
		return SessionState{}
	}
	data, err := os.ReadFile(sessionPath(sessionID))
	if err != nil {
		return SessionState{}
	}
	var state SessionState
	if err := json.Unmarshal(data, &state); err != nil {
		return SessionState{}
	}
	return state
}

// WriteSessionState merges updates into the existing session state and persists it.
func WriteSessionState(sessionID string, updates SessionState) {
	if sessionID == "" {
		return
	}
	state := ReadSessionState(sessionID)

	if updates.FormatPass {
		state.FormatPass = true
	}
	if updates.TestsPass {
		state.TestsPass = true
	}
	if updates.AgentName != "" {
		state.AgentName = updates.AgentName
	}
	if len(updates.WrittenFiles) > 0 {
		seen := make(map[string]bool)
		for _, f := range state.WrittenFiles {
			seen[f] = true
		}
		for _, f := range updates.WrittenFiles {
			if !seen[f] {
				state.WrittenFiles = append(state.WrittenFiles, f)
			}
		}
	}
	if updates.RetryCounts != nil {
		if state.RetryCounts == nil {
			state.RetryCounts = make(map[string]int)
		}
		for k, v := range updates.RetryCounts {
			state.RetryCounts[k] = v
		}
	}

	os.MkdirAll(sessionDir(), 0o755)
	data, err := json.Marshal(state)
	if err != nil {
		return
	}
	os.WriteFile(sessionPath(sessionID), data, 0o644)
}

// GetRetryCount returns the retry count for a specific action key.
func GetRetryCount(sessionID, key string) int {
	state := ReadSessionState(sessionID)
	if state.RetryCounts == nil {
		return 0
	}
	return state.RetryCounts[key]
}

// IncrementRetry bumps the retry counter for an action key and returns the new count.
func IncrementRetry(sessionID, key string) int {
	state := ReadSessionState(sessionID)
	if state.RetryCounts == nil {
		state.RetryCounts = make(map[string]int)
	}
	state.RetryCounts[key]++
	count := state.RetryCounts[key]
	WriteSessionState(sessionID, SessionState{RetryCounts: state.RetryCounts})
	return count
}

// TrackPostToolUse inspects a PostToolUse result and updates session state.
// - Detects format pass (prettier/format commands with exit 0)
// - Detects test pass (vitest/jest/pnpm test with exit 0)
// - Tracks written files for commit-scope-guard
func TrackPostToolUse(sessionID string, input HookInput) {
	if sessionID == "" {
		return
	}
	fields := input.InputFields()
	if fields == nil {
		return
	}

	command, _ := fields["command"].(string)
	output, _ := fields["tool_output"].(map[string]any)
	if output == nil {
		// Try top-level exit_code for simplified payloads
		return
	}

	exitCode := 0
	if ec, ok := output["exit_code"].(float64); ok {
		exitCode = int(ec)
	}

	if exitCode != 0 || command == "" {
		return
	}

	cmdLower := strings.ToLower(command)

	// Format pass detection
	if strings.Contains(cmdLower, "prettier") ||
		strings.Contains(cmdLower, "format:fix") ||
		strings.Contains(cmdLower, "format --write") {
		WriteSessionState(sessionID, SessionState{FormatPass: true})
	}

	// Test pass detection
	if strings.Contains(cmdLower, "vitest") ||
		strings.Contains(cmdLower, "jest") ||
		strings.Contains(cmdLower, "pnpm test") {
		WriteSessionState(sessionID, SessionState{TestsPass: true})
	}
}

// --- Root Session Tracking ---

const rootSessionFile = ".agentguard-root-session"

// WriteRootSession writes the root session marker if no active root session exists.
func WriteRootSession(sessionID string, workspace string) {
	if sessionID == "" || workspace == "" {
		return
	}
	path := filepath.Join(workspace, rootSessionFile)

	// Check if a root session already exists and is still alive
	data, err := os.ReadFile(path)
	if err == nil {
		lines := strings.SplitN(string(data), "\n", 2)
		if len(lines) >= 2 {
			var pid int
			fmt.Sscanf(lines[1], "%d", &pid)
			if pid > 0 && isProcessAlive(pid) {
				return // existing root session is alive
			}
		}
	}

	content := fmt.Sprintf("%s\n%d", sessionID, os.Getppid())
	os.WriteFile(path, []byte(content), 0o644)
}

// CleanRootSession removes the root session marker if it matches the current session.
func CleanRootSession(sessionID string, workspace string) {
	if sessionID == "" || workspace == "" {
		return
	}
	path := filepath.Join(workspace, rootSessionFile)
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	lines := strings.SplitN(string(data), "\n", 2)
	if len(lines) > 0 && strings.TrimSpace(lines[0]) == sessionID {
		os.Remove(path)
	}
}

func isProcessAlive(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return process.Signal(syscall.Signal(0)) == nil
}

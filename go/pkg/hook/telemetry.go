package hook

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// TelemetryEvent is a governance event sent to the cloud dashboard.
type TelemetryEvent struct {
	Type      string         `json:"type"`
	Timestamp string         `json:"timestamp"`
	RunID     string         `json:"runId"`
	SessionID string         `json:"sessionId,omitempty"`
	AgentID   string         `json:"agentId,omitempty"`
	Action    string         `json:"action,omitempty"`
	Decision  string         `json:"decision,omitempty"`
	Reason    string         `json:"reason,omitempty"`
	Tool      string         `json:"tool,omitempty"`
	Target    string         `json:"target,omitempty"`
	Mode      string         `json:"mode,omitempty"`
	Metadata  map[string]any `json:"metadata,omitempty"`
}

// TelemetryClient sends events to the AgentGuard cloud dashboard.
type TelemetryClient struct {
	serverURL string
	apiKey    string
	client    *http.Client
}

// NewTelemetryClient creates a client from env vars or enrollment file.
// Returns nil if telemetry is not configured (no API key).
func NewTelemetryClient() *TelemetryClient {
	apiKey := os.Getenv("AGENTGUARD_API_KEY")
	serverURL := os.Getenv("AGENTGUARD_TELEMETRY_URL")

	// Try enrollment file
	if apiKey == "" {
		apiKey, serverURL = readEnrollment()
	}

	if apiKey == "" {
		return nil // telemetry not configured
	}

	if serverURL == "" {
		serverURL = "https://agentguard-cloud.vercel.app"
	}

	return &TelemetryClient{
		serverURL: serverURL,
		apiKey:    apiKey,
		client:    &http.Client{Timeout: 2 * time.Second},
	}
}

// Send fires a telemetry event to the cloud. Non-blocking, best-effort.
func (tc *TelemetryClient) Send(event TelemetryEvent) {
	if tc == nil {
		return
	}
	if event.Timestamp == "" {
		event.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}

	data, err := json.Marshal(event)
	if err != nil {
		return
	}

	req, err := http.NewRequest("POST", tc.serverURL+"/api/telemetry/events", bytes.NewReader(data))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+tc.apiKey)

	// Fire and forget — 2s timeout, don't block the hook
	go func() {
		resp, err := tc.client.Do(req)
		if err == nil {
			resp.Body.Close()
		}
	}()
}

func readEnrollment() (apiKey, serverURL string) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", ""
	}
	path := filepath.Join(home, ".agentguard", "enrollment.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return "", ""
	}
	var enrollment struct {
		EnrollmentToken string `json:"enrollment_token"`
		ServerURL       string `json:"server_url"`
	}
	if err := json.Unmarshal(data, &enrollment); err != nil {
		return "", ""
	}
	return enrollment.EnrollmentToken, enrollment.ServerURL
}

package signals

import (
	"encoding/json"
	"net/http"
	"strings"
)

// NewHandler returns an http.Handler that serves the signals JSON API.
//
//	GET /signals       — returns Snapshot() (all signals)
//	GET /signals/{kind} — returns a specific signal by kind
//
// All responses are JSON with Content-Type: application/json.
// The handler is thread-safe and read-only.
func NewHandler(agg *Aggregator) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Only handle paths starting with /signals
		if !strings.HasPrefix(r.URL.Path, "/signals") {
			http.NotFound(w, r)
			return
		}

		if r.Method != http.MethodGet {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}

		// Extract sub-path after /signals
		path := strings.TrimPrefix(r.URL.Path, "/signals")
		path = strings.TrimPrefix(path, "/")

		if path != "" {
			serveSignalByKind(w, agg, path)
			return
		}

		// Return full snapshot
		snapshot := agg.Snapshot()
		writeJSON(w, http.StatusOK, snapshot)
	})
}

func serveSignalByKind(w http.ResponseWriter, agg *Aggregator, kind string) {
	var signal Signal
	var found bool

	switch kind {
	case DenialRate:
		signal = agg.DenialRate(5)
		found = true
	case EscalationLevel:
		signal = agg.EscalationLevel()
		found = true
	case InvariantHitRate:
		signal = agg.InvariantHitRates()
		found = true
	case BlastRadiusTrend:
		signal = agg.BlastRadiusTrend(5)
		found = true
	case AgentComplianceScore:
		// Agent compliance requires an agent ID — return error without one
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "agent_compliance requires ?agent= query parameter",
		})
		return
	case ActionThroughput:
		signal = agg.ActionThroughput(5)
		found = true
	case TopViolations:
		signal = agg.TopViolations(10)
		found = true
	case SessionHealth:
		signal = agg.SessionHealth()
		found = true
	}

	if !found {
		writeJSON(w, http.StatusNotFound, map[string]string{
			"error": "unknown signal kind: " + kind,
		})
		return
	}

	writeJSON(w, http.StatusOK, signal)
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

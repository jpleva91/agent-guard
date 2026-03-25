package event

import (
	"testing"
	"time"
)

func TestNewEvent(t *testing.T) {
	payload := map[string]any{
		"actionType": "git.push",
		"target":     "main",
		"reason":     "protected branch",
	}
	evt := NewEvent(ActionDenied, "sess-1", payload)

	if evt.ID == "" {
		t.Fatal("expected non-empty ID")
	}
	if evt.Kind != ActionDenied {
		t.Fatalf("expected kind %s, got %s", ActionDenied, evt.Kind)
	}
	if evt.SessionID != "sess-1" {
		t.Fatalf("expected sessionID sess-1, got %s", evt.SessionID)
	}
	if evt.Timestamp.IsZero() {
		t.Fatal("expected non-zero timestamp")
	}
	if evt.Payload["actionType"] != "git.push" {
		t.Fatalf("expected actionType git.push, got %v", evt.Payload["actionType"])
	}
}

func TestNewEventUniqueIDs(t *testing.T) {
	ids := make(map[string]struct{}, 100)
	for i := 0; i < 100; i++ {
		evt := NewEvent(RunStarted, "sess", nil)
		if _, dup := ids[evt.ID]; dup {
			t.Fatalf("duplicate ID on iteration %d: %s", i, evt.ID)
		}
		ids[evt.ID] = struct{}{}
	}
}

func TestNewEventTimestamp(t *testing.T) {
	before := time.Now()
	evt := NewEvent(RunStarted, "sess", nil)
	after := time.Now()

	if evt.Timestamp.Before(before) || evt.Timestamp.After(after) {
		t.Fatalf("timestamp %v not between %v and %v", evt.Timestamp, before, after)
	}
}

func TestValidateValid(t *testing.T) {
	evt := NewEvent(PolicyDenied, "sess-1", map[string]any{"reason": "test"})
	if err := Validate(evt); err != nil {
		t.Fatalf("expected valid event, got error: %v", err)
	}
}

func TestValidateMissingKind(t *testing.T) {
	evt := Event{
		ID:        "test-id",
		Kind:      "",
		Timestamp: time.Now(),
		SessionID: "sess-1",
	}
	err := Validate(evt)
	if err == nil {
		t.Fatal("expected error for missing kind")
	}
}

func TestValidateUnknownKind(t *testing.T) {
	evt := Event{
		ID:        "test-id",
		Kind:      "TotallyFakeKind",
		Timestamp: time.Now(),
		SessionID: "sess-1",
	}
	err := Validate(evt)
	if err == nil {
		t.Fatal("expected error for unknown kind")
	}
}

func TestValidateMissingSessionID(t *testing.T) {
	evt := Event{
		ID:        "test-id",
		Kind:      RunStarted,
		Timestamp: time.Now(),
		SessionID: "",
	}
	err := Validate(evt)
	if err == nil {
		t.Fatal("expected error for missing sessionID")
	}
}

func TestValidateMissingID(t *testing.T) {
	evt := Event{
		ID:        "",
		Kind:      RunStarted,
		Timestamp: time.Now(),
		SessionID: "sess-1",
	}
	err := Validate(evt)
	if err == nil {
		t.Fatal("expected error for missing ID")
	}
}

func TestValidateMissingTimestamp(t *testing.T) {
	evt := Event{
		ID:        "test-id",
		Kind:      RunStarted,
		SessionID: "sess-1",
	}
	err := Validate(evt)
	if err == nil {
		t.Fatal("expected error for zero timestamp")
	}
}

func TestValidateMultipleErrors(t *testing.T) {
	evt := Event{} // all fields zero
	err := Validate(evt)
	if err == nil {
		t.Fatal("expected errors for empty event")
	}
	// Should report at least ID, kind, sessionID, and timestamp errors.
	errStr := err.Error()
	for _, want := range []string{"ID", "kind", "sessionID", "timestamp"} {
		found := false
		// Case-insensitive substring search is fine for test assertions.
		for _, part := range []string{errStr} {
			if containsSubstring(part, want) {
				found = true
			}
		}
		if !found {
			t.Errorf("expected error about %q in: %s", want, errStr)
		}
	}
}

func TestAllEventKindsDistinct(t *testing.T) {
	seen := make(map[EventKind]struct{}, len(AllEventKinds))
	for _, k := range AllEventKinds {
		if _, dup := seen[k]; dup {
			t.Fatalf("duplicate event kind: %s", k)
		}
		seen[k] = struct{}{}
	}
}

func TestAllEventKindsNonEmpty(t *testing.T) {
	for _, k := range AllEventKinds {
		if k == "" {
			t.Fatal("found empty event kind in AllEventKinds")
		}
	}
}

func TestIsValidKind(t *testing.T) {
	for _, k := range AllEventKinds {
		if !IsValidKind(k) {
			t.Fatalf("IsValidKind(%q) = false, want true", k)
		}
	}
	if IsValidKind("NotARealKind") {
		t.Fatal("IsValidKind(NotARealKind) = true, want false")
	}
	if IsValidKind("") {
		t.Fatal("IsValidKind('') = true, want false")
	}
}

func TestAllEventKindsCount(t *testing.T) {
	// There are 47 event kinds in the TS schema. This guards against
	// accidentally dropping kinds during future edits.
	const expected = 47
	if got := len(AllEventKinds); got != expected {
		t.Fatalf("AllEventKinds has %d entries, expected %d", got, expected)
	}
}

func TestGenerateUUIDFormat(t *testing.T) {
	id := generateUUID()
	// UUID v4 format: 8-4-4-4-12 hex chars
	if len(id) != 36 {
		t.Fatalf("expected UUID length 36, got %d: %s", len(id), id)
	}
	if id[8] != '-' || id[13] != '-' || id[18] != '-' || id[23] != '-' {
		t.Fatalf("unexpected UUID format: %s", id)
	}
}

// containsSubstring is a simple case-insensitive substring check for tests.
func containsSubstring(s, substr string) bool {
	for i := 0; i+len(substr) <= len(s); i++ {
		match := true
		for j := 0; j < len(substr); j++ {
			a, b := s[i+j], substr[j]
			if a != b && a != b+32 && a != b-32 {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}

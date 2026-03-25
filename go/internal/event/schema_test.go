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
	if evt.RunID != "sess-1" {
		t.Fatalf("expected runID sess-1, got %s", evt.RunID)
	}
	if evt.Timestamp == 0 {
		t.Fatal("expected non-zero timestamp")
	}
	if evt.Data["actionType"] != "git.push" {
		t.Fatalf("expected actionType git.push, got %v", evt.Data["actionType"])
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
	before := time.Now().UnixMilli()
	evt := NewEvent(RunStarted, "sess", nil)
	after := time.Now().UnixMilli()

	if evt.Timestamp < before || evt.Timestamp > after {
		t.Fatalf("timestamp %d not between %d and %d", evt.Timestamp, before, after)
	}
}

func TestCategoryOf(t *testing.T) {
	tests := []struct {
		kind Kind
		want Category
	}{
		{RunStarted, CategoryLifecycle},
		{PolicyDenied, CategoryGovernance},
		{ActionAllowed, CategoryRefMonitor},
		{ActionDenied, CategoryRefMonitor},
		{Kind("Unknown"), ""},
	}
	for _, tt := range tests {
		got := CategoryOf(tt.kind)
		if got != tt.want {
			t.Errorf("CategoryOf(%s) = %s, want %s", tt.kind, got, tt.want)
		}
	}
}

func TestNewEventNilData(t *testing.T) {
	evt := NewEvent(RunStarted, "sess", nil)
	if evt.Data != nil {
		t.Fatalf("expected nil data, got %v", evt.Data)
	}
}

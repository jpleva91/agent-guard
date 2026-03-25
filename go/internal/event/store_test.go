package event

import (
	"sync"
	"testing"
	"time"
)

func TestStoreAppendAndEvents(t *testing.T) {
	store := NewEventStore()
	evt := NewEvent(ActionDenied, "sess-1", nil)

	store.Append(evt)
	events := store.Events()

	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].ID != evt.ID {
		t.Fatalf("expected event ID %s, got %s", evt.ID, events[0].ID)
	}
}

func TestStoreEventsReturnsCopy(t *testing.T) {
	store := NewEventStore()
	store.Append(NewEvent(RunStarted, "s", nil))

	events := store.Events()
	events = append(events, NewEvent(RunEnded, "s", nil)) // mutate local copy

	if store.Count() != 1 {
		t.Fatal("mutating Events() return value should not affect store")
	}
}

func TestStoreByKind(t *testing.T) {
	store := NewEventStore()
	store.Append(NewEvent(ActionDenied, "s", nil))
	store.Append(NewEvent(RunStarted, "s", nil))
	store.Append(NewEvent(ActionDenied, "s", nil))
	store.Append(NewEvent(PolicyDenied, "s", nil))

	denials := store.ByKind(ActionDenied)
	if len(denials) != 2 {
		t.Fatalf("expected 2 ActionDenied events, got %d", len(denials))
	}
	for _, e := range denials {
		if e.Kind != ActionDenied {
			t.Fatalf("expected kind %s, got %s", ActionDenied, e.Kind)
		}
	}
}

func TestStoreByKindEmpty(t *testing.T) {
	store := NewEventStore()
	store.Append(NewEvent(RunStarted, "s", nil))

	result := store.ByKind(ActionDenied)
	if len(result) != 0 {
		t.Fatalf("expected 0 events, got %d", len(result))
	}
}

func TestStoreBySession(t *testing.T) {
	store := NewEventStore()
	store.Append(NewEvent(ActionDenied, "sess-a", nil))
	store.Append(NewEvent(RunStarted, "sess-b", nil))
	store.Append(NewEvent(ActionDenied, "sess-a", nil))

	sessA := store.BySession("sess-a")
	if len(sessA) != 2 {
		t.Fatalf("expected 2 events for sess-a, got %d", len(sessA))
	}
	for _, e := range sessA {
		if e.SessionID != "sess-a" {
			t.Fatalf("expected sessionID sess-a, got %s", e.SessionID)
		}
	}

	sessB := store.BySession("sess-b")
	if len(sessB) != 1 {
		t.Fatalf("expected 1 event for sess-b, got %d", len(sessB))
	}
}

func TestStoreBySessionEmpty(t *testing.T) {
	store := NewEventStore()
	result := store.BySession("nonexistent")
	if len(result) != 0 {
		t.Fatalf("expected 0 events, got %d", len(result))
	}
}

func TestStoreSince(t *testing.T) {
	store := NewEventStore()

	t1 := time.Now()
	time.Sleep(2 * time.Millisecond) // ensure timestamp separation

	store.Append(NewEvent(RunStarted, "s", nil))
	time.Sleep(2 * time.Millisecond)
	t2 := time.Now()
	time.Sleep(2 * time.Millisecond)

	store.Append(NewEvent(RunEnded, "s", nil))

	// Since t1 should include both events.
	all := store.Since(t1)
	if len(all) != 2 {
		t.Fatalf("expected 2 events since t1, got %d", len(all))
	}

	// Since t2 should include only the second event.
	recent := store.Since(t2)
	if len(recent) != 1 {
		t.Fatalf("expected 1 event since t2, got %d", len(recent))
	}
	if recent[0].Kind != RunEnded {
		t.Fatalf("expected RunEnded, got %s", recent[0].Kind)
	}
}

func TestStoreSinceExactMatch(t *testing.T) {
	store := NewEventStore()
	evt := NewEvent(RunStarted, "s", nil)
	store.Append(evt)

	// Since the exact timestamp should include the event.
	result := store.Since(evt.Timestamp)
	if len(result) != 1 {
		t.Fatalf("expected 1 event at exact timestamp, got %d", len(result))
	}
}

func TestStoreCount(t *testing.T) {
	store := NewEventStore()
	if store.Count() != 0 {
		t.Fatal("new store should have count 0")
	}

	store.Append(NewEvent(RunStarted, "s", nil))
	store.Append(NewEvent(RunEnded, "s", nil))

	if store.Count() != 2 {
		t.Fatalf("expected count 2, got %d", store.Count())
	}
}

func TestStoreClear(t *testing.T) {
	store := NewEventStore()
	store.Append(NewEvent(RunStarted, "s", nil))
	store.Append(NewEvent(RunEnded, "s", nil))

	store.Clear()

	if store.Count() != 0 {
		t.Fatalf("expected count 0 after clear, got %d", store.Count())
	}
	if len(store.Events()) != 0 {
		t.Fatal("expected empty events after clear")
	}
}

func TestStoreClearThenAppend(t *testing.T) {
	store := NewEventStore()
	store.Append(NewEvent(RunStarted, "s", nil))
	store.Clear()
	store.Append(NewEvent(RunEnded, "s", nil))

	if store.Count() != 1 {
		t.Fatalf("expected 1 event after clear+append, got %d", store.Count())
	}
}

func TestStoreConcurrentAppend(t *testing.T) {
	store := NewEventStore()
	const goroutines = 50
	const eventsPerGoroutine = 100

	var wg sync.WaitGroup
	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			for j := 0; j < eventsPerGoroutine; j++ {
				store.Append(NewEvent(ActionExecuted, "s", nil))
			}
		}()
	}
	wg.Wait()

	expected := goroutines * eventsPerGoroutine
	if got := store.Count(); got != expected {
		t.Fatalf("expected %d events, got %d", expected, got)
	}
}

func TestStoreConcurrentReadWrite(t *testing.T) {
	store := NewEventStore()
	const iterations = 500

	var wg sync.WaitGroup
	wg.Add(3)

	// Writer
	go func() {
		defer wg.Done()
		for i := 0; i < iterations; i++ {
			store.Append(NewEvent(ActionDenied, "s", nil))
		}
	}()

	// Reader: Events()
	go func() {
		defer wg.Done()
		for i := 0; i < iterations; i++ {
			_ = store.Events()
		}
	}()

	// Reader: ByKind()
	go func() {
		defer wg.Done()
		for i := 0; i < iterations; i++ {
			_ = store.ByKind(ActionDenied)
		}
	}()

	wg.Wait()

	if store.Count() != iterations {
		t.Fatalf("expected %d events, got %d", iterations, store.Count())
	}
}

package event

import (
	"sync"
	"testing"
)

func TestStoreAppendAndAll(t *testing.T) {
	store := NewStore()
	evt := NewEvent(ActionDenied, "sess-1", nil)
	store.Append(evt)

	all := store.All()
	if len(all) != 1 {
		t.Fatalf("expected 1 event, got %d", len(all))
	}
	if all[0].ID != evt.ID {
		t.Fatalf("got wrong event")
	}
}

func TestStoreAllReturnsCopy(t *testing.T) {
	store := NewStore()
	store.Append(NewEvent(RunStarted, "s", nil))

	events := store.All()
	events = append(events, NewEvent(RunEnded, "s", nil))

	if store.Len() != 1 {
		t.Fatalf("store mutated by modifying returned slice: got %d, want 1", store.Len())
	}
}

func TestStoreLen(t *testing.T) {
	store := NewStore()
	if store.Len() != 0 {
		t.Fatalf("expected 0, got %d", store.Len())
	}

	store.Append(NewEvent(ActionDenied, "s", nil))
	store.Append(NewEvent(RunStarted, "s", nil))
	store.Append(NewEvent(ActionDenied, "s", nil))

	if store.Len() != 3 {
		t.Fatalf("expected 3, got %d", store.Len())
	}
}

func TestStoreConcurrentAppend(t *testing.T) {
	store := NewStore()
	const goroutines = 50
	const eventsPerGoroutine = 100

	var wg sync.WaitGroup
	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			for j := 0; j < eventsPerGoroutine; j++ {
				store.Append(NewEvent(RunStarted, "s", nil))
			}
		}()
	}
	wg.Wait()

	expected := goroutines * eventsPerGoroutine
	if got := store.Len(); got != expected {
		t.Fatalf("expected %d events, got %d", expected, got)
	}
}

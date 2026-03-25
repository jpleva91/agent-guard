package event

import (
	"sync"
	"sync/atomic"
	"testing"
)

func TestBusSubscribeAndPublish(t *testing.T) {
	bus := NewEventBus()
	var received []Event

	bus.Subscribe(ActionDenied, func(e Event) {
		received = append(received, e)
	})

	evt := NewEvent(ActionDenied, "sess-1", map[string]any{"reason": "test"})
	bus.Publish(evt)

	if len(received) != 1 {
		t.Fatalf("expected 1 event, got %d", len(received))
	}
	if received[0].ID != evt.ID {
		t.Fatalf("received wrong event ID: got %s, want %s", received[0].ID, evt.ID)
	}
}

func TestBusKindFiltering(t *testing.T) {
	bus := NewEventBus()
	var denials, starts []Event

	bus.Subscribe(ActionDenied, func(e Event) {
		denials = append(denials, e)
	})
	bus.Subscribe(RunStarted, func(e Event) {
		starts = append(starts, e)
	})

	bus.Publish(NewEvent(ActionDenied, "s", nil))
	bus.Publish(NewEvent(RunStarted, "s", nil))
	bus.Publish(NewEvent(ActionAllowed, "s", nil))
	bus.Publish(NewEvent(ActionDenied, "s", nil))

	if len(denials) != 2 {
		t.Fatalf("expected 2 denial events, got %d", len(denials))
	}
	if len(starts) != 1 {
		t.Fatalf("expected 1 start event, got %d", len(starts))
	}
}

func TestBusSubscribeAll(t *testing.T) {
	bus := NewEventBus()
	var all []Event

	bus.SubscribeAll(func(e Event) {
		all = append(all, e)
	})

	bus.Publish(NewEvent(ActionDenied, "s", nil))
	bus.Publish(NewEvent(RunStarted, "s", nil))
	bus.Publish(NewEvent(PolicyDenied, "s", nil))

	if len(all) != 3 {
		t.Fatalf("expected 3 events via wildcard, got %d", len(all))
	}
}

func TestBusUnsubscribe(t *testing.T) {
	bus := NewEventBus()
	var count int

	id := bus.Subscribe(ActionDenied, func(e Event) {
		count++
	})

	bus.Publish(NewEvent(ActionDenied, "s", nil))
	if count != 1 {
		t.Fatalf("expected 1 call before unsubscribe, got %d", count)
	}

	bus.Unsubscribe(id)
	bus.Publish(NewEvent(ActionDenied, "s", nil))
	if count != 1 {
		t.Fatalf("expected no more calls after unsubscribe, got %d", count)
	}
}

func TestBusUnsubscribeUnknownID(t *testing.T) {
	bus := NewEventBus()
	// Should be a no-op, not panic.
	bus.Unsubscribe("nonexistent-id")
}

func TestBusMultipleHandlersSameKind(t *testing.T) {
	bus := NewEventBus()
	var a, b int

	bus.Subscribe(RunEnded, func(e Event) { a++ })
	bus.Subscribe(RunEnded, func(e Event) { b++ })

	bus.Publish(NewEvent(RunEnded, "s", nil))

	if a != 1 || b != 1 {
		t.Fatalf("expected both handlers called once, got a=%d b=%d", a, b)
	}
}

func TestBusWildcardAndSpecific(t *testing.T) {
	bus := NewEventBus()
	var specific, wildcard int

	bus.Subscribe(PolicyDenied, func(e Event) { specific++ })
	bus.SubscribeAll(func(e Event) { wildcard++ })

	bus.Publish(NewEvent(PolicyDenied, "s", nil))

	if specific != 1 {
		t.Fatalf("specific handler: expected 1, got %d", specific)
	}
	if wildcard != 1 {
		t.Fatalf("wildcard handler: expected 1, got %d", wildcard)
	}
}

func TestBusConcurrentPublish(t *testing.T) {
	bus := NewEventBus()
	var counter int64

	bus.SubscribeAll(func(e Event) {
		atomic.AddInt64(&counter, 1)
	})

	const goroutines = 50
	const eventsPerGoroutine = 100

	var wg sync.WaitGroup
	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			for j := 0; j < eventsPerGoroutine; j++ {
				bus.Publish(NewEvent(ActionExecuted, "s", nil))
			}
		}()
	}
	wg.Wait()

	expected := int64(goroutines * eventsPerGoroutine)
	if got := atomic.LoadInt64(&counter); got != expected {
		t.Fatalf("expected %d events, got %d", expected, got)
	}
}

func TestBusConcurrentSubscribeUnsubscribe(t *testing.T) {
	bus := NewEventBus()

	var wg sync.WaitGroup
	const goroutines = 50

	// Concurrent subscribes and unsubscribes should not panic.
	wg.Add(goroutines * 2)
	ids := make(chan string, goroutines)

	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			id := bus.Subscribe(ActionDenied, func(e Event) {})
			ids <- id
		}()
	}
	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			id := <-ids
			bus.Unsubscribe(id)
		}()
	}
	wg.Wait()
}

func TestBusNoSubscribers(t *testing.T) {
	bus := NewEventBus()
	// Publishing with no subscribers should not panic.
	bus.Publish(NewEvent(RunStarted, "s", nil))
}

func TestBusSubscribeReturnsUniqueIDs(t *testing.T) {
	bus := NewEventBus()
	ids := make(map[string]struct{}, 100)
	for i := 0; i < 100; i++ {
		id := bus.Subscribe(ActionDenied, func(e Event) {})
		if _, dup := ids[id]; dup {
			t.Fatalf("duplicate subscription ID: %s", id)
		}
		ids[id] = struct{}{}
	}
}

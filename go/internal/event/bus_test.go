package event

import (
	"sync"
	"sync/atomic"
	"testing"
)

func TestBusSubscribeAndPublish(t *testing.T) {
	bus := NewBus()
	var received []Event

	bus.Subscribe(func(e Event) {
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

func TestBusMultipleHandlers(t *testing.T) {
	bus := NewBus()
	var a, b int

	bus.Subscribe(func(e Event) { a++ })
	bus.Subscribe(func(e Event) { b++ })

	bus.Publish(NewEvent(RunStarted, "s", nil))

	if a != 1 || b != 1 {
		t.Fatalf("expected both handlers called once, got a=%d b=%d", a, b)
	}
}

func TestBusMultipleEvents(t *testing.T) {
	bus := NewBus()
	var all []Event

	bus.Subscribe(func(e Event) {
		all = append(all, e)
	})

	bus.Publish(NewEvent(ActionDenied, "s", nil))
	bus.Publish(NewEvent(RunStarted, "s", nil))
	bus.Publish(NewEvent(PolicyDenied, "s", nil))

	if len(all) != 3 {
		t.Fatalf("expected 3 events, got %d", len(all))
	}
}

func TestBusConcurrentPublish(t *testing.T) {
	bus := NewBus()
	var counter int64

	bus.Subscribe(func(e Event) {
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

func TestBusNoSubscribers(t *testing.T) {
	bus := NewBus()
	// Publishing with no subscribers should not panic.
	bus.Publish(NewEvent(RunStarted, "s", nil))
}

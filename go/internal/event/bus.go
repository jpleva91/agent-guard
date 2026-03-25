package event

import (
	"sync"
)

// EventHandler is the callback type for event bus subscribers.
type EventHandler func(Event)

// subscription holds a handler and the kind it is bound to (empty for wildcard).
type subscription struct {
	kind    EventKind
	handler EventHandler
}

// EventBus is a thread-safe publish/subscribe event bus.
// Handlers can subscribe to a specific EventKind or to all events (wildcard).
// Publish dispatches synchronously to matching handlers.
type EventBus struct {
	mu   sync.RWMutex
	subs map[string]subscription
	seq  uint64
}

// NewEventBus creates a ready-to-use EventBus.
func NewEventBus() *EventBus {
	return &EventBus{
		subs: make(map[string]subscription),
	}
}

// Subscribe registers a handler for a specific event kind.
// Returns a subscription ID that can be passed to Unsubscribe.
func (b *EventBus) Subscribe(kind EventKind, handler EventHandler) string {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.seq++
	id := subscriptionID(b.seq)
	b.subs[id] = subscription{kind: kind, handler: handler}
	return id
}

// SubscribeAll registers a handler that receives every published event
// regardless of kind. Returns a subscription ID.
func (b *EventBus) SubscribeAll(handler EventHandler) string {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.seq++
	id := subscriptionID(b.seq)
	b.subs[id] = subscription{kind: "", handler: handler} // empty kind = wildcard
	return id
}

// Unsubscribe removes a subscription by its ID.
// No-op if the ID is unknown.
func (b *EventBus) Unsubscribe(id string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.subs, id)
}

// Publish dispatches an event to all matching subscribers.
// A subscriber matches if it was registered for the event's Kind or as a wildcard.
// Handlers are called synchronously under a read lock — they should not block.
func (b *EventBus) Publish(event Event) {
	b.mu.RLock()
	// Snapshot handlers to release lock before calling them,
	// preventing deadlock if a handler calls Subscribe/Unsubscribe.
	handlers := make([]EventHandler, 0, len(b.subs))
	for _, sub := range b.subs {
		if sub.kind == "" || sub.kind == event.Kind {
			handlers = append(handlers, sub.handler)
		}
	}
	b.mu.RUnlock()

	for _, h := range handlers {
		h(event)
	}
}

// subscriptionID formats a sequence number into a subscription ID string.
func subscriptionID(seq uint64) string {
	// Simple, deterministic, collision-free within a single bus instance.
	return "sub_" + uitoa(seq)
}

// uitoa converts a uint64 to its decimal string representation.
func uitoa(val uint64) string {
	if val == 0 {
		return "0"
	}
	var buf [20]byte // max uint64 is 20 digits
	i := len(buf)
	for val > 0 {
		i--
		buf[i] = byte(val%10) + '0'
		val /= 10
	}
	return string(buf[i:])
}

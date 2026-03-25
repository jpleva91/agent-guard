package event

// This file serves as the package entry-point documentation.
//
// The event package provides the canonical event model for the AgentGuard
// Go kernel. It consists of three main components:
//
//   - schema.go: Event kinds (constants), the Event struct, factory, and validation.
//   - bus.go:    A thread-safe typed publish/subscribe event bus.
//   - store.go:  A thread-safe in-memory event store with query support.
//
// Usage:
//
//	bus := event.NewEventBus()
//	store := event.NewEventStore()
//
//	// Subscribe to all events and persist them.
//	bus.SubscribeAll(func(e event.Event) {
//	    store.Append(e)
//	})
//
//	// Publish a governance event.
//	evt := event.NewEvent(event.ActionDenied, "session-1", map[string]any{
//	    "actionType": "git.push",
//	    "target":     "main",
//	    "reason":     "protected branch",
//	})
//	bus.Publish(evt)

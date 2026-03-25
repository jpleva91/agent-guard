package shipper

import (
	"sync"
	"time"

	"github.com/AgentGuardHQ/agent-guard/go/internal/event"
)

// Batch accumulates events up to a max size or max age.
// It is safe for concurrent use.
type Batch struct {
	mu       sync.Mutex
	events   []event.Event
	maxSize  int
	maxAge   time.Duration
	created  time.Time
}

// NewBatch creates a new batch accumulator.
func NewBatch(maxSize int, maxAge time.Duration) *Batch {
	return &Batch{
		maxSize: maxSize,
		maxAge:  maxAge,
		created: time.Now(),
	}
}

// Add appends an event to the batch.
func (b *Batch) Add(e event.Event) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if len(b.events) == 0 {
		b.created = time.Now()
	}
	b.events = append(b.events, e)
}

// Full returns true if the batch has reached its max size.
func (b *Batch) Full() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.events) >= b.maxSize
}

// ShouldFlush returns true if the batch should be flushed due to size or age.
func (b *Batch) ShouldFlush() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	if len(b.events) == 0 {
		return false
	}
	if len(b.events) >= b.maxSize {
		return true
	}
	return time.Since(b.created) >= b.maxAge
}

// Drain returns all accumulated events and resets the batch.
func (b *Batch) Drain() []event.Event {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := b.events
	b.events = nil
	b.created = time.Now()
	return out
}

// Len returns the number of events currently in the batch.
func (b *Batch) Len() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.events)
}

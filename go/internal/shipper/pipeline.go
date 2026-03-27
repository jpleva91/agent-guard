package shipper

import (
	"fmt"
	"log"
	"sync"

	"github.com/AgentGuardHQ/agentguard/go/internal/event"
)

// FilterFunc decides whether an event should be shipped.
// Return true to ship, false to skip.
type FilterFunc func(event.Event) bool

// Pipeline subscribes to an EventBus and fans out events to multiple shippers.
// It handles shipper errors gracefully (log and continue).
type Pipeline struct {
	mu       sync.RWMutex
	shippers []Shipper
	filters  []FilterFunc
	logger   *log.Logger
	errCount int
}

// PipelineOption configures a Pipeline.
type PipelineOption func(*Pipeline)

// WithFilter adds a filter to the pipeline.
func WithFilter(f FilterFunc) PipelineOption {
	return func(p *Pipeline) {
		p.filters = append(p.filters, f)
	}
}

// WithLogger sets a custom logger for shipper errors.
func WithLogger(l *log.Logger) PipelineOption {
	return func(p *Pipeline) {
		p.logger = l
	}
}

// NewPipeline creates a pipeline that fans out events to the given shippers.
func NewPipeline(shippers []Shipper, opts ...PipelineOption) *Pipeline {
	p := &Pipeline{
		shippers: shippers,
		logger:   log.Default(),
	}
	for _, opt := range opts {
		opt(p)
	}
	return p
}

// Attach subscribes the pipeline to an EventBus so it receives all published events.
func (p *Pipeline) Attach(bus *event.Bus) {
	bus.Subscribe(func(e event.Event) {
		p.Handle(e)
	})
}

// Handle processes a single event: applies filters, then fans out to all shippers.
func (p *Pipeline) Handle(e event.Event) {
	// Apply filters — all must pass
	p.mu.RLock()
	filters := p.filters
	p.mu.RUnlock()

	for _, f := range filters {
		if !f(e) {
			return
		}
	}

	p.mu.RLock()
	shippers := p.shippers
	p.mu.RUnlock()

	for _, s := range shippers {
		if err := s.Ship(e); err != nil {
			p.mu.Lock()
			p.errCount++
			p.mu.Unlock()
			p.logger.Printf("shipper pipeline: error shipping event %s (kind=%s): %v", e.ID, e.Kind, err)
		}
	}
}

// Flush flushes all shippers in the pipeline.
func (p *Pipeline) Flush() error {
	p.mu.RLock()
	shippers := p.shippers
	p.mu.RUnlock()

	var errs []error
	for _, s := range shippers {
		if err := s.Flush(); err != nil {
			errs = append(errs, err)
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("pipeline flush: %d errors (first: %w)", len(errs), errs[0])
	}
	return nil
}

// Close flushes and closes all shippers in the pipeline.
func (p *Pipeline) Close() error {
	p.mu.RLock()
	shippers := p.shippers
	p.mu.RUnlock()

	var errs []error
	for _, s := range shippers {
		if err := s.Close(); err != nil {
			errs = append(errs, err)
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("pipeline close: %d errors (first: %w)", len(errs), errs[0])
	}
	return nil
}

// ErrorCount returns the total number of ship errors encountered.
func (p *Pipeline) ErrorCount() int {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.errCount
}

// --- Built-in filter helpers ---

// GovernanceOnly is a filter that only passes governance events.
func GovernanceOnly(e event.Event) bool {
	return event.CategoryOf(e.Kind) == event.CategoryGovernance
}

// SkipHeartbeats is a filter that skips heartbeat events.
func SkipHeartbeats(e event.Event) bool {
	return event.CategoryOf(e.Kind) != event.CategoryHeartbeat
}

// KindFilter returns a filter that only passes the given event kinds.
func KindFilter(kinds ...event.Kind) FilterFunc {
	set := make(map[event.Kind]struct{}, len(kinds))
	for _, k := range kinds {
		set[k] = struct{}{}
	}
	return func(e event.Event) bool {
		_, ok := set[e.Kind]
		return ok
	}
}

// CategoryFilter returns a filter that only passes events of the given categories.
func CategoryFilter(cats ...event.Category) FilterFunc {
	set := make(map[event.Category]struct{}, len(cats))
	for _, c := range cats {
		set[c] = struct{}{}
	}
	return func(e event.Event) bool {
		_, ok := set[event.CategoryOf(e.Kind)]
		return ok
	}
}

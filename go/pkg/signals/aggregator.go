package signals

import (
	"sort"
	"time"

	"github.com/AgentGuardHQ/agentguard/go/internal/event"
	"github.com/AgentGuardHQ/agentguard/go/internal/monitor"
)

// Aggregator reads from an event store and produces governance intelligence signals.
// It is read-only and never mutates the store.
type Aggregator struct {
	store *event.Store
	// now is an injectable clock for testing (defaults to time.Now().UnixMilli).
	now func() int64
}

// NewAggregator creates an aggregator backed by the given event store.
func NewAggregator(store *event.Store) *Aggregator {
	return &Aggregator{
		store: store,
		now:   func() int64 { return time.Now().UnixMilli() },
	}
}

// withClock returns a copy of the aggregator with a custom clock (for testing).
func (a *Aggregator) withClock(now func() int64) *Aggregator {
	return &Aggregator{store: a.store, now: now}
}

// DenialRate computes the ratio of denied actions to total actions in a time window.
// Returns a float64 between 0.0 and 1.0. If no actions exist, returns 0.0.
func (a *Aggregator) DenialRate(windowMinutes int) Signal {
	cutoff := a.now() - int64(windowMinutes)*60*1000
	actions := a.store.QueryByKindsSince(cutoff,
		event.ActionAllowed, event.ActionDenied)

	var denied int
	for _, e := range actions {
		if e.Kind == event.ActionDenied {
			denied++
		}
	}

	var rate float64
	if len(actions) > 0 {
		rate = float64(denied) / float64(len(actions))
	}

	return Signal{
		Kind:      DenialRate,
		Timestamp: a.now(),
		Value:     rate,
		Metadata: map[string]string{
			"window_minutes": itoa(windowMinutes),
			"total_actions":  itoa(len(actions)),
			"denied_actions": itoa(denied),
		},
	}
}

// EscalationLevel returns the current escalation state derived from
// the most recent StateChanged event in the store.
func (a *Aggregator) EscalationLevel() Signal {
	events := a.store.QueryByKind(event.StateChanged)
	level := monitor.Normal
	if len(events) > 0 {
		latest := events[len(events)-1]
		if to, ok := latest.Data["to"].(string); ok {
			level = monitor.ParseEscalationLevel(to)
		}
	}

	return Signal{
		Kind:      EscalationLevel,
		Timestamp: a.now(),
		Value:     level.String(),
	}
}

// InvariantHitRates returns a map of invariant name to hit count from
// InvariantViolation events.
func (a *Aggregator) InvariantHitRates() Signal {
	events := a.store.QueryByKind(event.InvariantViolation)
	counts := make(map[string]int)
	for _, e := range events {
		name := "unknown"
		if id, ok := e.Data["invariantId"].(string); ok {
			name = id
		}
		counts[name]++
	}

	return Signal{
		Kind:      InvariantHitRate,
		Timestamp: a.now(),
		Value:     counts,
	}
}

// BlastRadiusTrend returns the average blast radius score over a time window
// from BlastRadiusExceeded and ActionAllowed events that carry blast radius data.
func (a *Aggregator) BlastRadiusTrend(windowMinutes int) Signal {
	cutoff := a.now() - int64(windowMinutes)*60*1000
	// Look for events that carry blast radius scores
	allEvents := a.store.QuerySince(cutoff)

	var total float64
	var count int
	for _, e := range allEvents {
		if score, ok := extractFloat(e.Data, "blastRadius"); ok {
			total += score
			count++
		}
	}

	var avg float64
	if count > 0 {
		avg = total / float64(count)
	}

	return Signal{
		Kind:      BlastRadiusTrend,
		Timestamp: a.now(),
		Value:     avg,
		Metadata: map[string]string{
			"window_minutes": itoa(windowMinutes),
			"sample_count":   itoa(count),
		},
	}
}

// AgentCompliance returns a compliance score (0.0–1.0) for a specific agent.
// Compliance = allowed / (allowed + denied) for that agent. 1.0 means fully
// compliant. If the agent has no recorded actions, returns 1.0.
func (a *Aggregator) AgentCompliance(agentID string) Signal {
	actions := a.store.QueryByKinds(event.ActionAllowed, event.ActionDenied)

	var allowed, denied int
	for _, e := range actions {
		agent, _ := e.Data["agent"].(string)
		if agent != agentID {
			continue
		}
		if e.Kind == event.ActionAllowed {
			allowed++
		} else {
			denied++
		}
	}

	total := allowed + denied
	score := 1.0
	if total > 0 {
		score = float64(allowed) / float64(total)
	}

	return Signal{
		Kind:      AgentComplianceScore,
		Timestamp: a.now(),
		Value:     score,
		Metadata: map[string]string{
			"agent_id":        agentID,
			"allowed_actions": itoa(allowed),
			"denied_actions":  itoa(denied),
		},
	}
}

// ActionThroughput returns the actions per minute in the given time window.
func (a *Aggregator) ActionThroughput(windowMinutes int) Signal {
	cutoff := a.now() - int64(windowMinutes)*60*1000
	actions := a.store.QueryByKindsSince(cutoff,
		event.ActionAllowed, event.ActionDenied, event.ActionExecuted)

	var throughput float64
	if windowMinutes > 0 {
		throughput = float64(len(actions)) / float64(windowMinutes)
	}

	return Signal{
		Kind:      ActionThroughput,
		Timestamp: a.now(),
		Value:     throughput,
		Metadata: map[string]string{
			"window_minutes": itoa(windowMinutes),
			"total_actions":  itoa(len(actions)),
		},
	}
}

// violationEntry is a helper for sorting violations by count.
type violationEntry struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// TopViolations returns the most frequent violation types, limited to the top N.
func (a *Aggregator) TopViolations(limit int) Signal {
	// Gather from InvariantViolation, PolicyDenied, and ActionDenied events
	events := a.store.QueryByKinds(
		event.InvariantViolation, event.PolicyDenied, event.ActionDenied)

	counts := make(map[string]int)
	for _, e := range events {
		var reason string
		switch e.Kind {
		case event.InvariantViolation:
			reason, _ = e.Data["invariantId"].(string)
		case event.PolicyDenied:
			reason, _ = e.Data["reason"].(string)
		case event.ActionDenied:
			reason, _ = e.Data["reason"].(string)
		}
		if reason == "" {
			reason = string(e.Kind)
		}
		counts[reason]++
	}

	entries := make([]violationEntry, 0, len(counts))
	for name, count := range counts {
		entries = append(entries, violationEntry{Name: name, Count: count})
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Count > entries[j].Count
	})

	if limit > 0 && len(entries) > limit {
		entries = entries[:limit]
	}

	return Signal{
		Kind:      TopViolations,
		Timestamp: a.now(),
		Value:     entries,
	}
}

// SessionHealth returns an overall session health assessment.
// Green: denial rate < 10%, Yellow: denial rate < 30%, Red: denial rate >= 30%.
// If escalation is HIGH or LOCKDOWN, health is always red.
func (a *Aggregator) SessionHealth() Signal {
	// Use a 5-minute window for the denial rate assessment.
	denialSignal := a.DenialRate(5)
	rate, _ := denialSignal.Value.(float64)

	escalation := a.EscalationLevel()
	escLevel, _ := escalation.Value.(string)

	health := "green"
	if rate >= 0.3 || escLevel == "HIGH" || escLevel == "LOCKDOWN" {
		health = "red"
	} else if rate >= 0.1 || escLevel == "ELEVATED" {
		health = "yellow"
	}

	return Signal{
		Kind:      SessionHealth,
		Timestamp: a.now(),
		Value:     health,
		Metadata: map[string]string{
			"denial_rate":      ftoa(rate),
			"escalation_level": escLevel,
		},
	}
}

// Snapshot returns all signals at once — a full dashboard state.
func (a *Aggregator) Snapshot() []Signal {
	return []Signal{
		a.DenialRate(5),
		a.EscalationLevel(),
		a.InvariantHitRates(),
		a.BlastRadiusTrend(5),
		a.ActionThroughput(5),
		a.TopViolations(10),
		a.SessionHealth(),
	}
}

// --- helpers ---

func itoa(n int) string {
	return intToStr(n)
}

func intToStr(n int) string {
	if n == 0 {
		return "0"
	}
	neg := false
	if n < 0 {
		neg = true
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

func ftoa(f float64) string {
	// Simple float formatting: 4 decimal places.
	// Avoids importing strconv for this one use.
	neg := ""
	if f < 0 {
		neg = "-"
		f = -f
	}
	intPart := int(f)
	fracPart := int((f - float64(intPart)) * 10000)
	if fracPart < 0 {
		fracPart = -fracPart
	}
	// Pad fracPart to 4 digits
	frac := intToStr(fracPart)
	for len(frac) < 4 {
		frac = "0" + frac
	}
	return neg + intToStr(intPart) + "." + frac
}

func extractFloat(data map[string]any, key string) (float64, bool) {
	v, ok := data[key]
	if !ok {
		return 0, false
	}
	switch val := v.(type) {
	case float64:
		return val, true
	case float32:
		return float64(val), true
	case int:
		return float64(val), true
	case int64:
		return float64(val), true
	default:
		return 0, false
	}
}

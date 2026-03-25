package signals

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/AgentGuardHQ/agent-guard/go/internal/event"
)

// --- Helpers ---

func testStore() *event.Store {
	return event.NewStore()
}

func testAggregator(store *event.Store, nowMs int64) *Aggregator {
	agg := NewAggregator(store)
	return agg.withClock(func() int64 { return nowMs })
}

const baseTime int64 = 1000000 // base timestamp for tests

// --- DenialRate tests ---

func TestDenialRateZeroEvents(t *testing.T) {
	store := testStore()
	agg := testAggregator(store, baseTime)
	sig := agg.DenialRate(5)
	if sig.Kind != DenialRate {
		t.Errorf("expected kind %s, got %s", DenialRate, sig.Kind)
	}
	rate, ok := sig.Value.(float64)
	if !ok {
		t.Fatalf("expected float64 value, got %T", sig.Value)
	}
	if rate != 0.0 {
		t.Errorf("expected 0.0 denial rate with no events, got %f", rate)
	}
}

func TestDenialRateAllAllowed(t *testing.T) {
	store := testStore()
	for i := 0; i < 10; i++ {
		store.Append(event.NewEventAt(event.ActionAllowed, baseTime-60000, nil))
	}
	agg := testAggregator(store, baseTime)
	sig := agg.DenialRate(5)
	rate := sig.Value.(float64)
	if rate != 0.0 {
		t.Errorf("expected 0.0 denial rate when all allowed, got %f", rate)
	}
}

func TestDenialRateAllDenied(t *testing.T) {
	store := testStore()
	for i := 0; i < 5; i++ {
		store.Append(event.NewEventAt(event.ActionDenied, baseTime-60000, nil))
	}
	agg := testAggregator(store, baseTime)
	sig := agg.DenialRate(5)
	rate := sig.Value.(float64)
	if rate != 1.0 {
		t.Errorf("expected 1.0 denial rate when all denied, got %f", rate)
	}
}

func TestDenialRateMixed(t *testing.T) {
	store := testStore()
	// 3 allowed, 2 denied = 0.4 denial rate
	for i := 0; i < 3; i++ {
		store.Append(event.NewEventAt(event.ActionAllowed, baseTime-60000, nil))
	}
	for i := 0; i < 2; i++ {
		store.Append(event.NewEventAt(event.ActionDenied, baseTime-60000, nil))
	}
	agg := testAggregator(store, baseTime)
	sig := agg.DenialRate(5)
	rate := sig.Value.(float64)
	if rate != 0.4 {
		t.Errorf("expected 0.4 denial rate, got %f", rate)
	}
}

func TestDenialRateWindowFiltering(t *testing.T) {
	store := testStore()
	// Old events (outside 5-minute window)
	store.Append(event.NewEventAt(event.ActionDenied, baseTime-600000, nil))
	store.Append(event.NewEventAt(event.ActionDenied, baseTime-600000, nil))
	// Recent events (inside window)
	store.Append(event.NewEventAt(event.ActionAllowed, baseTime-60000, nil))
	store.Append(event.NewEventAt(event.ActionDenied, baseTime-60000, nil))

	agg := testAggregator(store, baseTime)
	sig := agg.DenialRate(5)
	rate := sig.Value.(float64)
	// Only 2 events in window: 1 allowed, 1 denied = 0.5
	if rate != 0.5 {
		t.Errorf("expected 0.5 denial rate in window, got %f", rate)
	}
}

// --- EscalationLevel tests ---

func TestEscalationLevelDefault(t *testing.T) {
	store := testStore()
	agg := testAggregator(store, baseTime)
	sig := agg.EscalationLevel()
	if sig.Kind != EscalationLevel {
		t.Errorf("expected kind %s, got %s", EscalationLevel, sig.Kind)
	}
	level, ok := sig.Value.(string)
	if !ok {
		t.Fatalf("expected string value, got %T", sig.Value)
	}
	if level != "NORMAL" {
		t.Errorf("expected NORMAL with no state changes, got %s", level)
	}
}

func TestEscalationLevelTracksStateChanges(t *testing.T) {
	store := testStore()
	store.Append(event.NewEventAt(event.StateChanged, baseTime-2000, map[string]any{
		"from": "NORMAL", "to": "ELEVATED",
	}))
	store.Append(event.NewEventAt(event.StateChanged, baseTime-1000, map[string]any{
		"from": "ELEVATED", "to": "HIGH",
	}))
	agg := testAggregator(store, baseTime)
	sig := agg.EscalationLevel()
	if sig.Value.(string) != "HIGH" {
		t.Errorf("expected HIGH from latest state change, got %s", sig.Value)
	}
}

func TestEscalationLevelLockdown(t *testing.T) {
	store := testStore()
	store.Append(event.NewEventAt(event.StateChanged, baseTime, map[string]any{
		"from": "HIGH", "to": "LOCKDOWN",
	}))
	agg := testAggregator(store, baseTime)
	sig := agg.EscalationLevel()
	if sig.Value.(string) != "LOCKDOWN" {
		t.Errorf("expected LOCKDOWN, got %s", sig.Value)
	}
}

// --- InvariantHitRates tests ---

func TestInvariantHitRatesEmpty(t *testing.T) {
	store := testStore()
	agg := testAggregator(store, baseTime)
	sig := agg.InvariantHitRates()
	if sig.Kind != InvariantHitRate {
		t.Errorf("expected kind %s, got %s", InvariantHitRate, sig.Kind)
	}
	counts, ok := sig.Value.(map[string]int)
	if !ok {
		t.Fatalf("expected map[string]int, got %T", sig.Value)
	}
	if len(counts) != 0 {
		t.Errorf("expected empty map, got %v", counts)
	}
}

func TestInvariantHitRatesMultipleTypes(t *testing.T) {
	store := testStore()
	store.Append(event.NewEventAt(event.InvariantViolation, baseTime, map[string]any{
		"invariantId": "secret-exposure",
	}))
	store.Append(event.NewEventAt(event.InvariantViolation, baseTime, map[string]any{
		"invariantId": "secret-exposure",
	}))
	store.Append(event.NewEventAt(event.InvariantViolation, baseTime, map[string]any{
		"invariantId": "protected-branch",
	}))
	store.Append(event.NewEventAt(event.InvariantViolation, baseTime, map[string]any{
		"invariantId": "blast-radius",
	}))

	agg := testAggregator(store, baseTime)
	sig := agg.InvariantHitRates()
	counts := sig.Value.(map[string]int)

	if counts["secret-exposure"] != 2 {
		t.Errorf("expected 2 secret-exposure hits, got %d", counts["secret-exposure"])
	}
	if counts["protected-branch"] != 1 {
		t.Errorf("expected 1 protected-branch hit, got %d", counts["protected-branch"])
	}
	if counts["blast-radius"] != 1 {
		t.Errorf("expected 1 blast-radius hit, got %d", counts["blast-radius"])
	}
}

// --- BlastRadiusTrend tests ---

func TestBlastRadiusTrendEmpty(t *testing.T) {
	store := testStore()
	agg := testAggregator(store, baseTime)
	sig := agg.BlastRadiusTrend(5)
	if sig.Kind != BlastRadiusTrend {
		t.Errorf("expected kind %s, got %s", BlastRadiusTrend, sig.Kind)
	}
	avg := sig.Value.(float64)
	if avg != 0.0 {
		t.Errorf("expected 0.0 with no events, got %f", avg)
	}
}

func TestBlastRadiusTrendCalculation(t *testing.T) {
	store := testStore()
	// Events with blast radius data
	store.Append(event.NewEventAt(event.ActionAllowed, baseTime-60000, map[string]any{
		"blastRadius": float64(5.0),
	}))
	store.Append(event.NewEventAt(event.ActionAllowed, baseTime-30000, map[string]any{
		"blastRadius": float64(15.0),
	}))
	store.Append(event.NewEventAt(event.BlastRadiusExceeded, baseTime-10000, map[string]any{
		"blastRadius": float64(25.0),
	}))

	agg := testAggregator(store, baseTime)
	sig := agg.BlastRadiusTrend(5)
	avg := sig.Value.(float64)
	// (5 + 15 + 25) / 3 = 15.0
	if avg != 15.0 {
		t.Errorf("expected 15.0 average blast radius, got %f", avg)
	}
}

// --- AgentCompliance tests ---

func TestAgentComplianceNoActions(t *testing.T) {
	store := testStore()
	agg := testAggregator(store, baseTime)
	sig := agg.AgentCompliance("agent-1")
	if sig.Kind != AgentComplianceScore {
		t.Errorf("expected kind %s, got %s", AgentComplianceScore, sig.Kind)
	}
	score := sig.Value.(float64)
	if score != 1.0 {
		t.Errorf("expected 1.0 compliance with no actions, got %f", score)
	}
}

func TestAgentComplianceMixed(t *testing.T) {
	store := testStore()
	// Agent-1: 3 allowed, 1 denied = 0.75
	store.Append(event.NewEventAt(event.ActionAllowed, baseTime, map[string]any{"agent": "agent-1"}))
	store.Append(event.NewEventAt(event.ActionAllowed, baseTime, map[string]any{"agent": "agent-1"}))
	store.Append(event.NewEventAt(event.ActionAllowed, baseTime, map[string]any{"agent": "agent-1"}))
	store.Append(event.NewEventAt(event.ActionDenied, baseTime, map[string]any{"agent": "agent-1"}))
	// Agent-2 events should not affect agent-1
	store.Append(event.NewEventAt(event.ActionDenied, baseTime, map[string]any{"agent": "agent-2"}))

	agg := testAggregator(store, baseTime)
	sig := agg.AgentCompliance("agent-1")
	score := sig.Value.(float64)
	if score != 0.75 {
		t.Errorf("expected 0.75 compliance, got %f", score)
	}
}

func TestAgentComplianceFullyCompliant(t *testing.T) {
	store := testStore()
	store.Append(event.NewEventAt(event.ActionAllowed, baseTime, map[string]any{"agent": "good-agent"}))
	store.Append(event.NewEventAt(event.ActionAllowed, baseTime, map[string]any{"agent": "good-agent"}))

	agg := testAggregator(store, baseTime)
	sig := agg.AgentCompliance("good-agent")
	score := sig.Value.(float64)
	if score != 1.0 {
		t.Errorf("expected 1.0 compliance, got %f", score)
	}
}

// --- ActionThroughput tests ---

func TestActionThroughputEmpty(t *testing.T) {
	store := testStore()
	agg := testAggregator(store, baseTime)
	sig := agg.ActionThroughput(5)
	if sig.Kind != ActionThroughput {
		t.Errorf("expected kind %s, got %s", ActionThroughput, sig.Kind)
	}
	throughput := sig.Value.(float64)
	if throughput != 0.0 {
		t.Errorf("expected 0.0 throughput with no events, got %f", throughput)
	}
}

func TestActionThroughputCalculation(t *testing.T) {
	store := testStore()
	// 10 actions in a 5-minute window = 2 actions/minute
	for i := 0; i < 10; i++ {
		store.Append(event.NewEventAt(event.ActionAllowed, baseTime-60000, nil))
	}
	agg := testAggregator(store, baseTime)
	sig := agg.ActionThroughput(5)
	throughput := sig.Value.(float64)
	if throughput != 2.0 {
		t.Errorf("expected 2.0 actions/min, got %f", throughput)
	}
}

// --- TopViolations tests ---

func TestTopViolationsEmpty(t *testing.T) {
	store := testStore()
	agg := testAggregator(store, baseTime)
	sig := agg.TopViolations(5)
	if sig.Kind != TopViolations {
		t.Errorf("expected kind %s, got %s", TopViolations, sig.Kind)
	}
	entries, ok := sig.Value.([]violationEntry)
	if !ok {
		t.Fatalf("expected []violationEntry, got %T", sig.Value)
	}
	if len(entries) != 0 {
		t.Errorf("expected empty violations, got %d", len(entries))
	}
}

func TestTopViolationsSorted(t *testing.T) {
	store := testStore()
	// 3 invariant violations of type A, 1 of type B, 2 of type C
	for i := 0; i < 3; i++ {
		store.Append(event.NewEventAt(event.InvariantViolation, baseTime, map[string]any{
			"invariantId": "type-a",
		}))
	}
	store.Append(event.NewEventAt(event.InvariantViolation, baseTime, map[string]any{
		"invariantId": "type-b",
	}))
	for i := 0; i < 2; i++ {
		store.Append(event.NewEventAt(event.InvariantViolation, baseTime, map[string]any{
			"invariantId": "type-c",
		}))
	}

	agg := testAggregator(store, baseTime)
	sig := agg.TopViolations(10)
	entries := sig.Value.([]violationEntry)
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(entries))
	}
	// Should be sorted: type-a (3), type-c (2), type-b (1)
	if entries[0].Name != "type-a" || entries[0].Count != 3 {
		t.Errorf("expected type-a:3 first, got %s:%d", entries[0].Name, entries[0].Count)
	}
	if entries[1].Name != "type-c" || entries[1].Count != 2 {
		t.Errorf("expected type-c:2 second, got %s:%d", entries[1].Name, entries[1].Count)
	}
	if entries[2].Name != "type-b" || entries[2].Count != 1 {
		t.Errorf("expected type-b:1 third, got %s:%d", entries[2].Name, entries[2].Count)
	}
}

func TestTopViolationsLimited(t *testing.T) {
	store := testStore()
	for i := 0; i < 5; i++ {
		store.Append(event.NewEventAt(event.InvariantViolation, baseTime, map[string]any{
			"invariantId": "type-" + intToStr(i),
		}))
	}
	agg := testAggregator(store, baseTime)
	sig := agg.TopViolations(3)
	entries := sig.Value.([]violationEntry)
	if len(entries) != 3 {
		t.Errorf("expected 3 entries with limit, got %d", len(entries))
	}
}

// --- SessionHealth tests ---

func TestSessionHealthGreenNoEvents(t *testing.T) {
	store := testStore()
	agg := testAggregator(store, baseTime)
	sig := agg.SessionHealth()
	if sig.Kind != SessionHealth {
		t.Errorf("expected kind %s, got %s", SessionHealth, sig.Kind)
	}
	health := sig.Value.(string)
	if health != "green" {
		t.Errorf("expected green with no events, got %s", health)
	}
}

func TestSessionHealthGreenLowDenialRate(t *testing.T) {
	store := testStore()
	// 1 denied, 19 allowed = 5% denial rate < 10% threshold
	store.Append(event.NewEventAt(event.ActionDenied, baseTime-60000, nil))
	for i := 0; i < 19; i++ {
		store.Append(event.NewEventAt(event.ActionAllowed, baseTime-60000, nil))
	}
	agg := testAggregator(store, baseTime)
	sig := agg.SessionHealth()
	if sig.Value.(string) != "green" {
		t.Errorf("expected green at 5%% denial rate, got %s", sig.Value)
	}
}

func TestSessionHealthYellowModerateDenialRate(t *testing.T) {
	store := testStore()
	// 2 denied, 8 allowed = 20% denial rate (>= 10%, < 30%)
	for i := 0; i < 2; i++ {
		store.Append(event.NewEventAt(event.ActionDenied, baseTime-60000, nil))
	}
	for i := 0; i < 8; i++ {
		store.Append(event.NewEventAt(event.ActionAllowed, baseTime-60000, nil))
	}
	agg := testAggregator(store, baseTime)
	sig := agg.SessionHealth()
	if sig.Value.(string) != "yellow" {
		t.Errorf("expected yellow at 20%% denial rate, got %s", sig.Value)
	}
}

func TestSessionHealthRedHighDenialRate(t *testing.T) {
	store := testStore()
	// 4 denied, 6 allowed = 40% denial rate (>= 30%)
	for i := 0; i < 4; i++ {
		store.Append(event.NewEventAt(event.ActionDenied, baseTime-60000, nil))
	}
	for i := 0; i < 6; i++ {
		store.Append(event.NewEventAt(event.ActionAllowed, baseTime-60000, nil))
	}
	agg := testAggregator(store, baseTime)
	sig := agg.SessionHealth()
	if sig.Value.(string) != "red" {
		t.Errorf("expected red at 40%% denial rate, got %s", sig.Value)
	}
}

func TestSessionHealthRedFromEscalation(t *testing.T) {
	store := testStore()
	// Low denial rate but HIGH escalation → red
	store.Append(event.NewEventAt(event.ActionAllowed, baseTime-60000, nil))
	store.Append(event.NewEventAt(event.StateChanged, baseTime-1000, map[string]any{
		"from": "NORMAL", "to": "HIGH",
	}))
	agg := testAggregator(store, baseTime)
	sig := agg.SessionHealth()
	if sig.Value.(string) != "red" {
		t.Errorf("expected red with HIGH escalation, got %s", sig.Value)
	}
}

func TestSessionHealthYellowFromEscalation(t *testing.T) {
	store := testStore()
	// Low denial rate but ELEVATED escalation → yellow
	store.Append(event.NewEventAt(event.ActionAllowed, baseTime-60000, nil))
	store.Append(event.NewEventAt(event.StateChanged, baseTime-1000, map[string]any{
		"from": "NORMAL", "to": "ELEVATED",
	}))
	agg := testAggregator(store, baseTime)
	sig := agg.SessionHealth()
	if sig.Value.(string) != "yellow" {
		t.Errorf("expected yellow with ELEVATED escalation, got %s", sig.Value)
	}
}

func TestSessionHealthRedFromLockdown(t *testing.T) {
	store := testStore()
	store.Append(event.NewEventAt(event.StateChanged, baseTime-1000, map[string]any{
		"from": "HIGH", "to": "LOCKDOWN",
	}))
	agg := testAggregator(store, baseTime)
	sig := agg.SessionHealth()
	if sig.Value.(string) != "red" {
		t.Errorf("expected red with LOCKDOWN escalation, got %s", sig.Value)
	}
}

// --- Snapshot tests ---

func TestSnapshotReturnsAllSignals(t *testing.T) {
	store := testStore()
	agg := testAggregator(store, baseTime)
	snapshot := agg.Snapshot()

	expectedKinds := map[string]bool{
		DenialRate:       false,
		EscalationLevel:  false,
		InvariantHitRate: false,
		BlastRadiusTrend: false,
		ActionThroughput: false,
		TopViolations:    false,
		SessionHealth:    false,
	}

	for _, sig := range snapshot {
		if _, ok := expectedKinds[sig.Kind]; ok {
			expectedKinds[sig.Kind] = true
		}
	}

	for kind, found := range expectedKinds {
		if !found {
			t.Errorf("snapshot missing signal kind: %s", kind)
		}
	}
}

func TestSnapshotLength(t *testing.T) {
	store := testStore()
	agg := testAggregator(store, baseTime)
	snapshot := agg.Snapshot()
	if len(snapshot) != 7 {
		t.Errorf("expected 7 signals in snapshot, got %d", len(snapshot))
	}
}

// --- HTTP Handler tests ---

func TestHandlerSnapshotEndpoint(t *testing.T) {
	store := testStore()
	store.Append(event.NewEventAt(event.ActionAllowed, baseTime-60000, nil))
	store.Append(event.NewEventAt(event.ActionDenied, baseTime-60000, nil))

	agg := testAggregator(store, baseTime)
	handler := NewHandler(agg)

	req := httptest.NewRequest(http.MethodGet, "/signals", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}

	ct := rr.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("expected application/json, got %s", ct)
	}

	body, _ := io.ReadAll(rr.Body)
	var signals []Signal
	if err := json.Unmarshal(body, &signals); err != nil {
		t.Fatalf("failed to parse JSON: %v\nbody: %s", err, string(body))
	}

	if len(signals) != 7 {
		t.Errorf("expected 7 signals from snapshot, got %d", len(signals))
	}
}

func TestHandlerSpecificSignal(t *testing.T) {
	store := testStore()
	agg := testAggregator(store, baseTime)
	handler := NewHandler(agg)

	req := httptest.NewRequest(http.MethodGet, "/signals/"+SessionHealth, nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}

	body, _ := io.ReadAll(rr.Body)
	var sig Signal
	if err := json.Unmarshal(body, &sig); err != nil {
		t.Fatalf("failed to parse JSON: %v\nbody: %s", err, string(body))
	}

	if sig.Kind != SessionHealth {
		t.Errorf("expected kind %s, got %s", SessionHealth, sig.Kind)
	}
}

func TestHandlerUnknownSignal(t *testing.T) {
	store := testStore()
	agg := testAggregator(store, baseTime)
	handler := NewHandler(agg)

	req := httptest.NewRequest(http.MethodGet, "/signals/governance.nonexistent", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rr.Code)
	}
}

func TestHandlerMethodNotAllowed(t *testing.T) {
	store := testStore()
	agg := testAggregator(store, baseTime)
	handler := NewHandler(agg)

	req := httptest.NewRequest(http.MethodPost, "/signals", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", rr.Code)
	}
}

func TestHandlerDenialRateSignal(t *testing.T) {
	store := testStore()
	store.Append(event.NewEventAt(event.ActionDenied, baseTime-60000, nil))
	store.Append(event.NewEventAt(event.ActionAllowed, baseTime-60000, nil))

	agg := testAggregator(store, baseTime)
	handler := NewHandler(agg)

	req := httptest.NewRequest(http.MethodGet, "/signals/"+DenialRate, nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}

	body, _ := io.ReadAll(rr.Body)
	var sig Signal
	if err := json.Unmarshal(body, &sig); err != nil {
		t.Fatalf("failed to parse JSON: %v", err)
	}

	if sig.Kind != DenialRate {
		t.Errorf("expected kind %s, got %s", DenialRate, sig.Kind)
	}
}

func TestHandlerAgentComplianceRequiresParam(t *testing.T) {
	store := testStore()
	agg := testAggregator(store, baseTime)
	handler := NewHandler(agg)

	req := httptest.NewRequest(http.MethodGet, "/signals/"+AgentComplianceScore, nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for agent_compliance without param, got %d", rr.Code)
	}
}

func TestHandlerResponseIsValidJSON(t *testing.T) {
	store := testStore()
	// Populate with diverse events
	store.Append(event.NewEventAt(event.ActionAllowed, baseTime-60000, map[string]any{
		"agent": "bot-1", "blastRadius": float64(3.0),
	}))
	store.Append(event.NewEventAt(event.ActionDenied, baseTime-30000, map[string]any{
		"agent": "bot-1", "reason": "policy violation",
	}))
	store.Append(event.NewEventAt(event.InvariantViolation, baseTime-20000, map[string]any{
		"invariantId": "secret-exposure",
	}))
	store.Append(event.NewEventAt(event.StateChanged, baseTime-10000, map[string]any{
		"from": "NORMAL", "to": "ELEVATED",
	}))

	agg := testAggregator(store, baseTime)
	handler := NewHandler(agg)

	req := httptest.NewRequest(http.MethodGet, "/signals", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	body, _ := io.ReadAll(rr.Body)

	// Verify it's valid JSON
	if !json.Valid(body) {
		t.Errorf("response is not valid JSON: %s", string(body))
	}

	// Verify it's parseable as an array
	var signals []json.RawMessage
	if err := json.Unmarshal(body, &signals); err != nil {
		t.Fatalf("failed to unmarshal as array: %v", err)
	}
	if len(signals) == 0 {
		t.Error("expected non-empty signals array")
	}
}

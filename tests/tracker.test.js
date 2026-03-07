import assert from 'node:assert';
import { test, suite } from './run.js';

// Mock localStorage for Node.js
const store = {};
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem(key) { return store[key] ?? null; },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; },
    clear() { for (const k in store) delete store[k]; },
  };
}

// Fresh import each time we need to reset module state is hard with ES modules,
// so we test what we can with the singleton pattern.
const { initTracker, logEvent, getEvents } =
  await import('../game/evolution/tracker.js');

suite('Dev Activity Tracker (game/evolution/tracker.js)', () => {
  test('initTracker loads without error when localStorage is empty', () => {
    localStorage.clear();
    assert.doesNotThrow(() => initTracker());
  });

  test('getEvents returns all event types with default values', () => {
    localStorage.clear();
    initTracker();
    const events = getEvents();
    const expectedKeys = [
      'commits', 'prs_merged', 'bugs_fixed', 'tests_passing', 'refactors',
      'code_reviews', 'conflicts_resolved', 'ci_passes', 'deploys', 'docs_written'
    ];
    for (const key of expectedKeys) {
      assert.ok(key in events, `Missing event type: ${key}`);
      assert.strictEqual(typeof events[key], 'number');
    }
  });

  test('getEvents returns a copy, not a reference', () => {
    localStorage.clear();
    initTracker();
    const events1 = getEvents();
    events1.commits = 9999;
    const events2 = getEvents();
    assert.notStrictEqual(events2.commits, 9999);
  });

  test('logEvent increments a valid event type', () => {
    localStorage.clear();
    initTracker();
    const before = getEvents().commits;
    logEvent('commits');
    const after = getEvents().commits;
    assert.strictEqual(after, before + 1);
  });

  test('logEvent returns true for valid event types', () => {
    localStorage.clear();
    initTracker();
    assert.strictEqual(logEvent('commits'), true);
    assert.strictEqual(logEvent('prs_merged'), true);
    assert.strictEqual(logEvent('bugs_fixed'), true);
  });

  test('logEvent returns false for invalid event types', () => {
    localStorage.clear();
    initTracker();
    assert.strictEqual(logEvent('nonexistent_event'), false);
    assert.strictEqual(logEvent(''), false);
  });

  test('logEvent persists to localStorage', () => {
    localStorage.clear();
    initTracker();
    logEvent('commits');
    logEvent('commits');
    const stored = JSON.parse(localStorage.getItem('bugmon_dev_events'));
    assert.ok(stored.commits >= 2);
  });

  test('initTracker restores previously saved events', () => {
    localStorage.clear();
    localStorage.setItem('bugmon_dev_events', JSON.stringify({
      commits: 5, prs_merged: 3, bugs_fixed: 0, tests_passing: 0,
      refactors: 0, code_reviews: 0, conflicts_resolved: 0,
      ci_passes: 0, deploys: 0, docs_written: 0
    }));
    initTracker();
    const events = getEvents();
    assert.strictEqual(events.commits, 5);
    assert.strictEqual(events.prs_merged, 3);
  });

  test('initTracker handles corrupted localStorage data', () => {
    localStorage.clear();
    localStorage.setItem('bugmon_dev_events', 'not valid json!!');
    assert.doesNotThrow(() => initTracker());
    const events = getEvents();
    assert.strictEqual(events.commits, 0);
  });

  test('initTracker fills in missing keys from saved data', () => {
    localStorage.clear();
    localStorage.setItem('bugmon_dev_events', JSON.stringify({ commits: 10 }));
    initTracker();
    const events = getEvents();
    assert.strictEqual(events.commits, 10);
    assert.strictEqual(events.prs_merged, 0);
  });

  test('multiple logEvent calls accumulate', () => {
    localStorage.clear();
    initTracker();
    for (let i = 0; i < 5; i++) logEvent('bugs_fixed');
    assert.strictEqual(getEvents().bugs_fixed, 5);
  });
});

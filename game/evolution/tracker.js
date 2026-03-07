// Dev Activity Tracker - tracks git/developer events for evolution triggers

const STORAGE_KEY = 'bugmon_dev_events';

const defaultEvents = {
  commits: 0, prs_merged: 0, bugs_fixed: 0, tests_passing: 0, refactors: 0,
  code_reviews: 0, conflicts_resolved: 0, ci_passes: 0, deploys: 0, docs_written: 0,
  lint_fixes: 0, type_errors_fixed: 0, security_fixes: 0
};

let events = { ...defaultEvents };

export function initTracker() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { events = { ...defaultEvents, ...JSON.parse(saved) }; }
    catch { events = { ...defaultEvents }; }
  }
}

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); }

export function logEvent(eventType) {
  if (!(eventType in events)) return false;
  events[eventType]++;
  save();
  return true;
}

export function getEvents() { return { ...events }; }

export async function importFromFile() {
  try {
    const res = await fetch('.events.json');
    if (!res.ok) return false;
    const data = await res.json();
    let imported = false;
    for (const key of Object.keys(defaultEvents)) {
      if (data[key] !== undefined && data[key] > events[key]) {
        events[key] = data[key];
        imported = true;
      }
    }
    if (imported) save();
    return imported;
  } catch { return false; }
}

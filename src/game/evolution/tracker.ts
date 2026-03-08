// Dev Activity Tracker — tracks git/developer events for evolution triggers
//
// TODO(roadmap): Phase 5 — Achievement system (first boss, perfect run, 100% Grimoire, etc.)
// TODO(roadmap): Phase 5 — Dev-activity progression via git hooks (commits, PRs, bug fixes)

const STORAGE_KEY = 'bugmon_dev_events';

export interface DevEvents {
  commits: number;
  prs_merged: number;
  bugs_fixed: number;
  tests_passing: number;
  refactors: number;
  code_reviews: number;
  conflicts_resolved: number;
  ci_passes: number;
  deploys: number;
  docs_written: number;
  lint_fixes: number;
  type_errors_fixed: number;
  security_fixes: number;
  [key: string]: number;
}

const defaultEvents: DevEvents = {
  commits: 0,
  prs_merged: 0,
  bugs_fixed: 0,
  tests_passing: 0,
  refactors: 0,
  code_reviews: 0,
  conflicts_resolved: 0,
  ci_passes: 0,
  deploys: 0,
  docs_written: 0,
  lint_fixes: 0,
  type_errors_fixed: 0,
  security_fixes: 0,
};

let events: DevEvents = { ...defaultEvents };

export function initTracker(): void {
  if (typeof localStorage === 'undefined') return;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as Record<string, number>;
      events = { ...defaultEvents };
      for (const key of Object.keys(parsed)) {
        if (key in events) events[key] = parsed[key];
      }
    } catch {
      events = { ...defaultEvents };
    }
  }
}

function save(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

export function logEvent(eventType: string): boolean {
  if (!(eventType in events)) return false;
  events[eventType]++;
  save();
  return true;
}

export function getEvents(): DevEvents {
  return { ...events };
}

export async function importFromFile(): Promise<boolean> {
  try {
    const res = await fetch('.events.json');
    if (!res.ok) return false;
    const data = (await res.json()) as Record<string, number>;
    let imported = false;
    for (const key of Object.keys(defaultEvents)) {
      if (data[key] !== undefined && data[key] > events[key]) {
        events[key] = data[key];
        imported = true;
      }
    }
    if (imported) save();
    return imported;
  } catch {
    return false;
  }
}

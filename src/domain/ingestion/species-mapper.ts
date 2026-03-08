// Species mapper — maps classified errors to BugMon species.
// Final stage of the ingestion pipeline.
// Re-exports mapping logic from core modules.

export { bugEventToMonster } from '../../core/bug-event.js';
export { matchMonster, getAllMonsters } from '../../core/matcher.js';

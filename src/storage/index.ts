// Storage module re-exports.

export type { StorageBackend, StorageConfig } from './types.js';
export {
  DEFAULT_BASE_DIR,
  DEFAULT_DB_FILENAME,
  DEFAULT_SQLITE_DIR,
  DEFAULT_SQLITE_DB_PATH,
} from './types.js';
export { runMigrations, getSchemaVersion } from './migrations.js';
export {
  createSqliteEventStore,
  listRunIds,
  getLatestRunId,
  loadRunEvents,
} from './sqlite-store.js';
export { createSqliteEventSink, createSqliteDecisionSink } from './sqlite-sink.js';
export type {
  SessionTracker,
  SessionRow,
  SessionStartData,
  SessionEndData,
} from './sqlite-session.js';
export {
  createSessionTracker,
  insertSession,
  updateSessionEnd,
  getSession,
  listSessions,
} from './sqlite-session.js';
export {
  aggregateViolationsSqlite,
  loadAllEventsSqlite,
  queryTopDeniedActions,
  queryViolationRateOverTime,
  querySessionStats,
} from './sqlite-analytics.js';
export type {
  TopDeniedAction,
  ViolationTimeBucket,
  SessionSummary,
  TimeBucketGranularity,
} from './sqlite-analytics.js';
export { createFirestoreEventSink, createFirestoreDecisionSink } from './firestore-sink.js';
export {
  createFirestoreEventStore,
  listRunIdsFirestore,
  getLatestRunIdFirestore,
  loadRunEventsFirestore,
} from './firestore-store.js';
export { aggregateViolationsFirestore, loadAllEventsFirestore } from './firestore-analytics.js';
export type { StorageBundle } from './factory.js';
export { createStorageBundle, resolveStorageConfig, resolveSqlitePath } from './factory.js';

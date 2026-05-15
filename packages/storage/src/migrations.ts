/** Initial schema. SQLite FTS5 (`notes_fts`) can be added later without rewriting document JSON. */
export const INITIAL_MIGRATION_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived', 'trashed')),
  title TEXT NOT NULL DEFAULT '',
  written_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  local_version INTEGER NOT NULL DEFAULT 1,
  remote_version INTEGER NOT NULL DEFAULT 0,
  device_id TEXT NOT NULL DEFAULT '',
  last_synced_at TEXT,
  sync_state TEXT NOT NULL DEFAULT 'local_only',
  structured_draft_json TEXT NOT NULL,
  tiptap_json TEXT NOT NULL,
  plain_text TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS note_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  note_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  structured_draft_json TEXT NOT NULL,
  tiptap_json TEXT NOT NULL,
  local_version INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_note_revisions_note_time
  ON note_revisions (note_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reference_index (
  id TEXT NOT NULL,
  note_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  PRIMARY KEY (note_id, id)
);

CREATE TABLE IF NOT EXISTS citation_index (
  id TEXT NOT NULL,
  note_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  PRIMARY KEY (note_id, id)
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id TEXT PRIMARY KEY NOT NULL,
  note_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  local_payload TEXT NOT NULL,
  remote_payload TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`

export function splitSqlStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
}

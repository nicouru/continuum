import type {
  StructuredNoteDraft,
} from "@continuum/core"
import {
  excerptFromPlainText,
  extractStructuredDraftPlainText,
  formatDateInput,
  normalizeStructuredNoteDraft,
} from "@continuum/core"
import type Database from "better-sqlite3"
import { INITIAL_MIGRATION_SQL, splitSqlStatements } from "./migrations"
import type {
  EmergencyDraftPayload,
  NoteDbStatus,
  NoteFull,
  NoteMeta,
  NoteSyncState,
  SaveNoteInput,
  SyncConflictRecord,
  SyncStatusSummary,
} from "./types"

export function migrateBetterSqlite(db: Database.Database) {
  db.pragma("foreign_keys = ON")
  for (const statement of splitSqlStatements(INITIAL_MIGRATION_SQL)) {
    db.exec(`${statement};`)
  }
  db.exec(`UPDATE notes SET sync_state = 'error' WHERE sync_state = 'syncing';`)
}

function nowIso() {
  return new Date().toISOString()
}

function shouldQueueSync(state: NoteSyncState) {
  return state === "dirty" || state === "error" || state === "offline"
}

function syncQueuePayload(noteId: string, localVersion: number) {
  return JSON.stringify({ localVersion, noteId, queuedAt: nowIso() })
}

function retryDelaySeconds(attemptCount: number) {
  if (attemptCount <= 0) {
    return 0
  }
  if (attemptCount === 1) {
    return 10
  }
  if (attemptCount === 2) {
    return 30
  }
  if (attemptCount === 3) {
    return 60
  }
  if (attemptCount === 4) {
    return 120
  }
  return 300
}

function parseJsonDraft(raw: string): StructuredNoteDraft {
  return normalizeStructuredNoteDraft(JSON.parse(raw) as StructuredNoteDraft)
}

export function createBetterSqlNoteRepository(db: Database.Database) {
  migrateBetterSqlite(db)

  const selectFull = db.prepare(`
    SELECT id, slug, status, title, written_at AS writtenAt, created_at AS createdAt,
           updated_at AS updatedAt, deleted_at AS deletedAt, excerpt,
           local_version AS localVersion, remote_version AS remoteVersion,
           sync_state AS syncState, last_synced_at AS lastSyncedAt,
           structured_draft_json AS structuredDraftJson,
           tiptap_json AS tiptapJson, plain_text AS plainText, device_id AS deviceId
    FROM notes
    WHERE id = ?
  `)

  const insertRevision = db.prepare(`
    INSERT INTO note_revisions (id, note_id, created_at, structured_draft_json, tiptap_json, local_version)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  const deleteOldRevisions = db.prepare(`
    DELETE FROM note_revisions
    WHERE note_id = ?
      AND id NOT IN (
        SELECT id FROM note_revisions
        WHERE note_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      )
  `)

  const upsertNote = db.prepare(`
    INSERT INTO notes (
      id, slug, status, title, written_at, created_at, updated_at, deleted_at,
      local_version, remote_version, device_id, last_synced_at, sync_state,
      structured_draft_json, tiptap_json, plain_text, excerpt
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      slug = excluded.slug,
      status = excluded.status,
      title = excluded.title,
      written_at = excluded.written_at,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at,
      local_version = excluded.local_version,
      remote_version = excluded.remote_version,
      device_id = excluded.device_id,
      last_synced_at = excluded.last_synced_at,
      sync_state = excluded.sync_state,
      structured_draft_json = excluded.structured_draft_json,
      tiptap_json = excluded.tiptap_json,
      plain_text = excluded.plain_text,
      excerpt = excluded.excerpt
  `)

  const deleteRefs = db.prepare(`DELETE FROM reference_index WHERE note_id = ?`)
  const insertRef = db.prepare(`
    INSERT INTO reference_index (id, note_id, payload) VALUES (?, ?, ?)
  `)
  const deleteCites = db.prepare(`DELETE FROM citation_index WHERE note_id = ?`)
  const insertCite = db.prepare(`
    INSERT INTO citation_index (id, note_id, payload) VALUES (?, ?, ?)
  `)

  function rebuildIndexes(noteId: string, draft: StructuredNoteDraft) {
    deleteRefs.run(noteId)
    deleteCites.run(noteId)
    for (const reference of draft.references) {
      insertRef.run(reference.id, noteId, JSON.stringify(reference))
    }
    for (const citation of draft.citations) {
      insertCite.run(citation.id, noteId, JSON.stringify(citation))
    }
  }

  function enqueueSync(noteId: string, localVersion: number) {
    db.prepare(`DELETE FROM sync_queue WHERE note_id = ?`).run(noteId)
    db.prepare(`
      INSERT INTO sync_queue (note_id, payload, created_at, attempt_count, last_error)
      VALUES (?, ?, ?, 0, NULL)
    `).run(noteId, syncQueuePayload(noteId, localVersion), nowIso())
  }

  function clearSyncQueue(noteId: string) {
    db.prepare(`DELETE FROM sync_queue WHERE note_id = ?`).run(noteId)
  }

  function metaRow(row: Record<string, unknown>): NoteMeta {
    return {
      id: String(row.id),
      slug: String(row.slug),
      status: row.status as NoteDbStatus,
      title: String(row.title ?? ""),
      writtenAt: String(row.writtenAt),
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
      deletedAt: row.deletedAt ? String(row.deletedAt) : null,
      excerpt: String(row.excerpt ?? ""),
      localVersion: Number(row.localVersion ?? 0),
      remoteVersion: Number(row.remoteVersion ?? 0),
      syncState: row.syncState as NoteSyncState,
      lastSyncedAt: row.lastSyncedAt ? String(row.lastSyncedAt) : null,
    }
  }

  function fullRow(row: Record<string, unknown>): NoteFull {
    return {
      ...metaRow(row),
      structuredDraft: parseJsonDraft(String(row.structuredDraftJson)),
      tiptapJson: JSON.parse(String(row.tiptapJson)),
      plainText: String(row.plainText ?? ""),
      deviceId: String(row.deviceId ?? ""),
    }
  }

  return {
    db,

    listDirtyIds(): string[] {
      const rows = db
        .prepare(
          `
          SELECT DISTINCT n.id
          FROM notes n
          LEFT JOIN sync_queue q ON q.note_id = n.id
          WHERE n.sync_state IN ('dirty', 'error', 'offline')
            AND (
              q.id IS NULL
              OR q.attempt_count <= 0
              OR (
                CAST(strftime('%s', 'now') AS INTEGER) - CAST(strftime('%s', q.created_at) AS INTEGER)
              ) >= CASE
                WHEN q.attempt_count = 1 THEN 10
                WHEN q.attempt_count = 2 THEN 30
                WHEN q.attempt_count = 3 THEN 60
                WHEN q.attempt_count = 4 THEN 120
                ELSE 300
              END
            )
          ORDER BY COALESCE(q.created_at, n.updated_at) ASC
        `,
        )
        .all() as { id: string }[]
      return rows.map((row) => String(row.id))
    },

    getSyncStatus(): SyncStatusSummary {
      const pendingRow = db
        .prepare(
          `SELECT COUNT(*) AS count FROM notes WHERE sync_state IN ('dirty', 'error', 'offline')`,
        )
        .get() as { count: number }
      const errorRow = db
        .prepare(`SELECT COUNT(*) AS count FROM notes WHERE sync_state = 'error'`)
        .get() as { count: number }
      const conflictRow = db
        .prepare(
          `SELECT COUNT(*) AS count FROM sync_conflicts WHERE resolved = 0`,
        )
        .get() as { count: number }
      const queueRows = db
        .prepare(
          `
          SELECT created_at AS createdAt,
                 attempt_count AS attemptCount,
                 last_error AS lastError
          FROM sync_queue
          ORDER BY created_at ASC
        `,
        )
        .all() as Array<{
        attemptCount: number
        createdAt: string
        lastError: string | null
      }>
      const nextRetryAt = getNextRetryAt(queueRows)
      const lastError =
        queueRows
          .slice()
          .reverse()
          .find((row) => row.lastError)?.lastError ?? null

      return {
        conflictCount: Number(conflictRow.count ?? 0),
        errorCount: Number(errorRow.count ?? 0),
        lastError,
        nextRetryAt,
        pendingCount: Number(pendingRow.count ?? 0),
      }
    },

    ensureDeviceId(): string {
      const row = db
        .prepare(`SELECT value FROM app_metadata WHERE key = 'device_id'`)
        .get() as { value: string } | undefined
      if (row?.value) {
        return row.value
      }
      const id = crypto.randomUUID()
      db.prepare(
        `INSERT INTO app_metadata (key, value) VALUES ('device_id', ?)`,
      ).run(id)
      return id
    },

    listNotesMeta(filter: { folder: "all" | "trash" }): NoteMeta[] {
      const sql =
        filter.folder === "trash"
          ? `SELECT id, slug, status, title, written_at AS writtenAt, created_at AS createdAt,
                  updated_at AS updatedAt, deleted_at AS deletedAt, excerpt,
                  local_version AS localVersion, remote_version AS remoteVersion,
                  sync_state AS syncState, last_synced_at AS lastSyncedAt
             FROM notes WHERE status = 'trashed' ORDER BY created_at DESC`
          : `SELECT id, slug, status, title, written_at AS writtenAt, created_at AS createdAt,
                  updated_at AS updatedAt, deleted_at AS deletedAt, excerpt,
                  local_version AS localVersion, remote_version AS remoteVersion,
                  sync_state AS syncState, last_synced_at AS lastSyncedAt
             FROM notes WHERE status != 'trashed' ORDER BY created_at DESC`
      return db.prepare(sql).all().map((r) => metaRow(r as Record<string, unknown>))
    },

    getNoteById(id: string): NoteFull | null {
      const row = selectFull.get(id) as Record<string, unknown> | undefined
      return row ? fullRow(row) : null
    },

    saveNote(input: SaveNoteInput): NoteFull {
      const draft = normalizeStructuredNoteDraft(input.structuredDraft)
      const plain = extractStructuredDraftPlainText(draft)
      const excerpt = excerptFromPlainText(plain)
      const existing = selectFull.get(draft.id) as Record<string, unknown> | undefined

      const createdAt = existing ? String(existing.createdAt) : nowIso()
      const localVersion = existing
        ? Number(existing.localVersion ?? 1) + (input.bumpLocalVersion ? 1 : 0)
        : 1

      const nextSyncState: NoteSyncState =
        input.syncState ??
        (existing
          ? input.bumpLocalVersion
            ? "dirty"
            : (existing.syncState as NoteSyncState)
          : "local_only")

      const status: NoteDbStatus =
        input.statusOverride ?? (existing ? (existing.status as NoteDbStatus) : "draft")

      const slug =
        input.slug ??
        (existing ? String(existing.slug) : draft.id)

      const row = {
        id: draft.id,
        slug,
        status,
        title: draft.title,
        written_at: draft.writtenAt || formatDateInput(new Date()),
        created_at: createdAt,
        updated_at: nowIso(),
        deleted_at: existing?.deletedAt ? String(existing.deletedAt) : null,
        local_version: localVersion,
        remote_version: input.remoteVersion ?? (existing ? Number(existing.remoteVersion ?? 0) : 0),
        device_id: input.deviceId,
        last_synced_at: existing?.lastSyncedAt
          ? String(existing.lastSyncedAt)
          : null,
        sync_state: nextSyncState,
        structured_draft_json: JSON.stringify(draft),
        tiptap_json: JSON.stringify(input.tiptapJson),
        plain_text: plain,
        excerpt,
      }

      upsertNote.run([
        row.id,
        row.slug,
        row.status,
        row.title,
        row.written_at,
        row.created_at,
        row.updated_at,
        row.deleted_at,
        row.local_version,
        row.remote_version,
        row.device_id,
        row.last_synced_at,
        row.sync_state,
        row.structured_draft_json,
        row.tiptap_json,
        row.plain_text,
        row.excerpt,
      ])
      rebuildIndexes(draft.id, draft)
      if (shouldQueueSync(nextSyncState)) {
        enqueueSync(draft.id, localVersion)
      } else if (nextSyncState === "synced") {
        clearSyncQueue(draft.id)
      }

      const rowAfter = selectFull.get(draft.id) as Record<string, unknown> | undefined
      if (!rowAfter) {
        throw new Error("Failed to read note after save")
      }
      return fullRow(rowAfter)
    },

    appendRevision(noteId: string, cap = 80) {
      const row = selectFull.get(noteId) as Record<string, unknown> | undefined
      if (!row) {
        return
      }
      const note = fullRow(row)
      const id = crypto.randomUUID()
      insertRevision.run(
        id,
        noteId,
        nowIso(),
        JSON.stringify(note.structuredDraft),
        JSON.stringify(note.tiptapJson),
        note.localVersion,
      )
      deleteOldRevisions.run(noteId, noteId, cap)
    },

    moveToTrash(noteId: string) {
      const exists = selectFull.get(noteId)
      if (!exists) {
        return
      }
      db.prepare(
        `
        UPDATE notes
        SET status = 'trashed', deleted_at = ?, updated_at = ?, sync_state = 'dirty'
        WHERE id = ?
      `,
      ).run(nowIso(), nowIso(), noteId)
      const note = this.getNoteById(noteId)
      if (note) {
        enqueueSync(noteId, note.localVersion)
      }
    },

    restoreFromTrash(noteId: string) {
      db.prepare(
        `
        UPDATE notes
        SET status = 'draft', deleted_at = NULL, updated_at = ?, sync_state = 'dirty'
        WHERE id = ?
      `,
      ).run(nowIso(), noteId)
      const note = this.getNoteById(noteId)
      if (note) {
        enqueueSync(noteId, note.localVersion)
      }
    },

    applyRemoteSynced(input: {
      noteId: string
      remoteVersion: number
      structuredDraft?: StructuredNoteDraft
      tiptapJson?: unknown
    }) {
      const note = this.getNoteById(input.noteId)
      if (!note) {
        return
      }
      const draft = input.structuredDraft
        ? normalizeStructuredNoteDraft(input.structuredDraft)
        : note.structuredDraft
      const tiptap = input.tiptapJson ?? note.tiptapJson
      const plain = extractStructuredDraftPlainText(draft)
      const excerpt = excerptFromPlainText(plain)
      db.prepare(
        `
        UPDATE notes SET
          remote_version = ?,
          last_synced_at = ?,
          sync_state = 'synced',
          structured_draft_json = ?,
          tiptap_json = ?,
          plain_text = ?,
          excerpt = ?,
          updated_at = ?
        WHERE id = ?
      `,
      ).run(
        input.remoteVersion,
        nowIso(),
        JSON.stringify(draft),
        JSON.stringify(tiptap),
        plain,
        excerpt,
        nowIso(),
        input.noteId,
      )
      rebuildIndexes(input.noteId, draft)
      clearSyncQueue(input.noteId)
    },

    markSyncState(noteId: string, state: NoteSyncState) {
      db.prepare(`UPDATE notes SET sync_state = ?, updated_at = ? WHERE id = ?`).run(
        state,
        nowIso(),
        noteId,
      )
    },

    retrySyncNow() {
      db.prepare(
        `UPDATE sync_queue SET attempt_count = 0, created_at = ?, last_error = NULL`,
      ).run(nowIso())
    },

    recordSyncFailure(noteId: string, error: unknown) {
      const row = db
        .prepare(
          `SELECT MAX(attempt_count) AS attemptCount FROM sync_queue WHERE note_id = ?`,
        )
        .get(noteId) as { attemptCount: number | null } | undefined
      const attemptCount = Number(row?.attemptCount ?? 0) + 1
      db.prepare(`DELETE FROM sync_queue WHERE note_id = ?`).run(noteId)
      db.prepare(`
        INSERT INTO sync_queue (note_id, payload, created_at, attempt_count, last_error)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        noteId,
        JSON.stringify({ attemptCount, failedAt: nowIso(), noteId }),
        nowIso(),
        attemptCount,
        errorMessage(error),
      )
    },

    recordConflict(noteId: string, local: unknown, remote: unknown) {
      const id = crypto.randomUUID()
      db.prepare(
        `
        INSERT INTO sync_conflicts (id, note_id, created_at, local_payload, remote_payload, resolved)
        VALUES (?, ?, ?, ?, ?, 0)
      `,
      ).run(id, noteId, nowIso(), JSON.stringify(local), JSON.stringify(remote))
      clearSyncQueue(noteId)
      this.markSyncState(noteId, "conflict")
    },

    listOpenConflicts(): SyncConflictRecord[] {
      const rows = db
        .prepare(
          `
          SELECT id,
                 note_id AS noteId,
                 created_at AS createdAt,
                 local_payload AS localPayload,
                 remote_payload AS remotePayload
          FROM sync_conflicts
          WHERE resolved = 0
          ORDER BY created_at DESC
        `,
        )
        .all() as Array<Record<string, unknown>>

      return rows.map((row) => ({
        createdAt: String(row.createdAt),
        id: String(row.id),
        localPayload: parseUnknownJson(row.localPayload),
        noteId: String(row.noteId),
        remotePayload: parseUnknownJson(row.remotePayload),
      }))
    },

    resolveConflictKeepLocal(noteId: string, remoteVersion: number) {
      const note = this.getNoteById(noteId)
      if (!note) {
        return
      }
      db.prepare(
        `
        UPDATE notes
        SET remote_version = ?, sync_state = 'dirty', updated_at = ?
        WHERE id = ?
      `,
      ).run(remoteVersion, nowIso(), noteId)
      db.prepare(
        `UPDATE sync_conflicts SET resolved = 1 WHERE note_id = ? AND resolved = 0`,
      ).run(noteId)
      enqueueSync(noteId, note.localVersion)
    },
  }
}

export type BetterSqlNoteRepository = ReturnType<typeof createBetterSqlNoteRepository>

export function emergencyIsNewer(
  emergency: EmergencyDraftPayload,
  noteUpdatedAtIso: string,
): boolean {
  const noteMs = Date.parse(noteUpdatedAtIso)
  return Number.isFinite(noteMs) && emergency.savedAtMs > noteMs
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function getNextRetryAt(
  rows: Array<{ attemptCount: number; createdAt: string }>,
): string | null {
  const candidates = rows
    .map((row) => {
      const createdMs = Date.parse(row.createdAt)
      if (!Number.isFinite(createdMs)) {
        return null
      }
      return new Date(createdMs + retryDelaySeconds(Number(row.attemptCount)) * 1000)
    })
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => left.getTime() - right.getTime())

  return candidates[0]?.toISOString() ?? null
}

function parseUnknownJson(value: unknown) {
  if (typeof value !== "string") {
    return value
  }
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

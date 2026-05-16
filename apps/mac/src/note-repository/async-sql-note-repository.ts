import type { StructuredNoteDraft } from "@continuum/core"
import {
  excerptFromPlainText,
  extractStructuredDraftPlainText,
  extractStructuredDraftVisiblePlainText,
  formatDateInput,
  normalizeStructuredNoteDraft,
} from "@continuum/core"
import {
  cloneStructuredDraftForLocalDuplicate,
  errorMessage,
  fullRow,
  getNextRetryAt,
  INITIAL_MIGRATION_SQL,
  metaRow,
  nowIso,
  parseUnknownJson,
  shouldQueueSync,
  splitSqlStatements,
  dollarizeQuestionMarks,
  syncQueuePayload,
} from "@continuum/storage"
import type {
  NoteDbStatus,
  NoteFull,
  NoteMeta,
  NoteSyncState,
  SaveNoteInput,
  SyncConflictRecord,
  SyncStatusSummary,
} from "@continuum/storage/types"

export type AsyncSqlDatabase = {
  execute: (sql: string, bind?: unknown[]) => Promise<unknown>
  select: <T extends Record<string, unknown>>(
    sql: string,
    bind?: unknown[],
  ) => Promise<T[]>
}

export async function migrateAsyncSql(db: AsyncSqlDatabase) {
  await db.execute("PRAGMA foreign_keys = ON")
  for (const statement of splitSqlStatements(INITIAL_MIGRATION_SQL)) {
    await db.execute(statement)
  }
  await db.execute(`UPDATE notes SET sync_state = 'error' WHERE sync_state = 'syncing'`)
}

const SELECT_FULL_SQL = `
SELECT id, slug, status, title, written_at AS writtenAt, created_at AS createdAt,
       updated_at AS updatedAt, deleted_at AS deletedAt, excerpt,
       local_version AS localVersion, remote_version AS remoteVersion,
       sync_state AS syncState, last_synced_at AS lastSyncedAt,
       structured_draft_json AS structuredDraftJson,
       tiptap_json AS tiptapJson, plain_text AS plainText, device_id AS deviceId
FROM notes
WHERE id = ?
`

const UPSERT_NOTE_SQL = `
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
`

export function createAsyncSqlNoteRepository(db: AsyncSqlDatabase) {
  async function fetchFull(id: string): Promise<Record<string, unknown> | undefined> {
    const rows = await db.select<Record<string, unknown>>(
      dollarizeQuestionMarks(SELECT_FULL_SQL),
      [id],
    )
    return rows[0]
  }

  async function rebuildIndexes(noteId: string, draft: StructuredNoteDraft) {
    await db.execute(
      dollarizeQuestionMarks(`DELETE FROM reference_index WHERE note_id = ?`),
      [noteId],
    )
    await db.execute(
      dollarizeQuestionMarks(`DELETE FROM citation_index WHERE note_id = ?`),
      [noteId],
    )
    for (const reference of draft.references) {
      await db.execute(
        dollarizeQuestionMarks(
          `INSERT INTO reference_index (id, note_id, payload) VALUES (?, ?, ?)`,
        ),
        [reference.id, noteId, JSON.stringify(reference)],
      )
    }
    for (const citation of draft.citations) {
      await db.execute(
        dollarizeQuestionMarks(
          `INSERT INTO citation_index (id, note_id, payload) VALUES (?, ?, ?)`,
        ),
        [citation.id, noteId, JSON.stringify(citation)],
      )
    }
  }

  async function enqueueSync(noteId: string, localVersion: number) {
    await db.execute(
      dollarizeQuestionMarks(`DELETE FROM sync_queue WHERE note_id = ?`),
      [noteId],
    )
    await db.execute(
      dollarizeQuestionMarks(`
        INSERT INTO sync_queue (note_id, payload, created_at, attempt_count, last_error)
        VALUES (?, ?, ?, 0, NULL)
      `),
      [noteId, syncQueuePayload(noteId, localVersion), nowIso()],
    )
  }

  async function clearSyncQueue(noteId: string) {
    await db.execute(
      dollarizeQuestionMarks(`DELETE FROM sync_queue WHERE note_id = ?`),
      [noteId],
    )
  }

  return {
    async listDirtyIds(): Promise<string[]> {
      const rows = await db.select<{ id: string }>(
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
      return rows.map((row) => String(row.id))
    },

    async getSyncStatus(): Promise<SyncStatusSummary> {
      const [pendingRows, errorRows, conflictRows, queueRows] = await Promise.all([
        db.select<{ count: number }>(
          `SELECT COUNT(*) AS count FROM notes WHERE sync_state IN ('dirty', 'error', 'offline')`,
        ),
        db.select<{ count: number }>(
          `SELECT COUNT(*) AS count FROM notes WHERE sync_state = 'error'`,
        ),
        db.select<{ count: number }>(
          `SELECT COUNT(*) AS count FROM sync_conflicts WHERE resolved = 0`,
        ),
        db.select<{
          attemptCount: number
          createdAt: string
          lastError: string | null
        }>(`
          SELECT created_at AS createdAt,
                 attempt_count AS attemptCount,
                 last_error AS lastError
          FROM sync_queue
          ORDER BY created_at ASC
        `),
      ])
      const lastError =
        queueRows
          .slice()
          .reverse()
          .find((row) => row.lastError)?.lastError ?? null

      return {
        conflictCount: Number(conflictRows[0]?.count ?? 0),
        errorCount: Number(errorRows[0]?.count ?? 0),
        lastError,
        nextRetryAt: getNextRetryAt(queueRows),
        pendingCount: Number(pendingRows[0]?.count ?? 0),
      }
    },

    async ensureDeviceId(): Promise<string> {
      const rows = await db.select<{ value: string }>(
        `SELECT value FROM app_metadata WHERE key = 'device_id'`,
      )
      const row = rows[0]
      if (row?.value) {
        return row.value
      }
      const id = crypto.randomUUID()
      await db.execute(
        dollarizeQuestionMarks(`INSERT INTO app_metadata (key, value) VALUES (?, ?)`),
        ["device_id", id],
      )
      return id
    },

    async listNotesMeta(filter: { folder: "all" | "trash" }): Promise<NoteMeta[]> {
      const sql =
        filter.folder === "trash"
          ? `SELECT id, slug, status, title, written_at AS writtenAt, created_at AS createdAt,
                  updated_at AS updatedAt, deleted_at AS deletedAt, plain_text AS plainText, excerpt,
                  local_version AS localVersion, remote_version AS remoteVersion,
                  sync_state AS syncState, last_synced_at AS lastSyncedAt
             FROM notes WHERE status = 'trashed' ORDER BY created_at DESC`
          : `SELECT id, slug, status, title, written_at AS writtenAt, created_at AS createdAt,
                  updated_at AS updatedAt, deleted_at AS deletedAt, plain_text AS plainText, excerpt,
                  local_version AS localVersion, remote_version AS remoteVersion,
                  sync_state AS syncState, last_synced_at AS lastSyncedAt
             FROM notes WHERE status != 'trashed' ORDER BY created_at DESC`
      const rows = await db.select<Record<string, unknown>>(sql)
      return rows.map((r) => metaRow(r))
    },

    async getNoteById(id: string): Promise<NoteFull | null> {
      const row = await fetchFull(id)
      return row ? fullRow(row) : null
    },

    async saveNote(input: SaveNoteInput): Promise<NoteFull> {
      const draft = normalizeStructuredNoteDraft(input.structuredDraft)
      const plain = extractStructuredDraftPlainText(draft)
      const excerpt = excerptFromPlainText(extractStructuredDraftVisiblePlainText(draft))
      const existing = await fetchFull(draft.id)

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
        input.statusOverride ??
        (existing ? (existing.status as NoteDbStatus) : "draft")

      const slug = input.slug ?? (existing ? String(existing.slug) : draft.id)

      const rowValues = {
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
        last_synced_at: existing?.lastSyncedAt ? String(existing.lastSyncedAt) : null,
        sync_state: nextSyncState,
        structured_draft_json: JSON.stringify(draft),
        tiptap_json: JSON.stringify(input.tiptapJson),
        plain_text: plain,
        excerpt,
      }

      await db.execute(dollarizeQuestionMarks(UPSERT_NOTE_SQL), [
        rowValues.id,
        rowValues.slug,
        rowValues.status,
        rowValues.title,
        rowValues.written_at,
        rowValues.created_at,
        rowValues.updated_at,
        rowValues.deleted_at,
        rowValues.local_version,
        rowValues.remote_version,
        rowValues.device_id,
        rowValues.last_synced_at,
        rowValues.sync_state,
        rowValues.structured_draft_json,
        rowValues.tiptap_json,
        rowValues.plain_text,
        rowValues.excerpt,
      ])

      await rebuildIndexes(draft.id, draft)
      if (shouldQueueSync(nextSyncState)) {
        await enqueueSync(draft.id, localVersion)
      } else if (nextSyncState === "synced") {
        await clearSyncQueue(draft.id)
      }

      const rowAfter = await fetchFull(draft.id)
      if (!rowAfter) {
        throw new Error("Failed to read note after save")
      }
      return fullRow(rowAfter)
    },

    async appendRevision(noteId: string, cap = 80): Promise<void> {
      const row = await fetchFull(noteId)
      if (!row) {
        return
      }
      const note = fullRow(row)
      const id = crypto.randomUUID()
      await db.execute(
        dollarizeQuestionMarks(`
        INSERT INTO note_revisions (id, note_id, created_at, structured_draft_json, tiptap_json, local_version)
        VALUES (?, ?, ?, ?, ?, ?)
      `),
        [
          id,
          noteId,
          nowIso(),
          JSON.stringify(note.structuredDraft),
          JSON.stringify(note.tiptapJson),
          note.localVersion,
        ],
      )
      await db.execute(
        dollarizeQuestionMarks(`
        DELETE FROM note_revisions
        WHERE note_id = ?
          AND id NOT IN (
            SELECT id FROM note_revisions
            WHERE note_id = ?
            ORDER BY created_at DESC
            LIMIT ?
          )
      `),
        [noteId, noteId, cap],
      )
    },

    async moveToTrash(noteId: string): Promise<void> {
      const row = await fetchFull(noteId)
      if (!row) {
        return
      }
      await db.execute(
        dollarizeQuestionMarks(`
        UPDATE notes
        SET status = 'trashed', deleted_at = ?, updated_at = ?, sync_state = 'dirty'
        WHERE id = ?
      `),
        [nowIso(), nowIso(), noteId],
      )
      const note = await this.getNoteById(noteId)
      if (note) {
        await enqueueSync(noteId, note.localVersion)
      }
    },

    async restoreFromTrash(noteId: string): Promise<void> {
      await db.execute(
        dollarizeQuestionMarks(`
        UPDATE notes
        SET status = 'draft', deleted_at = NULL, updated_at = ?, sync_state = 'dirty'
        WHERE id = ?
      `),
        [nowIso(), noteId],
      )
      const note = await this.getNoteById(noteId)
      if (note) {
        await enqueueSync(noteId, note.localVersion)
      }
    },

    async applyRemoteSynced(input: {
      noteId: string
      remoteVersion: number
      status?: NoteDbStatus
      structuredDraft?: StructuredNoteDraft
      tiptapJson?: unknown
    }): Promise<void> {
      const row = await fetchFull(input.noteId)
      if (!row) {
        return
      }
      const note = fullRow(row)
      const draft = input.structuredDraft
        ? normalizeStructuredNoteDraft(input.structuredDraft)
        : note.structuredDraft
      const tiptap = input.tiptapJson ?? note.tiptapJson
      const plain = extractStructuredDraftPlainText(draft)
      const excerpt = excerptFromPlainText(extractStructuredDraftVisiblePlainText(draft))
      await db.execute(
        dollarizeQuestionMarks(`
        UPDATE notes SET
          remote_version = ?,
          status = ?,
          last_synced_at = ?,
          sync_state = 'synced',
          title = ?,
          written_at = ?,
          structured_draft_json = ?,
          tiptap_json = ?,
          plain_text = ?,
          excerpt = ?,
          updated_at = ?
        WHERE id = ?
      `),
        [
          input.remoteVersion,
          input.status ?? note.status,
          nowIso(),
          draft.title,
          draft.writtenAt || note.writtenAt,
          JSON.stringify(draft),
          JSON.stringify(tiptap),
          plain,
          excerpt,
          nowIso(),
          input.noteId,
        ],
      )
      await rebuildIndexes(input.noteId, draft)
      await clearSyncQueue(input.noteId)
    },

    async resolveConflictUseRemote(input: {
      noteId: string
      remoteVersion: number
      structuredDraft: StructuredNoteDraft
      tiptapJson?: unknown
    }): Promise<void> {
      await this.appendRevision(input.noteId)
      await this.applyRemoteSynced(input)
      await db.execute(
        dollarizeQuestionMarks(
          `UPDATE sync_conflicts SET resolved = 1 WHERE note_id = ? AND resolved = 0`,
        ),
        [input.noteId],
      )
    },

    async duplicateNoteAsLocalDraft(
      noteId: string,
      deviceId: string,
      createTiptapJson?: (draft: StructuredNoteDraft) => unknown,
    ): Promise<NoteFull | null> {
      const note = await this.getNoteById(noteId)
      if (!note) {
        return null
      }
      const duplicateDraft = cloneStructuredDraftForLocalDuplicate(note.structuredDraft)
      return this.saveNote({
        bumpLocalVersion: true,
        deviceId,
        slug: duplicateDraft.id,
        statusOverride: "draft",
        structuredDraft: duplicateDraft,
        syncState: "dirty",
        tiptapJson: createTiptapJson?.(duplicateDraft) ?? note.tiptapJson,
      })
    },

    async markSyncState(noteId: string, state: NoteSyncState): Promise<void> {
      await db.execute(
        dollarizeQuestionMarks(`UPDATE notes SET sync_state = ?, updated_at = ? WHERE id = ?`),
        [state, nowIso(), noteId],
      )
    },

    async retrySyncNow(): Promise<void> {
      await db.execute(
        dollarizeQuestionMarks(
          `UPDATE sync_queue SET attempt_count = 0, created_at = ?, last_error = NULL`,
        ),
        [nowIso()],
      )
    },

    async recordSyncFailure(noteId: string, error: unknown): Promise<void> {
      const rows = await db.select<{ attemptCount: number | null }>(
        dollarizeQuestionMarks(
          `SELECT MAX(attempt_count) AS attemptCount FROM sync_queue WHERE note_id = ?`,
        ),
        [noteId],
      )
      const attemptCount = Number(rows[0]?.attemptCount ?? 0) + 1
      await db.execute(
        dollarizeQuestionMarks(`DELETE FROM sync_queue WHERE note_id = ?`),
        [noteId],
      )
      await db.execute(
        dollarizeQuestionMarks(`
        INSERT INTO sync_queue (note_id, payload, created_at, attempt_count, last_error)
        VALUES (?, ?, ?, ?, ?)
      `),
        [
          noteId,
          JSON.stringify({ attemptCount, failedAt: nowIso(), noteId }),
          nowIso(),
          attemptCount,
          errorMessage(error),
        ],
      )
    },

    async recordConflict(
      noteId: string,
      local: unknown,
      remote: unknown,
    ): Promise<void> {
      const id = crypto.randomUUID()
      await db.execute(
        dollarizeQuestionMarks(`
        INSERT INTO sync_conflicts (id, note_id, created_at, local_payload, remote_payload, resolved)
        VALUES (?, ?, ?, ?, ?, 0)
      `),
        [id, noteId, nowIso(), JSON.stringify(local), JSON.stringify(remote)],
      )
      await clearSyncQueue(noteId)
      await db.execute(
        dollarizeQuestionMarks(`UPDATE notes SET sync_state = ?, updated_at = ? WHERE id = ?`),
        ["conflict", nowIso(), noteId],
      )
    },

    async listOpenConflicts(): Promise<SyncConflictRecord[]> {
      const rows = await db.select<Record<string, unknown>>(`
        SELECT id,
               note_id AS noteId,
               created_at AS createdAt,
               local_payload AS localPayload,
               remote_payload AS remotePayload
        FROM sync_conflicts
        WHERE resolved = 0
        ORDER BY created_at DESC
      `)

      return rows.map((row) => ({
        createdAt: String(row.createdAt),
        id: String(row.id),
        localPayload: parseUnknownJson(row.localPayload),
        noteId: String(row.noteId),
        remotePayload: parseUnknownJson(row.remotePayload),
      }))
    },

    async resolveConflictKeepLocal(
      noteId: string,
      remoteVersion: number,
    ): Promise<void> {
      const note = await this.getNoteById(noteId)
      if (!note) {
        return
      }
      await db.execute(
        dollarizeQuestionMarks(`
        UPDATE notes
        SET remote_version = ?, sync_state = 'dirty', updated_at = ?
        WHERE id = ?
      `),
        [remoteVersion, nowIso(), noteId],
      )
      await db.execute(
        dollarizeQuestionMarks(
          `UPDATE sync_conflicts SET resolved = 1 WHERE note_id = ? AND resolved = 0`,
        ),
        [noteId],
      )
      await enqueueSync(noteId, note.localVersion)
    },
  }
}

export type AsyncSqlNoteRepository = ReturnType<typeof createAsyncSqlNoteRepository>

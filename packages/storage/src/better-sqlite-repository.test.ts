import Database from "better-sqlite3"
import { describe, expect, it } from "vitest"
import {
  createNewStructuredNoteDraft,
  normalizeStructuredNoteDraft,
} from "@continuum/core"
import {
  createBetterSqlNoteRepository,
  migrateBetterSqlite,
} from "./better-sqlite-repository"

describe("SQLite repository", () => {
  it("persists drafts and marks dirty revisions", () => {
    const db = new Database(":memory:")
    migrateBetterSqlite(db)
    const repo = createBetterSqlNoteRepository(db)
    const deviceId = repo.ensureDeviceId()

    const draft = createNewStructuredNoteDraft(new Date(), [])
    const prototype = { doc: true, tiptap: { type: "doc", content: [] } }

    const saved = repo.saveNote({
      bumpLocalVersion: true,
      deviceId,
      structuredDraft: draft,
      syncState: "dirty",
      tiptapJson: prototype.tiptap,
    })

    expect(saved.localVersion).toBe(1)
    expect(saved.syncState).toBe("dirty")
    expect(repo.listDirtyIds()).toEqual([draft.id])
    expect(
      (
        db
          .prepare(`SELECT COUNT(*) AS count FROM sync_queue WHERE note_id = ?`)
          .get(draft.id) as { count: number }
      ).count,
    ).toBe(1)

    const roundTrip = repo.getNoteById(draft.id)
    expect(roundTrip?.structuredDraft.id).toBe(draft.id)

    const bumped = repo.saveNote({
      bumpLocalVersion: true,
      deviceId,
      structuredDraft: normalizeStructuredNoteDraft({
        ...draft,
        title: "Hola",
      }),
      syncState: "dirty",
      tiptapJson: prototype.tiptap,
    })

    expect(bumped.localVersion).toBe(2)
    expect(
      (
        db
          .prepare(`SELECT COUNT(*) AS count FROM sync_queue WHERE note_id = ?`)
          .get(draft.id) as { count: number }
      ).count,
    ).toBe(1)
  })

  it("keeps failed sync work queued for retry", () => {
    const db = new Database(":memory:")
    migrateBetterSqlite(db)
    const repo = createBetterSqlNoteRepository(db)
    const deviceId = repo.ensureDeviceId()
    const draft = createNewStructuredNoteDraft(new Date(), [])

    repo.saveNote({
      bumpLocalVersion: true,
      deviceId,
      structuredDraft: draft,
      syncState: "dirty",
      tiptapJson: { type: "doc", content: [] },
    })

    repo.recordSyncFailure(draft.id, new Error("network down"))
    const row = db
      .prepare(
        `SELECT attempt_count AS attemptCount, last_error AS lastError FROM sync_queue WHERE note_id = ?`,
      )
      .get(draft.id) as { attemptCount: number; lastError: string }

    expect(row.attemptCount).toBe(1)
    expect(row.lastError).toBe("network down")

    repo.applyRemoteSynced({ noteId: draft.id, remoteVersion: 1 })

    expect(repo.getNoteById(draft.id)?.syncState).toBe("synced")
    expect(
      (
        db
          .prepare(`SELECT COUNT(*) AS count FROM sync_queue WHERE note_id = ?`)
          .get(draft.id) as { count: number }
      ).count,
    ).toBe(0)
  })

  it("resolves conflicts by keeping the local draft queued against the latest remote version", () => {
    const db = new Database(":memory:")
    migrateBetterSqlite(db)
    const repo = createBetterSqlNoteRepository(db)
    const deviceId = repo.ensureDeviceId()
    const draft = createNewStructuredNoteDraft(new Date(), [])

    repo.saveNote({
      bumpLocalVersion: true,
      deviceId,
      remoteVersion: 1,
      structuredDraft: draft,
      syncState: "dirty",
      tiptapJson: { type: "doc", content: [] },
    })
    repo.recordConflict(draft.id, { local: true }, { serverRemoteVersion: 3 })

    expect(repo.listOpenConflicts()).toHaveLength(1)
    expect(repo.getNoteById(draft.id)?.syncState).toBe("conflict")

    repo.resolveConflictKeepLocal(draft.id, 3)

    const note = repo.getNoteById(draft.id)
    expect(note?.remoteVersion).toBe(3)
    expect(note?.syncState).toBe("dirty")
    expect(repo.listDirtyIds()).toEqual([draft.id])
    expect(repo.listOpenConflicts()).toHaveLength(0)
  })

  it("resolves conflicts by applying the remote draft and preserving a local revision", () => {
    const db = new Database(":memory:")
    migrateBetterSqlite(db)
    const repo = createBetterSqlNoteRepository(db)
    const deviceId = repo.ensureDeviceId()
    const localDraft = normalizeStructuredNoteDraft({
      ...createNewStructuredNoteDraft(new Date(), []),
      title: "Local text",
    })
    const remoteDraft = normalizeStructuredNoteDraft({
      ...localDraft,
      title: "Remote text",
    })

    repo.saveNote({
      bumpLocalVersion: true,
      deviceId,
      remoteVersion: 1,
      structuredDraft: localDraft,
      syncState: "dirty",
      tiptapJson: { content: [{ text: "local", type: "text" }], type: "doc" },
    })
    repo.recordConflict(localDraft.id, { local: true }, { serverRemoteVersion: 4 })

    repo.resolveConflictUseRemote({
      noteId: localDraft.id,
      remoteVersion: 4,
      structuredDraft: remoteDraft,
      tiptapJson: { content: [{ text: "remote", type: "text" }], type: "doc" },
    })

    const note = repo.getNoteById(localDraft.id)
    expect(note?.title).toBe("Remote text")
    expect(note?.remoteVersion).toBe(4)
    expect(note?.syncState).toBe("synced")
    expect(repo.listDirtyIds()).toEqual([])
    expect(repo.listOpenConflicts()).toHaveLength(0)
    expect(
      (
        db
          .prepare(`SELECT COUNT(*) AS count FROM sync_queue WHERE note_id = ?`)
          .get(localDraft.id) as { count: number }
      ).count,
    ).toBe(0)
    expect(
      (
        db
          .prepare(`SELECT COUNT(*) AS count FROM note_revisions WHERE note_id = ?`)
          .get(localDraft.id) as { count: number }
      ).count,
    ).toBe(1)
  })

  it("duplicates the local conflict draft before applying the remote original", () => {
    const db = new Database(":memory:")
    migrateBetterSqlite(db)
    const repo = createBetterSqlNoteRepository(db)
    const deviceId = repo.ensureDeviceId()
    const localDraft = normalizeStructuredNoteDraft({
      ...createNewStructuredNoteDraft(new Date(), []),
      title: "Local survivor",
    })
    const remoteDraft = normalizeStructuredNoteDraft({
      ...localDraft,
      title: "Remote original",
    })

    repo.saveNote({
      bumpLocalVersion: true,
      deviceId,
      remoteVersion: 2,
      structuredDraft: localDraft,
      syncState: "dirty",
      tiptapJson: { content: [], type: "doc" },
    })
    repo.recordConflict(localDraft.id, { local: true }, { serverRemoteVersion: 5 })

    const duplicate = repo.duplicateNoteAsLocalDraft(localDraft.id, deviceId)
    repo.resolveConflictUseRemote({
      noteId: localDraft.id,
      remoteVersion: 5,
      structuredDraft: remoteDraft,
      tiptapJson: { content: [{ text: "remote", type: "text" }], type: "doc" },
    })

    expect(duplicate?.id).toBeTruthy()
    expect(duplicate?.id).not.toBe(localDraft.id)
    expect(duplicate?.title).toBe("Local survivor (copia local)")
    expect(duplicate?.remoteVersion).toBe(0)
    expect(duplicate?.syncState).toBe("dirty")
    expect(repo.getNoteById(localDraft.id)?.title).toBe("Remote original")
    expect(repo.getNoteById(localDraft.id)?.syncState).toBe("synced")
    expect(repo.listDirtyIds()).toEqual([duplicate?.id])
    expect(repo.listOpenConflicts()).toHaveLength(0)
  })
})

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
  })
})

import Database from "better-sqlite3"
import { describe, expect, it } from "vitest"
import { createNewStructuredNoteDraft } from "@continuum/core"
import { createBetterSqlNoteRepository, migrateBetterSqlite } from "./better-sqlite-repository"

describe("trash lifecycle", () => {
  it("hides trashed notes from the main list", () => {
    const db = new Database(":memory:")
    migrateBetterSqlite(db)
    const repo = createBetterSqlNoteRepository(db)
    const deviceId = repo.ensureDeviceId()
    const draft = createNewStructuredNoteDraft(new Date(), [])

    repo.saveNote({
      bumpLocalVersion: true,
      deviceId,
      structuredDraft: draft,
      syncState: "synced",
      tiptapJson: { type: "doc", content: [] },
    })

    expect(repo.listNotesMeta({ folder: "all" })).toHaveLength(1)

    repo.moveToTrash(draft.id)
    expect(repo.listNotesMeta({ folder: "all" })).toHaveLength(0)
    expect(repo.listNotesMeta({ folder: "trash" })).toHaveLength(1)

    repo.restoreFromTrash(draft.id)
    expect(repo.listNotesMeta({ folder: "all" })).toHaveLength(1)
    expect(repo.listNotesMeta({ folder: "trash" })).toHaveLength(0)
  })
})

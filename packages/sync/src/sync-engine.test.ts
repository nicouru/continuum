import { describe, expect, it } from "vitest"
import { normalizeStructuredNoteDraft } from "@continuum/core"
import { DraftSyncEngine, type SyncAdapterNote } from "./sync-engine"
import type { DraftRemoteClient } from "./types"

function note(): SyncAdapterNote {
  return {
    deviceId: "device-1",
    id: "note-1",
    localVersion: 1,
    remoteVersion: 0,
    slug: "note-1",
    structuredDraft: normalizeStructuredNoteDraft({
      blocks: [],
      citations: [],
      id: "note-1",
      references: [],
      title: "",
      writtenAt: "2026-05-15",
    }),
    syncState: "dirty",
    tiptapJson: { type: "doc" },
  }
}

describe("DraftSyncEngine", () => {
  it("marks a note as error when remote sync fails", async () => {
    const states: string[] = []
    const errors: unknown[] = []
    const client: DraftRemoteClient = {
      fetchRemoteMeta: async () => null,
      pushDraft: async () => {
        throw new Error("network down")
      },
    }
    const engine = new DraftSyncEngine({
      applyRemoteSuccess: async () => undefined,
      client,
      isOffline: () => false,
      loadNote: async () => note(),
      markState: async (_noteId, state) => {
        states.push(state)
      },
      onConflict: async () => undefined,
      onError: async (_noteId, error) => {
        errors.push(error)
      },
      pollDirtyIds: async () => ["note-1"],
    })

    await engine.syncNote("note-1")

    expect(states).toEqual(["syncing", "error"])
    expect(errors).toHaveLength(1)
  })
})

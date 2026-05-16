import { describe, expect, it } from "vitest"
import { normalizeStructuredNoteDraft } from "@continuum/core"
import { DraftSyncEngine, type SyncAdapterNote } from "./sync-engine"
import { DraftRemoteError, type DraftRemoteClient } from "./types"

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

    const result = await engine.syncNote("note-1")

    expect(states).toEqual(["syncing", "error"])
    expect(errors).toHaveLength(1)
    expect(result.status).toBe("error")
  })

  it("surfaces server revision conflicts without marking generic error", async () => {
    const states: string[] = []
    const conflicts: unknown[] = []
    const errors: unknown[] = []
    const client: DraftRemoteClient = {
      fetchRemoteMeta: async () => null,
      pushDraft: async () => {
        throw new DraftRemoteError("remote conflict", {
          code: "conflict",
          status: 409,
        })
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
      onConflict: async (_noteId, error) => {
        conflicts.push(error)
      },
      onError: async (_noteId, error) => {
        errors.push(error)
      },
      pollDirtyIds: async () => ["note-1"],
    })

    const result = await engine.syncNote("note-1")

    expect(states).toEqual(["syncing"])
    expect(conflicts).toHaveLength(1)
    expect(errors).toHaveLength(0)
    expect(result.status).toBe("conflict")
  })

  it("loads the remote draft payload before surfacing remote-ahead conflicts", async () => {
    const conflicts: unknown[] = []
    const client: DraftRemoteClient = {
      fetchRemoteDraft: async () => ({
        noteId: "note-1",
        remoteVersion: 3,
        slug: "note-1",
        status: "draft",
        structuredDraft: normalizeStructuredNoteDraft({
          blocks: [],
          citations: [],
          id: "note-1",
          references: [],
          title: "Remote",
          writtenAt: "2026-05-15",
        }),
      }),
      fetchRemoteMeta: async () => ({ remoteVersion: 3 }),
      pushDraft: async () => {
        throw new Error("push should not run")
      },
    }
    const engine = new DraftSyncEngine({
      applyRemoteSuccess: async () => undefined,
      client,
      isOffline: () => false,
      loadNote: async () => ({ ...note(), remoteVersion: 1 }),
      markState: async () => undefined,
      onConflict: async (_noteId, error) => {
        conflicts.push(error)
      },
      pollDirtyIds: async () => ["note-1"],
    })

    const result = await engine.syncNote("note-1")

    expect(result.status).toBe("conflict")
    expect(conflicts).toMatchObject([
      {
        remoteDraft: {
          noteId: "note-1",
          remoteVersion: 3,
          structuredDraft: { title: "Remote" },
        },
        serverRemoteVersion: 3,
        storedRemoteVersion: 1,
      },
    ])
  })

  it("rebases a lost first-sync acknowledgement before retrying", async () => {
    const rebases: Array<{ noteId: string; remoteVersion: number }> = []
    const pushes: number[] = []
    const conflicts: unknown[] = []
    const client: DraftRemoteClient = {
      fetchRemoteMeta: async () => ({ remoteVersion: 1 }),
      pushDraft: async (payload) => {
        pushes.push(payload.remoteVersion)
        return { remoteVersion: 2 }
      },
    }
    const engine = new DraftSyncEngine({
      applyRemoteSuccess: async () => undefined,
      client,
      isOffline: () => false,
      loadNote: async () => note(),
      markState: async () => undefined,
      onConflict: async (_noteId, error) => {
        conflicts.push(error)
      },
      pollDirtyIds: async () => ["note-1"],
      rebaseLocalRemoteVersion: async (noteId, remoteVersion) => {
        rebases.push({ noteId, remoteVersion })
      },
    })

    const result = await engine.syncNote("note-1")

    expect(result).toEqual({ remoteVersion: 2, status: "success" })
    expect(rebases).toEqual([{ noteId: "note-1", remoteVersion: 1 }])
    expect(pushes).toEqual([1])
    expect(conflicts).toHaveLength(0)
  })
})

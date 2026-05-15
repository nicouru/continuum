import { DraftRemoteError, type DraftRemoteClient } from "./types"
import type { NoteSyncState } from "@continuum/storage/types"
import { shouldFlagSyncConflict } from "./conflict"

export type SyncAdapterNote = {
  id: string
  slug: string
  deviceId: string
  localVersion: number
  remoteVersion: number
  syncState: string
  structuredDraft: import("@continuum/core").StructuredNoteDraft
  tiptapJson: unknown
}

export type SyncEngineDeps = {
  client: DraftRemoteClient
  pollDirtyIds: () => Promise<string[]>
  loadNote: (id: string) => Promise<SyncAdapterNote | null>
  applyRemoteSuccess: (
    noteId: string,
    remoteVersion: number,
  ) => Promise<void>
  markState: (noteId: string, state: string) => Promise<void>
  onConflict: (noteId: string, error: unknown) => Promise<void>
  onError?: (noteId: string, error: unknown) => Promise<void> | void
  isOffline: () => boolean
}

export class DraftSyncEngine {
  private readonly inFlight = new Set<string>()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly deps: SyncEngineDeps,
    private readonly options: { intervalMs: number } = { intervalMs: 8000 },
  ) {}

  start() {
    if (this.timer) {
      return
    }

    void this.flushDirty()
    this.timer = setInterval(() => {
      void this.flushDirty()
    }, this.options.intervalMs)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async flushDirty() {
    if (this.deps.isOffline()) {
      return
    }

    const ids = await this.deps.pollDirtyIds()
    for (const noteId of ids) {
      await this.syncNote(noteId)
    }
  }

  async syncNote(noteId: string) {
    if (this.inFlight.has(noteId)) {
      return
    }

    this.inFlight.add(noteId)

    try {
      await this.syncNoteOnce(noteId)
    } finally {
      this.inFlight.delete(noteId)
    }
  }

  private async syncNoteOnce(noteId: string) {
    if (this.deps.isOffline()) {
      await this.deps.markState(noteId, "offline")
      return
    }

    const note = await this.deps.loadNote(noteId)
    if (!note || note.syncState === "conflict") {
      return
    }

    if (note.syncState !== "dirty" && note.syncState !== "error") {
      return
    }

    try {
      const remote = await this.deps.client.fetchRemoteMeta(noteId)
      const serverRemoteVersion = remote?.remoteVersion ?? note.remoteVersion

      if (
        shouldFlagSyncConflict({
          serverRemoteVersion,
          storedRemoteVersion: note.remoteVersion,
          syncState: note.syncState as NoteSyncState,
        })
      ) {
        await this.deps.onConflict(noteId, new Error("REMOTE_AHEAD"))
        return
      }

      await this.deps.markState(noteId, "syncing")
      const result = await this.deps.client.pushDraft({
        deviceId: note.deviceId,
        localVersion: note.localVersion,
        noteId: note.id,
        remoteVersion: note.remoteVersion,
        slug: note.slug,
        structuredDraft: note.structuredDraft,
        tiptapJson: note.tiptapJson,
      })
      await this.deps.applyRemoteSuccess(note.id, result.remoteVersion)
    } catch (error) {
      if (isRemoteConflict(error)) {
        await this.deps.onConflict(noteId, error)
        return
      }

      await this.deps.markState(noteId, "error")
      await this.deps.onError?.(noteId, error)
    }
  }
}

function isRemoteConflict(error: unknown) {
  return (
    error instanceof DraftRemoteError &&
    (error.details.code === "conflict" || error.details.status === 409)
  )
}

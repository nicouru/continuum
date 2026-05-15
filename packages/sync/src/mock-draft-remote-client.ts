import type { DraftPushPayload, DraftPushResult, DraftRemoteClient } from "./types"

/**
 * In-memory remote used until Diario draft endpoints are wired.
 */
export class MockDraftRemoteClient implements DraftRemoteClient {
  private readonly versions = new Map<string, number>()
  private readonly payloads = new Map<string, DraftPushPayload>()

  async fetchRemoteMeta(noteId: string) {
    const remoteVersion = this.versions.get(noteId)
    return remoteVersion === undefined ? null : { remoteVersion }
  }

  async pushDraft(payload: DraftPushPayload): Promise<DraftPushResult> {
    const previous = this.versions.get(payload.noteId) ?? 0

    if (payload.remoteVersion < previous) {
      throw new Error("REMOTE_VERSION_MISMATCH")
    }

    const next = previous + 1
    this.versions.set(payload.noteId, next)
    this.payloads.set(payload.noteId, payload)

    return { remoteVersion: next, etag: `mock-${next}` }
  }

  peek(noteId: string) {
    return this.payloads.get(noteId)
  }
}

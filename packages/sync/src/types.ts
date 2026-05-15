import type { StructuredNoteDraft } from "@continuum/core"

export type DraftPushPayload = {
  noteId: string
  slug: string
  deviceId: string
  localVersion: number
  remoteVersion: number
  structuredDraft: StructuredNoteDraft
  tiptapJson: unknown
}

export type DraftPushResult = {
  remoteVersion: number
  etag?: string
}

export interface DraftRemoteClient {
  fetchRemoteMeta(noteId: string): Promise<{ remoteVersion: number } | null>
  pushDraft(payload: DraftPushPayload): Promise<DraftPushResult>
}

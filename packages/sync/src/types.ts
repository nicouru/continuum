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
  action?: "created" | "updated"
  remoteVersion: number
  etag?: string
  note?: {
    id: string
    slug: string
    status: string
    title: string
    writtenAt: string
  }
}

export type RemoteDraft = {
  noteId: string
  remoteVersion: number
  slug: string
  status: string
  structuredDraft: StructuredNoteDraft
  tiptapJson?: unknown
}

export interface DraftRemoteClient {
  fetchRemoteDraft?(noteId: string): Promise<RemoteDraft | null>
  fetchRemoteMeta(noteId: string): Promise<{ remoteVersion: number } | null>
  listRemoteDrafts?(): Promise<RemoteDraft[]>
  pushDraft(payload: DraftPushPayload): Promise<DraftPushResult>
}

export class DraftRemoteError extends Error {
  constructor(
    message: string,
    readonly details: {
      code?: string
      status?: number
      body?: unknown
      remoteDraft?: RemoteDraft
      serverRemoteVersion?: number
    } = {},
  ) {
    super(message)
    this.name = "DraftRemoteError"
  }
}

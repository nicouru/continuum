import type { StructuredNoteDraft } from "@continuum/core"

export type NoteDbStatus = "draft" | "published" | "archived" | "trashed"

export type NoteSyncState =
  | "local_only"
  | "dirty"
  | "syncing"
  | "synced"
  | "offline"
  | "conflict"
  | "error"

export type NoteMeta = {
  id: string
  slug: string
  status: NoteDbStatus
  title: string
  writtenAt: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  excerpt: string
  localVersion: number
  remoteVersion: number
  syncState: NoteSyncState
  lastSyncedAt: string | null
}

export type NoteFull = NoteMeta & {
  structuredDraft: StructuredNoteDraft
  tiptapJson: unknown
  plainText: string
  deviceId: string
}

export type SaveNoteInput = {
  structuredDraft: StructuredNoteDraft
  tiptapJson: unknown
  deviceId: string
  slug?: string
  /** When true, increments `local_version` (autosave / edit). */
  bumpLocalVersion: boolean
  /** Forces `sync_state` when provided. */
  syncState?: NoteSyncState
  statusOverride?: NoteDbStatus
}

export type EmergencyDraftPayload = {
  noteId: string
  savedAtMs: number
  localVersion: number
  structuredDraft: StructuredNoteDraft
  tiptapJson: unknown
}

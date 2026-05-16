import type { StructuredNoteDraft } from "@continuum/core"
import { normalizeStructuredNoteDraft } from "@continuum/core"
import type { NoteDbStatus, NoteFull, NoteMeta, NoteSyncState } from "./types"

export function nowIso() {
  return new Date().toISOString()
}

export function shouldQueueSync(state: NoteSyncState) {
  return state === "dirty" || state === "error" || state === "offline"
}

export function syncQueuePayload(noteId: string, localVersion: number) {
  return JSON.stringify({ localVersion, noteId, queuedAt: nowIso() })
}

export function retryDelaySeconds(attemptCount: number) {
  if (attemptCount <= 0) {
    return 0
  }
  if (attemptCount === 1) {
    return 10
  }
  if (attemptCount === 2) {
    return 30
  }
  if (attemptCount === 3) {
    return 60
  }
  if (attemptCount === 4) {
    return 120
  }
  return 300
}

export function parseJsonDraft(raw: string): StructuredNoteDraft {
  return normalizeStructuredNoteDraft(JSON.parse(raw) as StructuredNoteDraft)
}

export function metaRow(row: Record<string, unknown>): NoteMeta {
  return {
    id: String(row.id),
    slug: String(row.slug),
    status: row.status as NoteDbStatus,
    title: String(row.title ?? ""),
    writtenAt: String(row.writtenAt),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    deletedAt: row.deletedAt ? String(row.deletedAt) : null,
    excerpt: String(row.excerpt ?? ""),
    localVersion: Number(row.localVersion ?? 0),
    remoteVersion: Number(row.remoteVersion ?? 0),
    syncState: row.syncState as NoteSyncState,
    lastSyncedAt: row.lastSyncedAt ? String(row.lastSyncedAt) : null,
  }
}

export function fullRow(row: Record<string, unknown>): NoteFull {
  return {
    ...metaRow(row),
    deviceId: String(row.deviceId ?? ""),
    plainText: String(row.plainText ?? ""),
    structuredDraft: parseJsonDraft(String(row.structuredDraftJson)),
    tiptapJson: JSON.parse(String(row.tiptapJson)),
  }
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function getNextRetryAt(
  rows: Array<{ attemptCount: number; createdAt: string }>,
): string | null {
  const candidates = rows
    .map((row) => {
      const createdMs = Date.parse(row.createdAt)
      if (!Number.isFinite(createdMs)) {
        return null
      }
      return new Date(createdMs + retryDelaySeconds(Number(row.attemptCount)) * 1000)
    })
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => left.getTime() - right.getTime())

  return candidates[0]?.toISOString() ?? null
}

export function parseUnknownJson(value: unknown) {
  if (typeof value !== "string") {
    return value
  }
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

import type {
  DraftPushPayload,
  DraftPushResult,
  DraftRemoteClient,
  RemoteDraft,
} from "./types"
import { normalizeStructuredNoteDraft } from "@continuum/core"
import { DraftRemoteError } from "./types"

export type FetchLike = (
  input: string,
  init?: {
    body?: string
    credentials?: "include" | "omit" | "same-origin"
    headers?: Record<string, string>
    method?: string
    timeout?: number
  },
) => Promise<{
  headers: {
    get(name: string): string | null
  }
  json(): Promise<unknown>
  ok: boolean
  status: number
  text(): Promise<string>
}>

export type DiarioDraftHttpRemoteClientOptions = {
  baseUrl: string
  bearerToken?: string
  extraHeaders?: Record<string, string>
  fetchImpl?: FetchLike
  origin?: string
  sessionCookie?: string
  timeoutSeconds?: number
}

type AdminApiSuccessData = {
  action?: "created" | "updated"
  note?: {
    id?: string
    slug?: string
    status?: string
    title?: string
    writtenAt?: string
  }
  remoteVersion?: number
  sync?: {
    remoteRevision?: number
    remoteVersion?: number
    updatedAt?: string | null
  }
}

type AdminNoteListData = {
  notes?: Array<{
    id?: string
    slug?: string
    status?: string
  }>
}

type AdminDraftData = AdminApiSuccessData & {
  draft?: import("@continuum/core").StructuredNoteDraft
}

type AdminDraftsIndexData = {
  drafts?: unknown[]
}

type AdminApiEnvelope =
  | {
      data?: AdminApiSuccessData | AdminNoteListData | AdminDraftData | AdminDraftsIndexData
      ok?: true
    }
  | {
      error?: {
        code?: string
        message?: string
      }
      ok?: false
    }

const TIPTAP_DRAFT_PATH = "/api/admin/v1/tiptap-draft"
const TIPTAP_DRAFTS_PATH = "/api/admin/v1/tiptap-drafts"
const NOTES_PATH = "/api/admin/v1/notes"

export class DiarioDraftHttpRemoteClient implements DraftRemoteClient {
  private readonly baseUrl: URL
  private readonly fetchImpl: FetchLike
  private readonly origin: string
  private readonly timeoutSeconds: number

  constructor(private readonly options: DiarioDraftHttpRemoteClientOptions) {
    if (!options.baseUrl.trim()) {
      throw new Error("Diario HTTP sync requires a baseUrl.")
    }

    this.baseUrl = new URL(options.baseUrl)
    this.origin = options.origin?.trim() || this.baseUrl.origin
    this.timeoutSeconds = options.timeoutSeconds ?? 30
    this.fetchImpl =
      options.fetchImpl ?? (globalThis.fetch.bind(globalThis) as FetchLike)
  }

  async fetchRemoteMeta(noteId: string) {
    const data = await this.fetchRemoteDraftData(noteId)

    if (!data) {
      return null
    }

    const remoteVersion = getRemoteVersionFromData(data)

    return typeof remoteVersion === "number" ? { remoteVersion } : null
  }

  async fetchRemoteDraft(noteId: string): Promise<RemoteDraft | null> {
    const data = await this.fetchRemoteDraftData(noteId)

    return data ? getRemoteDraftFromData(data, noteId) : null
  }

  async fetchNewDraftSeed(): Promise<RemoteDraft | null> {
    const response = await this.fetchImpl(this.url(`${TIPTAP_DRAFT_PATH}?new=1`), {
      credentials: "include",
      headers: this.headers(),
      method: "GET",
      timeout: this.timeoutSeconds,
    })
    const body = await readJsonOrText(response)

    if (!response.ok) {
      throw createRemoteError(response.status, body)
    }

    const envelope = body as AdminApiEnvelope
    const data = "data" in envelope ? envelope.data : undefined
    return isRecord(data) ? getRemoteDraftFromData(data as AdminDraftData) : null
  }

  async listRemoteDrafts(): Promise<RemoteDraft[]> {
    const bulkDrafts = await this.fetchRemoteDraftsIndex()

    if (bulkDrafts) {
      return bulkDrafts
    }

    const response = await this.fetchImpl(this.url(NOTES_PATH), {
      credentials: "include",
      headers: this.headers(),
      method: "GET",
      timeout: this.timeoutSeconds,
    })
    const body = await readJsonOrText(response)

    if (!response.ok) {
      throw createRemoteError(response.status, body)
    }

    const envelope = body as AdminApiEnvelope
    const data = ("data" in envelope ? envelope.data : undefined) as
      | AdminNoteListData
      | undefined
    const notes = isRecord(data) && Array.isArray(data.notes) ? data.notes : []
    const drafts: RemoteDraft[] = []

    for (const note of notes) {
      if (!isRecord(note) || note.status !== "draft" || typeof note.id !== "string") {
        continue
      }
      const draft = await this.fetchRemoteDraft(note.id)
      if (!draft) {
        continue
      }
      drafts.push({
        ...draft,
        slug: typeof note.slug === "string" ? note.slug : draft.slug,
      })
    }

    return drafts
  }

  async pushDraft(payload: DraftPushPayload): Promise<DraftPushResult> {
    const response = await this.fetchImpl(this.url(TIPTAP_DRAFT_PATH), {
      body: JSON.stringify({
        baseRemoteRevision: payload.remoteVersion,
        draft: payload.structuredDraft,
      }),
      credentials: "include",
      headers: this.headers(),
      method: "POST",
      timeout: this.timeoutSeconds,
    })
    const body = await readJsonOrText(response)

    if (!response.ok) {
      throw createRemoteError(response.status, body)
    }

    const envelope = body as AdminApiEnvelope
    const data = ("data" in envelope ? envelope.data : undefined) as
      | AdminApiSuccessData
      | undefined
    const remoteVersion = getRemoteVersionFromData(data) ?? payload.remoteVersion + 1
    const etag = response.headers.get("etag") ?? undefined

    return {
      ...(data?.action ? { action: data.action } : {}),
      ...(etag ? { etag } : {}),
      ...(data?.note
        ? {
            note: {
              id: data.note.id ?? payload.noteId,
              slug: data.note.slug ?? payload.slug,
              status: data.note.status ?? "draft",
              title: data.note.title ?? payload.structuredDraft.title,
              writtenAt:
                data.note.writtenAt ?? payload.structuredDraft.writtenAt,
            },
          }
        : {}),
      remoteVersion,
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
      origin: this.origin,
      referer: `${this.origin}/`,
      ...this.options.extraHeaders,
    }

    if (this.options.bearerToken) {
      headers.authorization = `Bearer ${this.options.bearerToken}`
    }

    if (this.options.sessionCookie) {
      headers.cookie = this.options.sessionCookie
    }

    return headers
  }

  private url(path: string) {
    return new URL(path, this.baseUrl).toString()
  }

  private async fetchRemoteDraftsIndex(): Promise<RemoteDraft[] | null> {
    const response = await this.fetchImpl(this.url(TIPTAP_DRAFTS_PATH), {
      credentials: "include",
      headers: this.headers(),
      method: "GET",
      timeout: this.timeoutSeconds,
    })
    const body = await readJsonOrText(response)

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      throw createRemoteError(response.status, body)
    }

    const envelope = body as AdminApiEnvelope
    const data = "data" in envelope ? envelope.data : undefined
    const draftRecords = isDraftsIndexData(data) ? data.drafts ?? [] : []

    return draftRecords.flatMap((item): RemoteDraft[] => {
      if (!isRecord(item)) {
        return []
      }

      const draft = getRemoteDraftFromData(item as AdminDraftData)
      return draft ? [draft] : []
    })
  }

  private async fetchRemoteDraftData(noteId: string): Promise<AdminDraftData | null> {
    const response = await this.fetchImpl(
      this.url(`${TIPTAP_DRAFT_PATH}?noteId=${encodeURIComponent(noteId)}`),
      {
        credentials: "include",
        headers: this.headers(),
        method: "GET",
        timeout: this.timeoutSeconds,
      },
    )
    const body = await readJsonOrText(response)

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      throw createRemoteError(response.status, body)
    }

    const envelope = body as AdminApiEnvelope
    const data = "data" in envelope ? envelope.data : undefined
    return isRecord(data) ? (data as AdminDraftData) : null
  }
}

function getRemoteDraftFromData(
  data: AdminDraftData,
  fallbackNoteId?: string,
): RemoteDraft | null {
  if (!data.draft || !isRecord(data.draft)) {
    return null
  }

  const structuredDraft = normalizeStructuredNoteDraft(data.draft)
  const note = isRecord(data.note) ? data.note : undefined
  const noteId = getString(note?.id) ?? fallbackNoteId ?? structuredDraft.id
  const slug = getString(note?.slug) ?? noteId
  const status = getString(note?.status) ?? "draft"

  return {
    noteId,
    remoteVersion: getRemoteVersionFromData(data) ?? 0,
    slug,
    status,
    structuredDraft,
  }
}

function getRemoteVersionFromData(data: AdminApiSuccessData | undefined) {
  if (typeof data?.sync?.remoteRevision === "number") {
    return data.sync.remoteRevision
  }

  if (typeof data?.sync?.remoteVersion === "number") {
    return data.sync.remoteVersion
  }

  if (typeof data?.remoteVersion === "number") {
    return data.remoteVersion
  }

  return undefined
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined
}

async function readJsonOrText(response: Awaited<ReturnType<FetchLike>>) {
  try {
    return await response.json()
  } catch {
    return await response.text()
  }
}

function createRemoteError(status: number, body: unknown) {
  const envelope = isRecord(body) ? (body as AdminApiEnvelope) : undefined
  const apiError =
    envelope && "error" in envelope && envelope.error ? envelope.error : undefined
  const conflictDetails = getRemoteConflictDetails(body)

  return new DraftRemoteError(
    apiError?.message || `Diario draft sync failed with HTTP ${status}.`,
    {
      body,
      code: apiError?.code,
      ...conflictDetails,
      status,
    },
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isDraftsIndexData(value: unknown): value is AdminDraftsIndexData {
  return isRecord(value) && Array.isArray(value.drafts)
}

function getRemoteConflictDetails(body: unknown) {
  if (!isRecord(body) || !isRecord(body.error) || !isRecord(body.error.details)) {
    return {}
  }

  const details = body.error.details
  const remoteDraft = isRecord(details.remoteDraft)
    ? getRemoteDraftFromData(details.remoteDraft as AdminDraftData)
    : undefined
  const serverRemoteVersion =
    typeof details.serverRemoteRevision === "number"
      ? details.serverRemoteRevision
      : typeof details.serverRemoteVersion === "number"
        ? details.serverRemoteVersion
        : undefined

  return {
    ...(remoteDraft ? { remoteDraft } : {}),
    ...(serverRemoteVersion !== undefined ? { serverRemoteVersion } : {}),
  }
}

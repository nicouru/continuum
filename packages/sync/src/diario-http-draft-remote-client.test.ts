import { describe, expect, it } from "vitest"
import { normalizeStructuredNoteDraft } from "@continuum/core"
import {
  DiarioDraftHttpRemoteClient,
  type FetchLike,
} from "./diario-http-draft-remote-client"
import { DraftRemoteError } from "./types"

function draft() {
  return normalizeStructuredNoteDraft({
    blocks: [
      {
        id: "block-1",
        segments: [{ id: "segment-1", text: "Body", type: "text" }],
        type: "paragraph",
      },
    ],
    citations: [],
    id: "note-1",
    references: [],
    title: "Title",
    writtenAt: "2026-05-15",
  })
}

describe("DiarioDraftHttpRemoteClient", () => {
  it("posts structured drafts to the Diario TipTap draft endpoint", async () => {
    const calls: Array<{ init: Parameters<FetchLike>[1]; url: string }> = []
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ init, url })
      return {
        headers: { get: (name) => (name.toLowerCase() === "etag" ? "rev-12" : null) },
        json: async () => ({
          data: {
            action: "updated",
            note: {
              id: "note-1",
              slug: "note-1",
              status: "draft",
              title: "Title",
              writtenAt: "2026-05-15",
            },
            sync: {
              remoteRevision: 12,
            },
          },
          ok: true,
        }),
        ok: true,
        status: 200,
        text: async () => "",
      }
    }
    const client = new DiarioDraftHttpRemoteClient({
      baseUrl: "https://diario.example",
      fetchImpl,
      sessionCookie: "diario_admin_session=abc",
    })

    const result = await client.pushDraft({
      deviceId: "device-1",
      localVersion: 3,
      noteId: "note-1",
      remoteVersion: 11,
      slug: "note-1",
      structuredDraft: draft(),
      tiptapJson: { type: "doc" },
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe("https://diario.example/api/admin/v1/tiptap-draft")
    expect(calls[0]?.init).toMatchObject({
      credentials: "include",
      method: "POST",
      timeout: 30,
    })
    expect(calls[0]?.init?.headers).toMatchObject({
      accept: "application/json",
      "content-type": "application/json",
      cookie: "diario_admin_session=abc",
      origin: "https://diario.example",
      referer: "https://diario.example/",
    })
    expect(JSON.parse(calls[0]?.init?.body ?? "{}")).toMatchObject({
      baseRemoteRevision: 11,
      draft: { id: "note-1" },
    })
    expect(result).toMatchObject({
      action: "updated",
      etag: "rev-12",
      remoteVersion: 12,
    })
  })

  it("fetches Diario remote draft metadata", async () => {
    const calls: Array<{ init: Parameters<FetchLike>[1]; url: string }> = []
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ init, url })
      return {
        headers: { get: () => null },
        json: async () => ({
          data: {
            sync: {
              remoteRevision: 7,
              updatedAt: "2026-05-15T12:00:00.000Z",
            },
          },
          ok: true,
        }),
        ok: true,
        status: 200,
        text: async () => "",
      }
    }
    const client = new DiarioDraftHttpRemoteClient({
      baseUrl: "https://diario.example",
      fetchImpl,
    })

    await expect(client.fetchRemoteMeta("note 1")).resolves.toEqual({
      remoteVersion: 7,
    })
    expect(calls[0]?.url).toBe(
      "https://diario.example/api/admin/v1/tiptap-draft?noteId=note%201",
    )
    expect(calls[0]?.init).toMatchObject({
      credentials: "include",
      method: "GET",
      timeout: 30,
    })
  })

  it("treats missing remote draft metadata as a new remote note", async () => {
    const fetchImpl: FetchLike = async () => ({
      headers: { get: () => null },
      json: async () => ({
        error: {
          code: "not_found",
          message: "No encontrada.",
        },
        ok: false,
      }),
      ok: false,
      status: 404,
      text: async () => "",
    })
    const client = new DiarioDraftHttpRemoteClient({
      baseUrl: "https://diario.example",
      fetchImpl,
    })

    await expect(client.fetchRemoteMeta("note-1")).resolves.toBeNull()
  })

  it("surfaces Diario admin API errors", async () => {
    const fetchImpl: FetchLike = async () => ({
      headers: { get: () => null },
      json: async () => ({
        error: {
          code: "forbidden",
          message: "CSRF invalido.",
        },
        ok: false,
      }),
      ok: false,
      status: 403,
      text: async () => "",
    })
    const client = new DiarioDraftHttpRemoteClient({
      baseUrl: "https://diario.example",
      fetchImpl,
    })

    await expect(
      client.pushDraft({
        deviceId: "device-1",
        localVersion: 1,
        noteId: "note-1",
        remoteVersion: 0,
        slug: "note-1",
        structuredDraft: draft(),
        tiptapJson: { type: "doc" },
      }),
    ).rejects.toMatchObject<DraftRemoteError>({
      details: {
        code: "forbidden",
        status: 403,
      },
      message: "CSRF invalido.",
    })
  })
})

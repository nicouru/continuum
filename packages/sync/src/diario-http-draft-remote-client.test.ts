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

  it("fetches a canonical new draft seed from Diario", async () => {
    const calls: Array<{ init: Parameters<FetchLike>[1]; url: string }> = []
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ init, url })
      return {
        headers: { get: () => null },
        json: async () => ({
          data: {
            draft: {
              ...draft(),
              id: "seed-1",
              references: [
                {
                  author: "Author",
                  body: "Reference body",
                  id: "reference-1",
                  work: "Work",
                },
              ],
            },
            sync: { remoteRevision: 0 },
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

    const result = await client.fetchNewDraftSeed()

    expect(calls[0]?.url).toBe(
      "https://diario.example/api/admin/v1/tiptap-draft?new=1",
    )
    expect(calls[0]?.init).toMatchObject({
      credentials: "include",
      method: "GET",
    })
    expect(result?.noteId).toBe("seed-1")
    expect(result?.structuredDraft.references).toHaveLength(1)
    expect(result?.remoteVersion).toBe(0)
  })

  it("posts Diario lifecycle publish commands", async () => {
    const calls: Array<{ init: Parameters<FetchLike>[1]; url: string }> = []
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ init, url })
      return {
        headers: { get: () => null },
        json: async () => ({
          data: {
            execution: { persisted: true },
            note: { id: "note-1", status: "published" },
          },
          ok: true,
        }),
        ok: true,
        status: 202,
        text: async () => "",
      }
    }
    const client = new DiarioDraftHttpRemoteClient({
      baseUrl: "https://diario.example",
      fetchImpl,
      sessionCookie: "diario_admin_session=abc",
    })

    const result = await client.publishNote("note-1")

    expect(calls[0]?.url).toBe("https://diario.example/api/admin/v1/commands")
    expect(calls[0]?.init).toMatchObject({
      credentials: "include",
      method: "POST",
    })
    expect(JSON.parse(calls[0]?.init?.body ?? "{}")).toEqual({
      command: { noteId: "note-1", type: "note:publish" },
    })
    expect(result).toEqual({ persisted: true, status: "published" })
  })

  it("fetches a remote draft payload by note id", async () => {
    const calls: string[] = []
    const fetchImpl: FetchLike = async (url) => {
      calls.push(url)
      return {
        headers: { get: () => null },
        json: async () => ({
          data: {
            draft: draft(),
            note: {
              id: "note-1",
              slug: "note-1",
              status: "draft",
            },
            sync: { remoteRevision: 8 },
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

    await expect(client.fetchRemoteDraft("note-1")).resolves.toMatchObject({
      noteId: "note-1",
      remoteVersion: 8,
      slug: "note-1",
      status: "draft",
      structuredDraft: { id: "note-1" },
    })
    expect(calls).toEqual([
      "https://diario.example/api/admin/v1/tiptap-draft?noteId=note-1",
    ])
  })

  it("lists Diario draft notes with the bulk structured draft endpoint", async () => {
    const calls: string[] = []
    const fetchImpl: FetchLike = async (url) => {
      calls.push(url)
      return {
        headers: { get: () => null },
        json: async () => ({
          data: {
            drafts: [
              {
                draft: draft(),
                note: {
                  id: "draft-1",
                  slug: "draft-1",
                  status: "draft",
                },
                sync: { remoteRevision: 4 },
              },
            ],
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

    await expect(client.listRemoteDrafts()).resolves.toMatchObject([
      {
        noteId: "draft-1",
        remoteVersion: 4,
        slug: "draft-1",
        status: "draft",
        structuredDraft: { id: "note-1" },
      },
    ])
    expect(calls).toEqual([
      "https://diario.example/api/admin/v1/tiptap-drafts",
    ])
  })

  it("falls back to legacy notes plus per-draft payloads when bulk listing is absent", async () => {
    const calls: string[] = []
    const fetchImpl: FetchLike = async (url) => {
      calls.push(url)
      if (url.endsWith("/api/admin/v1/tiptap-drafts")) {
        return {
          headers: { get: () => null },
          json: async () => ({
            error: {
              code: "not_found",
              message: "No encontrado.",
            },
            ok: false,
          }),
          ok: false,
          status: 404,
          text: async () => "",
        }
      }
      if (url.endsWith("/api/admin/v1/notes")) {
        return {
          headers: { get: () => null },
          json: async () => ({
            data: {
              notes: [
                { id: "draft-1", slug: "draft-1", status: "draft" },
                { id: "published-1", slug: "published-1", status: "published" },
              ],
            },
            ok: true,
          }),
          ok: true,
          status: 200,
          text: async () => "",
        }
      }
      return {
        headers: { get: () => null },
        json: async () => ({
          data: {
            draft: draft(),
            sync: { remoteRevision: 4 },
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

    await expect(client.listRemoteDrafts()).resolves.toMatchObject([
      {
        noteId: "draft-1",
        remoteVersion: 4,
        slug: "draft-1",
        status: "draft",
        structuredDraft: { id: "note-1" },
      },
    ])
    expect(calls).toEqual([
      "https://diario.example/api/admin/v1/tiptap-drafts",
      "https://diario.example/api/admin/v1/notes",
      "https://diario.example/api/admin/v1/tiptap-draft?noteId=draft-1",
    ])
  })

  it("extracts the remote draft from Diario revision conflicts", async () => {
    const fetchImpl: FetchLike = async () => ({
      headers: { get: () => null },
      json: async () => ({
        error: {
          code: "conflict",
          details: {
            baseRemoteRevision: 1,
            noteId: "note-1",
            remoteDraft: {
              draft: draft(),
              note: {
                id: "note-1",
                slug: "note-1",
                status: "draft",
              },
              sync: { remoteRevision: 9 },
            },
            serverRemoteRevision: 9,
          },
          message: "La nota fue modificada online.",
        },
        version: 1,
      }),
      ok: false,
      status: 409,
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
        remoteVersion: 1,
        slug: "note-1",
        structuredDraft: draft(),
        tiptapJson: { type: "doc" },
      }),
    ).rejects.toMatchObject<DraftRemoteError>({
      details: {
        code: "conflict",
        remoteDraft: {
          noteId: "note-1",
          remoteVersion: 9,
          structuredDraft: { id: "note-1" },
        },
        serverRemoteVersion: 9,
        status: 409,
      },
    })
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

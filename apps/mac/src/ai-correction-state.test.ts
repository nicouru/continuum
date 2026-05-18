import { describe, expect, it } from "vitest"
import type { Editor } from "@tiptap/core"
import type {
  CorrectionSessionRecord,
  CorrectionSuggestion,
} from "@continuum/correction"
import type { SelectionPlainTextMap } from "@continuum/editor"
import {
  createReadyAiCorrectionState,
  createReadyAiCorrectionStateFromResult,
  getAiCorrectionSelectionIdentity,
  refreshReadyAiCorrectionForIdentity,
  type AiCorrectionSelectionIdentity,
} from "./ai-correction-state"

function makeMap(plainText: string): SelectionPlainTextMap {
  return {
    plainText,
    selectionFrom: 1,
    selectionTo: 1 + plainText.length,
    segments: [
      {
        docFrom: 1,
        docTo: 1 + plainText.length,
        plainFrom: 0,
        plainTo: plainText.length,
      },
    ],
  }
}

function makeIdentity(
  noteId: string,
  selectionKey: string,
  plainText: string,
): AiCorrectionSelectionIdentity {
  return {
    key: `${noteId}:${selectionKey}`,
    noteId,
    selectionKey,
    map: makeMap(plainText),
  }
}

function makeSuggestion(
  partial: Partial<CorrectionSuggestion> &
    Pick<
      CorrectionSuggestion,
      "original" | "replacement" | "originalOffset" | "originalLength"
    >,
): CorrectionSuggestion {
  return {
    id: "suggestion-1",
    status: "pending",
    ...partial,
  }
}

function makeSession(
  identity: AiCorrectionSelectionIdentity,
  suggestions: CorrectionSuggestion[],
): CorrectionSessionRecord {
  return {
    key: identity.key,
    noteId: identity.noteId,
    selectionKey: identity.selectionKey,
    sourceText: identity.map.plainText,
    currentText: identity.map.plainText,
    correctedText: "está línea",
    warnings: [],
    suggestions,
    updatedAt: 1000,
  }
}

function makeParagraphEditor(
  text: string,
  selection: { from: number; to: number },
) {
  return {
    state: {
      selection: {
        empty: selection.from === selection.to,
        from: selection.from,
        to: selection.to,
      },
      doc: {
        textBetween(from: number, to: number) {
          return text.slice(from - 1, to - 1)
        },
        nodesBetween(
          from: number,
          to: number,
          callback: (node: Record<string, unknown>, position: number) => false | void,
        ) {
          const shouldDescend = callback(
            {
              attrs: {},
              isBlock: true,
              isLeaf: false,
              isText: false,
              nodeSize: text.length + 2,
              type: { name: "paragraph" },
            },
            0,
          )

          if (shouldDescend === false) {
            return
          }

          const localFrom = Math.max(0, from - 1)
          const localTo = Math.max(localFrom, to - 1)
          callback(
            {
              attrs: {},
              isBlock: false,
              isLeaf: false,
              isText: true,
              nodeSize: text.length,
              text: text.slice(localFrom, localTo),
              type: { name: "text" },
            },
            from,
          )
        },
      },
    },
    destroy() {},
  } as unknown as Editor
}

describe("getAiCorrectionSelectionIdentity", () => {
  it("returns an error when there is no active note", () => {
    const editor = makeParagraphEditor("hola mundo", { from: 1, to: 5 })

    expect(getAiCorrectionSelectionIdentity(editor, null)).toEqual({
      ok: false,
      reason: "No hay nota activa.",
    })

    editor.destroy()
  })

  it("builds a stable fallback key from the selected block position", () => {
    const editor = makeParagraphEditor("hola mundo", { from: 1, to: 5 })

    const identity = getAiCorrectionSelectionIdentity(editor, "note-a")

    expect(identity).toMatchObject({
      key: "note-a:position-0",
      noteId: "note-a",
      selectionKey: "position-0",
    })
    expect("ok" in identity).toBe(false)

    editor.destroy()
  })

  it("adds a partial offset when selection starts inside a block", () => {
    const editor = makeParagraphEditor("hola mundo", { from: 3, to: 8 })

    const identity = getAiCorrectionSelectionIdentity(editor, "note-a")

    expect(identity).toMatchObject({
      key: "note-a:position-0@2",
      selectionKey: "position-0@2",
    })

    editor.destroy()
  })
})

describe("refreshReadyAiCorrectionForIdentity", () => {
  it("rebases pending suggestions when the same selection key has changed text", () => {
    const identity = makeIdentity("note-a", "block-a", "esta linea")
    const current = createReadyAiCorrectionState(
      identity,
      makeSession(identity, [
        makeSuggestion({
          original: "linea",
          originalLength: 5,
          originalOffset: 5,
          replacement: "línea",
        }),
      ]),
    )
    const nextIdentity = makeIdentity("note-a", "block-a", "\nesta linea")

    const refreshed = refreshReadyAiCorrectionForIdentity(current, nextIdentity)

    expect(refreshed).toMatchObject({
      originalText: "\nesta linea",
      map: nextIdentity.map,
    })
    expect(refreshed?.suggestions[0]).toMatchObject({
      originalOffset: 6,
      status: "pending",
    })
  })

  it("preserves a ready correction when only the selection key drifts", () => {
    const identity = makeIdentity("note-a", "position-10", "esta linea")
    const current = createReadyAiCorrectionState(
      identity,
      makeSession(identity, [
        makeSuggestion({
          original: "esta",
          originalLength: 4,
          originalOffset: 0,
          replacement: "está",
        }),
      ]),
    )
    const driftedIdentity = makeIdentity("note-a", "position-12", "esta linea")

    const refreshed = refreshReadyAiCorrectionForIdentity(current, driftedIdentity)

    expect(refreshed?.session).toEqual({
      key: "note-a:position-12",
      noteId: "note-a",
      selectionKey: "position-12",
    })
    expect(refreshed?.suggestions).toEqual(current.suggestions)
    expect(refreshed?.map).toBe(driftedIdentity.map)
  })

  it("returns null when the selected text really changed to another session", () => {
    const identity = makeIdentity("note-a", "block-a", "esta linea")
    const current = createReadyAiCorrectionState(
      identity,
      makeSession(identity, [
        makeSuggestion({
          original: "esta",
          originalLength: 4,
          originalOffset: 0,
          replacement: "está",
        }),
      ]),
    )
    const otherIdentity = makeIdentity("note-a", "block-b", "otro texto")

    expect(refreshReadyAiCorrectionForIdentity(current, otherIdentity)).toBeNull()
  })
})

describe("createReadyAiCorrectionStateFromResult", () => {
  it("creates pending suggestions from an OpenAI correction result", () => {
    const identity = makeIdentity("note-a", "block-a", "esta linea")
    const ready = createReadyAiCorrectionStateFromResult(
      identity,
      {
        correctedText: "está línea",
        originalText: "esta linea",
        source: { id: "openai", label: "OpenAI" },
        usage: { inputTokens: 10 },
        warnings: ["warning"],
      },
      identity.map,
    )

    expect(ready).toMatchObject({
      correctedText: "está línea",
      originalText: "esta linea",
      session: {
        key: "note-a:block-a",
        noteId: "note-a",
        selectionKey: "block-a",
      },
      sourceText: "esta linea",
      status: "ready",
      usage: { inputTokens: 10 },
      warnings: ["warning"],
    })
    expect(ready.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          original: "esta",
          replacement: "está",
          status: "pending",
        }),
        expect.objectContaining({
          original: "linea",
          replacement: "línea",
          status: "pending",
        }),
      ]),
    )
  })
})

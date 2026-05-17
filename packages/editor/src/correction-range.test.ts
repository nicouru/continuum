import { describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import type { CorrectionSuggestion } from "@continuum/correction"
import {
  canSafelyApplySuggestion,
  extractSelectionPlainTextMap,
  type SelectionPlainTextMap,
} from "./correction-range"

function makeSuggestion(
  partial: Partial<CorrectionSuggestion> & Pick<CorrectionSuggestion, "original" | "replacement" | "originalOffset" | "originalLength">,
): CorrectionSuggestion {
  return {
    id: "suggestion-1",
    status: "pending",
    ...partial,
  }
}

function makeMap(plainText: string, segments: SelectionPlainTextMap["segments"]): SelectionPlainTextMap {
  return {
    selectionFrom: 1,
    selectionTo: 100,
    plainText,
    segments,
  }
}

function makeParagraphEditor(paragraphs: string[]) {
  return new Editor({
    extensions: [StarterKit],
    content: {
      type: "doc",
      content: paragraphs.map((paragraph) => ({
        type: "paragraph",
        ...(paragraph
          ? { content: [{ type: "text", text: paragraph }] }
          : {}),
      })),
    },
  })
}

function getTextRanges(editor: Editor) {
  const ranges: Array<{ from: number; text: string; to: number }> = []

  editor.state.doc.descendants((node, position) => {
    if (!node.isText) {
      return
    }

    ranges.push({
      from: position,
      text: node.text ?? "",
      to: position + node.nodeSize,
    })
  })

  return ranges
}

describe("canSafelyApplySuggestion", () => {
  it("marks a suggestion stale when the mapped text changed", () => {
    const map = makeMap("esta prueba", [
      { docFrom: 1, docTo: 5, plainFrom: 0, plainTo: 4 },
      { docFrom: 5, docTo: 12, plainFrom: 5, plainTo: 12 },
    ])

    const suggestion = makeSuggestion({
      original: "esta",
      replacement: "está",
      originalOffset: 0,
      originalLength: 4,
    })

    expect(canSafelyApplySuggestion(map, suggestion)).toBe(true)
    expect(
      canSafelyApplySuggestion(
        { ...map, plainText: "esto prueba" },
        suggestion,
      ),
    ).toBe(false)
  })

  it("marks a suggestion unsafe when it spans multiple mapped segments", () => {
    const map = makeMap("esta prueba", [
      { docFrom: 1, docTo: 5, plainFrom: 0, plainTo: 4 },
      { docFrom: 5, docTo: 12, plainFrom: 5, plainTo: 12 },
    ])

    const suggestion = makeSuggestion({
      original: "esta prueba",
      replacement: "está prueba",
      originalOffset: 0,
      originalLength: 12,
    })

    expect(canSafelyApplySuggestion(map, suggestion)).toBe(false)
  })
})

describe("extractSelectionPlainTextMap", () => {
  it("matches ProseMirror textBetween for selections across paragraphs", () => {
    const editor = makeParagraphEditor(["primera linea", "segunda linea"])
    const ranges = getTextRanges(editor)
    const from = ranges[0]!.from
    const to = ranges.at(-1)!.to
    editor.commands.setTextSelection({ from, to })

    const extraction = extractSelectionPlainTextMap(editor)
    const expectedPlainText = editor.state.doc.textBetween(from, to, "\n", () => "")

    expect(extraction.ok).toBe(true)
    if (!extraction.ok) {
      editor.destroy()
      return
    }

    expect(extraction.map.plainText).toBe(expectedPlainText)
    expect(extraction.map.plainText).toBe("primera linea\nsegunda linea")
    expect(extraction.map.segments).toEqual([
      {
        docFrom: ranges[0]!.from,
        docTo: ranges[0]!.to,
        plainFrom: 0,
        plainTo: "primera linea".length,
      },
      {
        docFrom: ranges[1]!.from,
        docTo: ranges[1]!.to,
        plainFrom: "primera linea\n".length,
        plainTo: "primera linea\nsegunda linea".length,
      },
    ])

    const secondParagraphCorrection = makeSuggestion({
      original: "linea",
      replacement: "línea",
      originalOffset: extraction.map.plainText.lastIndexOf("linea"),
      originalLength: "linea".length,
    })

    expect(canSafelyApplySuggestion(extraction.map, secondParagraphCorrection)).toBe(true)

    const crossParagraphCorrection = makeSuggestion({
      original: "linea\nsegunda",
      replacement: "línea\nsegunda",
      originalOffset: extraction.map.plainText.indexOf("linea\nsegunda"),
      originalLength: "linea\nsegunda".length,
    })

    expect(canSafelyApplySuggestion(extraction.map, crossParagraphCorrection)).toBe(false)
    editor.destroy()
  })

  it("keeps empty paragraph separators aligned with textBetween", () => {
    const editor = makeParagraphEditor(["uno", "", "dos"])
    const ranges = getTextRanges(editor)
    const from = ranges[0]!.from
    const to = ranges.at(-1)!.to
    editor.commands.setTextSelection({ from, to })

    const extraction = extractSelectionPlainTextMap(editor)
    const expectedPlainText = editor.state.doc.textBetween(from, to, "\n", () => "")

    expect(extraction.ok).toBe(true)
    if (!extraction.ok) {
      editor.destroy()
      return
    }

    expect(extraction.map.plainText).toBe(expectedPlainText)
    expect(extraction.map.plainText).toBe("uno\n\ndos")
    expect(extraction.map.segments.map((segment) => segment.plainFrom)).toEqual([
      0,
      "uno\n\n".length,
    ])
    editor.destroy()
  })
})

import { describe, expect, it } from "vitest"
import { Editor, Mark, Node } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import {
  refreshCorrectionSuggestionStatuses,
  shiftSuggestionOffsets,
  type CorrectionSuggestion,
} from "@continuum/correction"
import {
  applyCorrectionSuggestionToEditor,
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

const TestInlineMathNode = Node.create({
  name: "inlineMath",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      tex: {
        default: "",
      },
    }
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, HTMLAttributes.tex]
  },
})

const TestReferenceInsertNode = Node.create({
  name: "referenceInsert",
  group: "block",
  content: "inline*",

  renderHTML({ HTMLAttributes }) {
    return ["blockquote", HTMLAttributes, 0]
  },
})

const TestCitationMark = Mark.create({
  name: "citation",

  addAttributes() {
    return {
      citationId: {
        default: null,
      },
      visibleNumber: {
        default: "",
      },
    }
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0]
  },
})

function makeStructuredEditor() {
  return new Editor({
    extensions: [
      StarterKit,
      TestInlineMathNode,
      TestReferenceInsertNode,
      TestCitationMark,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "algebraica " },
            { type: "inlineMath", attrs: { tex: "x^y" } },
            { type: "text", text: ", la mujer" },
          ],
        },
        {
          type: "referenceInsert",
          content: [{ type: "text", text: "cita con error" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "eser",
              marks: [
                {
                  type: "citation",
                  attrs: { citationId: "citation-1", visibleNumber: "8" },
                },
              ],
            },
          ],
        },
      ],
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
  it("returns ok false for an empty selection", () => {
    const editor = makeParagraphEditor(["esta en casa"])
    const [range] = getTextRanges(editor)
    editor.commands.setTextSelection(range!.from)

    expect(extractSelectionPlainTextMap(editor)).toEqual({
      ok: false,
      reason: "No hay texto seleccionado.",
    })
    editor.destroy()
  })

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

  it("keeps correction available across inline math and reference blocks", () => {
    const editor = makeStructuredEditor()
    const ranges = getTextRanges(editor)
    const from = ranges[0]!.from
    const to = ranges[2]!.to
    editor.commands.setTextSelection({ from, to })

    const extraction = extractSelectionPlainTextMap(editor)

    expect(extraction.ok).toBe(true)
    if (!extraction.ok) {
      editor.destroy()
      return
    }

    expect(extraction.map.plainText).toBe(
      "algebraica $x^y$, la mujer\ncita con error",
    )
    expect(extraction.map.segments).toEqual([
      {
        docFrom: ranges[0]!.from,
        docTo: ranges[0]!.to,
        plainFrom: 0,
        plainTo: "algebraica ".length,
      },
      {
        docFrom: ranges[1]!.from,
        docTo: ranges[1]!.to,
        plainFrom: "algebraica $x^y$".length,
        plainTo: "algebraica $x^y$, la mujer".length,
      },
      {
        docFrom: ranges[2]!.from,
        docTo: ranges[2]!.to,
        plainFrom: "algebraica $x^y$, la mujer\n".length,
        plainTo: "algebraica $x^y$, la mujer\ncita con error".length,
      },
    ])

    const referenceCorrection = makeSuggestion({
      original: "error",
      replacement: "errata",
      originalOffset: extraction.map.plainText.indexOf("error"),
      originalLength: "error".length,
    })

    const mathCorrection = makeSuggestion({
      original: "$x^y$",
      replacement: "$x^2$",
      originalOffset: extraction.map.plainText.indexOf("$x^y$"),
      originalLength: "$x^y$".length,
    })

    expect(canSafelyApplySuggestion(extraction.map, referenceCorrection)).toBe(true)
    expect(canSafelyApplySuggestion(extraction.map, mathCorrection)).toBe(false)
    editor.destroy()
  })

  it("applies corrections inside cited text without dropping citation marks", () => {
    const editor = makeStructuredEditor()
    const ranges = getTextRanges(editor)
    const citedRange = ranges.at(-1)!
    editor.commands.setTextSelection({ from: citedRange.from, to: citedRange.to })

    const extraction = extractSelectionPlainTextMap(editor)
    expect(extraction.ok).toBe(true)
    if (!extraction.ok) {
      editor.destroy()
      return
    }

    const suggestion = makeSuggestion({
      original: "eser",
      replacement: "ser",
      originalOffset: 0,
      originalLength: "eser".length,
    })

    expect(applyCorrectionSuggestionToEditor(editor, extraction.map, suggestion)).toEqual({
      status: "applied",
    })

    const json = editor.getJSON()
    const citedText = json.content?.[2]?.content?.[0]

    expect(citedText?.text).toBe("ser")
    expect(citedText?.marks).toEqual([
      {
        type: "citation",
        attrs: { citationId: "citation-1", visibleNumber: "8" },
      },
    ])
    editor.destroy()
  })

  it("applies an equal-length correction even if the editor selection moved to the panel", () => {
    const editor = makeParagraphEditor(["esta en casa"])
    const [range] = getTextRanges(editor)
    editor.commands.setTextSelection({ from: range!.from, to: range!.to })

    const extraction = extractSelectionPlainTextMap(editor)
    expect(extraction.ok).toBe(true)
    if (!extraction.ok) {
      editor.destroy()
      return
    }

    editor.commands.setTextSelection(range!.from)

    const suggestion = makeSuggestion({
      original: "en",
      replacement: "el",
      originalOffset: "esta ".length,
      originalLength: "en".length,
    })

    expect(applyCorrectionSuggestionToEditor(editor, extraction.map, suggestion)).toEqual({
      status: "applied",
    })

    const afterApply = extractSelectionPlainTextMap(editor)
    expect(afterApply.ok).toBe(true)
    if (afterApply.ok) {
      expect(afterApply.map.plainText).toBe("esta el casa")
    }
    editor.destroy()
  })

  it("applies a pure insertion after the preceding word", () => {
    const editor = makeParagraphEditor(["hola mundo"])
    const [range] = getTextRanges(editor)
    editor.commands.setTextSelection({ from: range!.from, to: range!.to })

    const extraction = extractSelectionPlainTextMap(editor)
    expect(extraction.ok).toBe(true)
    if (!extraction.ok) {
      editor.destroy()
      return
    }

    const suggestion = makeSuggestion({
      original: "",
      replacement: "muy ",
      originalOffset: "hola ".length,
      originalLength: 0,
    })

    expect(canSafelyApplySuggestion(extraction.map, suggestion)).toBe(true)
    expect(applyCorrectionSuggestionToEditor(editor, extraction.map, suggestion)).toEqual({
      status: "applied",
    })

    const afterApply = extractSelectionPlainTextMap(editor)
    expect(afterApply.ok).toBe(true)
    if (afterApply.ok) {
      expect(afterApply.map.plainText).toBe("hola muy mundo")
    }
    editor.destroy()
  })

  it("returns stale when the mapped text changed before apply", () => {
    const editor = makeParagraphEditor(["esta prueba"])
    const [range] = getTextRanges(editor)
    editor.commands.setTextSelection({ from: range!.from, to: range!.to })

    const extraction = extractSelectionPlainTextMap(editor)
    expect(extraction.ok).toBe(true)
    if (!extraction.ok) {
      editor.destroy()
      return
    }

    const suggestion = makeSuggestion({
      original: "esta",
      replacement: "está",
      originalOffset: 0,
      originalLength: "esta".length,
    })

    editor.view.dispatch(editor.state.tr.insertText("x", range!.from))

    expect(applyCorrectionSuggestionToEditor(editor, extraction.map, suggestion)).toEqual({
      status: "stale",
    })
    editor.destroy()
  })

  it("keeps later text intact after a deletion and a later suggestion", () => {
    const editor = makeParagraphEditor(["sobre valorar esar"])
    const [range] = getTextRanges(editor)
    editor.commands.setTextSelection({ from: range!.from, to: range!.to })

    const extraction = extractSelectionPlainTextMap(editor)
    expect(extraction.ok).toBe(true)
    if (!extraction.ok) {
      editor.destroy()
      return
    }

    let suggestions: CorrectionSuggestion[] = [
      {
        id: "remove-sobre",
        original: "sobre",
        originalLength: "sobre".length,
        originalOffset: 0,
        replacement: "",
        status: "pending",
      },
      {
        id: "esar",
        original: "esar",
        originalLength: "esar".length,
        originalOffset: "sobre valorar ".length,
        replacement: "estar",
        status: "pending",
      },
    ]

    const first = suggestions[0]!
    expect(applyCorrectionSuggestionToEditor(editor, extraction.map, first)).toEqual({
      status: "applied",
    })

    suggestions = shiftSuggestionOffsets(
      suggestions.map((item) =>
        item.id === first.id ? { ...item, status: "applied" } : item,
      ),
      first.originalOffset,
      first.originalLength,
      first.replacement.length - first.originalLength,
    )

    const afterDelete = extractSelectionPlainTextMap(editor)
    expect(afterDelete.ok).toBe(true)
    if (!afterDelete.ok) {
      editor.destroy()
      return
    }

    suggestions = refreshCorrectionSuggestionStatuses(suggestions, afterDelete.map.plainText)
    const second = suggestions.find((item) => item.id === "esar")!

    expect(applyCorrectionSuggestionToEditor(editor, afterDelete.map, second)).toEqual({
      status: "applied",
    })
    expect(editor.state.doc.textContent).toBe(" valorar estar")
    editor.destroy()
  })

  it("blocks corrections that cross inline math", () => {
    const editor = makeStructuredEditor()
    const ranges = getTextRanges(editor)
    const from = ranges[0]!.from
    const to = ranges[1]!.to
    editor.commands.setTextSelection({ from, to })

    const extraction = extractSelectionPlainTextMap(editor)
    expect(extraction.ok).toBe(true)
    if (!extraction.ok) {
      editor.destroy()
      return
    }

    const crossMathCorrection = makeSuggestion({
      original: "algebraica $x^y$",
      replacement: "algebraica $x^2$",
      originalOffset: 0,
      originalLength: "algebraica $x^y$".length,
    })

    expect(canSafelyApplySuggestion(extraction.map, crossMathCorrection)).toBe(false)
    expect(
      applyCorrectionSuggestionToEditor(editor, extraction.map, crossMathCorrection),
    ).toMatchObject({
      status: "unsafe",
    })
    editor.destroy()
  })

  it("can apply multiple suggestions one by one after text length changes", () => {
    const editor = makeParagraphEditor(["sobre valorar esas esar"])
    const [range] = getTextRanges(editor)
    editor.commands.setTextSelection({ from: range!.from, to: range!.to })

    const initialExtraction = extractSelectionPlainTextMap(editor)
    expect(initialExtraction.ok).toBe(true)
    if (!initialExtraction.ok) {
      editor.destroy()
      return
    }

    let workingMap = initialExtraction.map
    let suggestions: CorrectionSuggestion[] = [
      {
        id: "remove-sobre",
        original: "sobre",
        originalLength: "sobre".length,
        originalOffset: 0,
        replacement: "",
        status: "pending",
      },
      {
        id: "valorar",
        original: "valorar",
        originalLength: "valorar".length,
        originalOffset: "sobre ".length,
        replacement: "sobrevalorar",
        status: "pending",
      },
      {
        id: "esas",
        original: "esas",
        originalLength: "esas".length,
        originalOffset: "sobre valorar ".length,
        replacement: "esa",
        status: "pending",
      },
      {
        id: "esar",
        original: "esar",
        originalLength: "esar".length,
        originalOffset: "sobre valorar esas ".length,
        replacement: "estar",
        status: "pending",
      },
    ]

    const first = suggestions[0]!
    expect(applyCorrectionSuggestionToEditor(editor, workingMap, first)).toEqual({
      status: "applied",
    })

    suggestions = shiftSuggestionOffsets(
      suggestions.map((item) =>
        item.id === first.id ? { ...item, status: "applied" } : item,
      ),
      first.originalOffset,
      first.originalLength,
      first.replacement.length - first.originalLength,
    )

    const afterFirst = extractSelectionPlainTextMap(editor)
    expect(afterFirst.ok).toBe(true)
    if (!afterFirst.ok) {
      editor.destroy()
      return
    }

    workingMap = afterFirst.map
    suggestions = refreshCorrectionSuggestionStatuses(suggestions, workingMap.plainText)

    expect(workingMap.plainText).toBe(" valorar esas esar")
    expect(suggestions.map((item) => [item.id, item.status])).toEqual([
      ["remove-sobre", "applied"],
      ["valorar", "pending"],
      ["esas", "pending"],
      ["esar", "pending"],
    ])

    const second = suggestions.find((item) => item.id === "valorar")!
    expect(applyCorrectionSuggestionToEditor(editor, workingMap, second)).toEqual({
      status: "applied",
    })

    editor.destroy()
  })
})

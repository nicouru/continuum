import { describe, expect, it } from "vitest"
import {
  buildCorrectionDiffChanges,
  createCorrectionSuggestions,
  findCorrectionSession,
  normalizeCorrectionSessionRecords,
  parseOpenAiCorrectionResponseBody,
  rebaseCorrectionSuggestionOffsets,
  refreshCorrectionSuggestionStatuses,
  renderCorrectedPreview,
  shiftSuggestionOffsets,
  upsertCorrectionSession,
  validateCorrectionModelResponse,
} from "./index"

describe("validateCorrectionModelResponse", () => {
  it("accepts strict correction payloads", () => {
    expect(
      validateCorrectionModelResponse({
        corrected_text: "está bien",
        warnings: [],
      }),
    ).toEqual({
      corrected_text: "está bien",
      warnings: [],
    })
  })

  it("rejects malformed payloads", () => {
    expect(() => validateCorrectionModelResponse({ corrected_text: 1 })).toThrow(
      /corrected_text/,
    )
  })
})

describe("parseOpenAiCorrectionResponseBody", () => {
  it("extracts structured JSON from Responses API output", () => {
    const parsed = parseOpenAiCorrectionResponseBody({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                corrected_text: "está",
                warnings: ["revisar contexto"],
              }),
            },
          ],
        },
      ],
    })

    expect(parsed).toEqual({
      corrected_text: "está",
      warnings: ["revisar contexto"],
    })
  })
})

describe("buildCorrectionDiffChanges", () => {
  it("detects a simple accent correction", () => {
    const changes = buildCorrectionDiffChanges("esta", "está")

    expect(changes).toEqual([
      {
        original: "esta",
        replacement: "está",
        originalOffset: 0,
        originalLength: 4,
      },
    ])
  })

  it("detects multiple corrections in one paragraph", () => {
    const original = "esta frase tiene un error gramatical"
    const corrected = "está frase tiene un error gramatical"
    const changes = buildCorrectionDiffChanges(original, corrected)

    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      original: "esta",
      replacement: "está",
      originalOffset: 0,
    })
  })

  it("preserves paragraph breaks", () => {
    const original = "primera linea\n\nsegunda linea"
    const corrected = "primera línea\n\nsegunda línea"
    const changes = buildCorrectionDiffChanges(original, corrected)

    expect(changes).toEqual([
      expect.objectContaining({ original: "linea", replacement: "línea", originalOffset: 8 }),
      expect.objectContaining({ original: "linea", replacement: "línea", originalOffset: 23 }),
    ])
  })

  it("returns no changes when corrected text equals original", () => {
    expect(buildCorrectionDiffChanges("sin cambios", "sin cambios")).toEqual([])
    expect(createCorrectionSuggestions("sin cambios", "sin cambios")).toEqual([])
  })
})

describe("shiftSuggestionOffsets", () => {
  it("shifts later suggestions after an apply changes text length", () => {
    const suggestions = createCorrectionSuggestions("aa linea", "aaa línea")
    const [first, second] = suggestions

    expect(second).toBeDefined()

    const lengthDelta = first!.replacement.length - first!.originalLength
    expect(lengthDelta).toBeGreaterThan(0)

    const shifted = shiftSuggestionOffsets(
      suggestions.map((item) =>
        item.id === first!.id ? { ...item, status: "applied" } : item,
      ),
      first!.originalOffset,
      first!.originalLength,
      lengthDelta,
    )

    expect(shifted.find((item) => item.id === second!.id)?.status).toBe("pending")
    expect(shifted.find((item) => item.id === second!.id)?.originalOffset).toBe(
      second!.originalOffset + lengthDelta,
    )
  })

  it("keeps later deletion corrections pending after an earlier deletion", () => {
    const suggestions = [
      {
        id: "remove-sobre",
        original: "sobre",
        originalLength: "sobre".length,
        originalOffset: 0,
        replacement: "",
        status: "pending" as const,
      },
      {
        id: "esar",
        original: "esar",
        originalLength: "esar".length,
        originalOffset: "sobre valorar ".length,
        replacement: "estar",
        status: "pending" as const,
      },
    ]

    const shifted = shiftSuggestionOffsets(
      suggestions.map((item) =>
        item.id === "remove-sobre" ? { ...item, status: "applied" as const } : item,
      ),
      0,
      "sobre".length,
      -"sobre".length,
    )
    const currentText = " valorar esar"

    expect(shifted.find((item) => item.id === "esar")).toMatchObject({
      originalOffset: " valorar ".length,
      status: "pending",
    })
    expect(refreshCorrectionSuggestionStatuses(shifted, currentText)).toMatchObject([
      { id: "remove-sobre", status: "applied" },
      { id: "esar", status: "pending" },
    ])
  })

  it("marks only mismatched pending suggestions stale", () => {
    const suggestions = [
      {
        id: "already-applied",
        original: "esta",
        originalLength: "esta".length,
        originalOffset: 0,
        replacement: "está",
        status: "applied" as const,
      },
      {
        id: "still-current",
        original: "linea",
        originalLength: "linea".length,
        originalOffset: "está ".length,
        replacement: "línea",
        status: "pending" as const,
      },
      {
        id: "changed-by-user",
        original: "aser",
        originalLength: "aser".length,
        originalOffset: "está linea ".length,
        replacement: "hacer",
        status: "pending" as const,
      },
    ]

    expect(
      refreshCorrectionSuggestionStatuses(suggestions, "está linea hacer"),
    ).toMatchObject([
      { id: "already-applied", status: "applied" },
      { id: "still-current", status: "pending" },
      { id: "changed-by-user", status: "stale" },
    ])
  })
})

describe("rebaseCorrectionSuggestionOffsets", () => {
  it("keeps later suggestions pending when the user inserts text before them", () => {
    const suggestions = createCorrectionSuggestions(
      "esta linea tiene aser",
      "está línea tiene hacer",
    )
    const currentText = "nota: esta linea tiene aser"

    expect(
      rebaseCorrectionSuggestionOffsets(
        suggestions,
        "esta linea tiene aser",
        currentText,
      ),
    ).toMatchObject([
      { original: "esta", originalOffset: "nota: ".length, status: "pending" },
      {
        original: "linea",
        originalOffset: "nota: esta ".length,
        status: "pending",
      },
      {
        original: "aser",
        originalOffset: "nota: esta linea tiene ".length,
        status: "pending",
      },
    ])
  })

  it("marks ambiguous moved suggestions stale", () => {
    const suggestions = [
      {
        id: "linea",
        original: "linea",
        originalLength: "linea".length,
        originalOffset: 0,
        replacement: "línea",
        status: "pending" as const,
      },
    ]

    const [rebased] = rebaseCorrectionSuggestionOffsets(
      suggestions,
      "linea",
      "x linea x linea",
    )

    expect(rebased).toMatchObject({
      status: "stale",
    })
  })
})

describe("renderCorrectedPreview", () => {
  it("highlights changed fragments", () => {
    expect(renderCorrectedPreview("esta", "está")).toEqual([
      { kind: "changed", text: "está" },
    ])
  })
})

describe("correction session records", () => {
  it("upserts by key and keeps the newest records first", () => {
    const oldSession = {
      key: "note-1:block-a",
      noteId: "note-1",
      selectionKey: "block-a",
      sourceText: "esta linea",
      currentText: "esta linea",
      correctedText: "está línea",
      warnings: [],
      suggestions: createCorrectionSuggestions("esta linea", "está línea"),
      updatedAt: 10,
    }
    const updatedSession = {
      ...oldSession,
      currentText: "está linea",
      updatedAt: 20,
    }
    const otherSession = {
      ...oldSession,
      key: "note-1:block-b",
      selectionKey: "block-b",
      updatedAt: 15,
    }

    const records = upsertCorrectionSession(
      upsertCorrectionSession([oldSession], otherSession),
      updatedSession,
    )

    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({
      key: "note-1:block-a",
      currentText: "está linea",
      updatedAt: 20,
    })
    expect(findCorrectionSession(records, "note-1:block-b")).toMatchObject({
      selectionKey: "block-b",
    })
  })

  it("normalizes stored records and drops malformed entries", () => {
    expect(
      normalizeCorrectionSessionRecords([
        {
          key: "note-1:block-a",
          noteId: "note-1",
          selectionKey: "block-a",
          currentText: "esta",
          correctedText: "está",
          warnings: [1, "revisar"],
          suggestions: [
            {
              id: "s-1",
              original: "esta",
              replacement: "está",
              originalOffset: 0,
              originalLength: 4,
              status: "pending",
            },
          ],
          updatedAt: 1,
        },
        { key: "broken" },
      ]),
    ).toEqual([
      expect.objectContaining({
        key: "note-1:block-a",
        sourceText: "esta",
        warnings: ["revisar"],
      }),
    ])
  })
})

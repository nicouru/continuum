import { describe, expect, it } from "vitest"
import {
  buildCorrectionDiffChanges,
  createCorrectionSuggestions,
  parseOpenAiCorrectionResponseBody,
  renderCorrectedPreview,
  shiftSuggestionOffsets,
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
})

describe("renderCorrectedPreview", () => {
  it("highlights changed fragments", () => {
    expect(renderCorrectedPreview("esta", "está")).toEqual([
      { kind: "changed", text: "está" },
    ])
  })
})

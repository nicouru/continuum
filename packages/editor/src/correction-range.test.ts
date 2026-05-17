import { describe, expect, it } from "vitest"
import type { CorrectionSuggestion } from "@continuum/correction"
import {
  canSafelyApplySuggestion,
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

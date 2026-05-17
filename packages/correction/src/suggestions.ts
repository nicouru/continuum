import { buildCorrectionDiffChanges } from "./diff"
import type { CorrectionSuggestion, CorrectionSuggestionStatus } from "./types"

let suggestionCounter = 0

function nextSuggestionId() {
  suggestionCounter += 1
  return `correction-${suggestionCounter}`
}

export function createCorrectionSuggestions(
  originalText: string,
  correctedText: string,
  status: CorrectionSuggestionStatus = "pending",
): CorrectionSuggestion[] {
  return buildCorrectionDiffChanges(originalText, correctedText).map((change) => ({
    id: nextSuggestionId(),
    original: change.original,
    replacement: change.replacement,
    originalOffset: change.originalOffset,
    originalLength: change.originalLength,
    status,
  }))
}

export function shiftSuggestionOffsets(
  suggestions: CorrectionSuggestion[],
  appliedOffset: number,
  appliedOriginalLength: number,
  lengthDelta: number,
): CorrectionSuggestion[] {
  if (lengthDelta === 0) {
    return suggestions
  }

  const appliedEnd = appliedOffset + appliedOriginalLength

  return suggestions.map((suggestion) => {
    if (suggestion.status !== "pending") {
      return suggestion
    }

    if (suggestion.originalOffset >= appliedEnd) {
      return {
        ...suggestion,
        originalOffset: suggestion.originalOffset + lengthDelta,
      }
    }

    if (
      suggestion.originalOffset < appliedOffset &&
      suggestion.originalOffset + suggestion.originalLength > appliedOffset
    ) {
      return { ...suggestion, status: "stale" as const }
    }

    return suggestion
  })
}

export function refreshCorrectionSuggestionStatuses(
  suggestions: CorrectionSuggestion[],
  currentText: string,
): CorrectionSuggestion[] {
  return suggestions.map((suggestion) => {
    if (suggestion.status !== "pending") {
      return suggestion
    }

    const currentFragment = currentText.slice(
      suggestion.originalOffset,
      suggestion.originalOffset + suggestion.originalLength,
    )

    return currentFragment === suggestion.original
      ? suggestion
      : { ...suggestion, status: "stale" as const }
  })
}

export function renderCorrectedPreview(
  originalText: string,
  correctedText: string,
): Array<{ kind: "unchanged" | "changed"; text: string }> {
  const ops = buildCorrectionDiffChanges(originalText, correctedText)
  if (ops.length === 0) {
    return [{ kind: "unchanged", text: originalText }]
  }

  const segments: Array<{ kind: "unchanged" | "changed"; text: string }> = []
  let cursor = 0

  for (const change of ops) {
    if (cursor < change.originalOffset) {
      segments.push({
        kind: "unchanged",
        text: originalText.slice(cursor, change.originalOffset),
      })
    }

    if (change.replacement.length > 0) {
      segments.push({ kind: "changed", text: change.replacement })
    }

    cursor = change.originalOffset + change.originalLength
  }

  if (cursor < originalText.length) {
    segments.push({ kind: "unchanged", text: originalText.slice(cursor) })
  }

  return segments
}

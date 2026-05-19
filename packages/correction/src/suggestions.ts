import { buildCorrectionDiffChanges } from "./diff"
import type { CorrectionSuggestion, CorrectionSuggestionStatus } from "./types"

function nextSuggestionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `correction-${crypto.randomUUID()}`
  }

  return `correction-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
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
      suggestion.originalOffset >= appliedOffset &&
      suggestion.originalOffset < appliedEnd
    ) {
      return { ...suggestion, status: "stale" as const }
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

function findOccurrences(text: string, fragment: string) {
  if (!fragment) {
    return []
  }

  const occurrences: number[] = []
  let cursor = text.indexOf(fragment)

  while (cursor !== -1) {
    occurrences.push(cursor)
    cursor = text.indexOf(fragment, cursor + Math.max(1, fragment.length))
  }

  return occurrences
}

function countSharedSuffix(left: string, right: string) {
  const limit = Math.min(left.length, right.length)

  for (let index = 0; index < limit; index += 1) {
    if (left[left.length - 1 - index] !== right[right.length - 1 - index]) {
      return index
    }
  }

  return limit
}

function countSharedPrefix(left: string, right: string) {
  const limit = Math.min(left.length, right.length)

  for (let index = 0; index < limit; index += 1) {
    if (left[index] !== right[index]) {
      return index
    }
  }

  return limit
}

function scoreOccurrenceContext(
  previousText: string,
  currentText: string,
  previousOffset: number,
  currentOffset: number,
  length: number,
) {
  const contextSize = 18
  const previousBefore = previousText.slice(
    Math.max(0, previousOffset - contextSize),
    previousOffset,
  )
  const previousAfter = previousText.slice(
    previousOffset + length,
    previousOffset + length + contextSize,
  )
  const currentBefore = currentText.slice(
    Math.max(0, currentOffset - contextSize),
    currentOffset,
  )
  const currentAfter = currentText.slice(
    currentOffset + length,
    currentOffset + length + contextSize,
  )

  return (
    countSharedSuffix(previousBefore, currentBefore) +
    countSharedPrefix(previousAfter, currentAfter)
  )
}

export function rebaseCorrectionSuggestionOffsets(
  suggestions: CorrectionSuggestion[],
  previousText: string,
  currentText: string,
): CorrectionSuggestion[] {
  return suggestions.map((suggestion) => {
    if (suggestion.status !== "pending" && suggestion.status !== "stale") {
      return suggestion
    }

    if (suggestion.status === "stale") {
      const fragmentAtOffset = currentText.slice(
        suggestion.originalOffset,
        suggestion.originalOffset + suggestion.originalLength,
      )
      const replacementAtOffset = currentText.slice(
        suggestion.originalOffset,
        suggestion.originalOffset + suggestion.replacement.length,
      )

      if (
        fragmentAtOffset !== suggestion.original &&
        replacementAtOffset === suggestion.replacement
      ) {
        return suggestion
      }
    }

    const rebasedSuggestion =
      suggestion.status === "stale"
        ? { ...suggestion, status: "pending" as const }
        : suggestion

    const directMatch = currentText.slice(
      rebasedSuggestion.originalOffset,
      rebasedSuggestion.originalOffset + rebasedSuggestion.originalLength,
    )

    if (directMatch === rebasedSuggestion.original) {
      return rebasedSuggestion
    }

    const occurrences = findOccurrences(currentText, rebasedSuggestion.original)

    if (occurrences.length === 0) {
      return { ...rebasedSuggestion, status: "stale" as const }
    }

    if (occurrences.length === 1) {
      return { ...rebasedSuggestion, originalOffset: occurrences[0]! }
    }

    const scored = occurrences
      .map((offset) => ({
        offset,
        score: scoreOccurrenceContext(
          previousText,
          currentText,
          rebasedSuggestion.originalOffset,
          offset,
          rebasedSuggestion.originalLength,
        ),
        distance: Math.abs(offset - rebasedSuggestion.originalOffset),
      }))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score
        }
        return left.distance - right.distance
      })

    const [best, second] = scored

    if (!best || best.score === 0 || (second && second.score === best.score)) {
      return { ...rebasedSuggestion, status: "stale" as const }
    }

    return { ...rebasedSuggestion, originalOffset: best.offset }
  })
}

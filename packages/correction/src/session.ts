import type { CorrectionSuggestion, CorrectionUsageMetadata } from "./types"

export const MAX_CORRECTION_SESSIONS = 120

export type CorrectionSessionIdentity = {
  key: string
  noteId: string
  selectionKey: string
}

export type CorrectionSessionRecord = CorrectionSessionIdentity & {
  sourceText: string
  currentText: string
  correctedText: string
  warnings: string[]
  suggestions: CorrectionSuggestion[]
  usage?: CorrectionUsageMetadata
  updatedAt: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isCorrectionSuggestion(value: unknown): value is CorrectionSuggestion {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === "string" &&
    typeof value.original === "string" &&
    typeof value.replacement === "string" &&
    typeof value.originalOffset === "number" &&
    typeof value.originalLength === "number" &&
    typeof value.status === "string"
  )
}

function normalizeCorrectionSessionRecord(
  value: unknown,
): CorrectionSessionRecord | null {
  if (!isRecord(value)) {
    return null
  }

  if (
    typeof value.key !== "string" ||
    typeof value.noteId !== "string" ||
    typeof value.selectionKey !== "string" ||
    typeof value.currentText !== "string" ||
    typeof value.correctedText !== "string" ||
    !Array.isArray(value.warnings) ||
    !Array.isArray(value.suggestions)
  ) {
    return null
  }

  const suggestions = value.suggestions.filter(isCorrectionSuggestion)

  return {
    key: value.key,
    noteId: value.noteId,
    selectionKey: value.selectionKey,
    sourceText:
      typeof value.sourceText === "string" ? value.sourceText : value.currentText,
    currentText: value.currentText,
    correctedText: value.correctedText,
    warnings: value.warnings.filter((warning): warning is string => typeof warning === "string"),
    suggestions,
    usage: isRecord(value.usage)
      ? (value.usage as CorrectionUsageMetadata)
      : undefined,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
  }
}

export function normalizeCorrectionSessionRecords(
  value: unknown,
): CorrectionSessionRecord[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map(normalizeCorrectionSessionRecord)
    .filter((record): record is CorrectionSessionRecord => Boolean(record))
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_CORRECTION_SESSIONS)
}

export function findCorrectionSession(
  records: readonly CorrectionSessionRecord[],
  key: string,
) {
  return records.find((record) => record.key === key) ?? null
}

export function upsertCorrectionSession(
  records: readonly CorrectionSessionRecord[],
  session: CorrectionSessionRecord,
  max = MAX_CORRECTION_SESSIONS,
) {
  return [session, ...records.filter((record) => record.key !== session.key)]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, max)
}

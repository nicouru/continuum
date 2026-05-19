import type { Editor } from "@tiptap/core"
import {
  extractSelectionPlainTextMap,
  type SelectionPlainTextMap,
} from "@continuum/editor"
import {
  createCorrectionSuggestions,
  rebaseCorrectionSuggestionOffsets,
  type CorrectionResult,
  type CorrectionSessionIdentity,
  type CorrectionSessionRecord,
  type CorrectionSuggestion,
  type CorrectionUsageMetadata,
} from "@continuum/correction"

export type ContinuumAiPanelCorrectionState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "error"
      message: string
    }
  | {
      status: "ready"
      session?: CorrectionSessionIdentity
      sourceText: string
      originalText: string
      correctedText: string
      warnings: string[]
      suggestions: CorrectionSuggestion[]
      map: SelectionPlainTextMap
      usage?: CorrectionUsageMetadata
    }

export type AiCorrectionReadyState = Extract<
  ContinuumAiPanelCorrectionState,
  { status: "ready" }
>

export type AiCorrectionSelectionIdentity = CorrectionSessionIdentity & {
  map: SelectionPlainTextMap
}

function getNodeStringAttribute(attrs: Record<string, unknown>, key: string) {
  const value = attrs[key]
  return typeof value === "string" ? value.trim() : ""
}

function isAiCorrectionBlockType(typeName: string) {
  return (
    typeName === "paragraph" ||
    typeName === "structuredParagraph" ||
    typeName === "aphorism" ||
    typeName === "referenceInsert"
  )
}

export function getAiCorrectionSelectionIdentity(
  editor: Editor | null,
  noteId: string | null,
): AiCorrectionSelectionIdentity | { ok: false; reason: string } {
  if (!noteId) {
    return { ok: false, reason: "No hay nota activa." }
  }

  const extraction = extractSelectionPlainTextMap(editor)

  if (!extraction.ok) {
    return extraction
  }

  const { selectionFrom, selectionTo } = extraction.map
  const blockKeys: string[] = []

  editor?.state.doc.nodesBetween(selectionFrom, selectionTo, (node, position) => {
    if (!node.isBlock || !isAiCorrectionBlockType(node.type.name)) {
      return
    }

    const attrs = node.attrs as Record<string, unknown>
    const blockId =
      getNodeStringAttribute(attrs, "blockId") ||
      getNodeStringAttribute(attrs, "referenceInsertId") ||
      `position-${position}`
    const contentFrom = position + 1
    const relativeFrom = Math.max(0, Math.max(selectionFrom, contentFrom) - contentFrom)
    const partialPrefix = relativeFrom > 0 ? `@${relativeFrom}` : ""

    blockKeys.push(`${blockId}${partialPrefix}`)
    return false
  })

  const selectionKey =
    blockKeys.length > 0
      ? blockKeys.join("|")
      : `range-${selectionFrom}-${selectionTo}`

  return {
    key: `${noteId}:${selectionKey}`,
    noteId,
    selectionKey,
    map: extraction.map,
  }
}

export function isAiCorrectionSelectionError(
  value: AiCorrectionSelectionIdentity | { ok: false; reason: string },
): value is { ok: false; reason: string } {
  return "ok" in value && value.ok === false
}

export function createReadyAiCorrectionState(
  identity: AiCorrectionSelectionIdentity,
  session: CorrectionSessionRecord,
): AiCorrectionReadyState {
  return {
    status: "ready",
    session: {
      key: identity.key,
      noteId: identity.noteId,
      selectionKey: identity.selectionKey,
    },
    sourceText: session.sourceText,
    originalText: identity.map.plainText,
    correctedText: session.correctedText,
    warnings: session.warnings,
    suggestions: rebaseCorrectionSuggestionOffsets(
      session.suggestions,
      session.currentText,
      identity.map.plainText,
    ),
    map: identity.map,
    usage: session.usage,
  }
}

export function createReadyAiCorrectionStateFromResult(
  identity: AiCorrectionSelectionIdentity,
  result: CorrectionResult,
  map: SelectionPlainTextMap,
): AiCorrectionReadyState {
  return {
    status: "ready",
    session: {
      key: identity.key,
      noteId: identity.noteId,
      selectionKey: identity.selectionKey,
    },
    sourceText: result.originalText,
    originalText: result.originalText,
    correctedText: result.correctedText,
    warnings: result.warnings,
    suggestions: createCorrectionSuggestions(
      result.originalText,
      result.correctedText,
    ),
    map,
    usage: result.usage,
  }
}

export function refreshReadyAiCorrectionForIdentity(
  current: AiCorrectionReadyState,
  identity: AiCorrectionSelectionIdentity,
): AiCorrectionReadyState | null {
  if (current.session?.key === identity.key) {
    return {
      ...current,
      originalText: identity.map.plainText,
      map: identity.map,
      suggestions: rebaseCorrectionSuggestionOffsets(
        current.suggestions,
        current.originalText,
        identity.map.plainText,
      ),
    }
  }

  if (
    current.session?.noteId === identity.noteId &&
    current.originalText === identity.map.plainText
  ) {
    return {
      ...current,
      session: {
        key: identity.key,
        noteId: identity.noteId,
        selectionKey: identity.selectionKey,
      },
      map: identity.map,
    }
  }

  return null
}

export function createAiCorrectionSessionRecord(
  correction: AiCorrectionReadyState,
): CorrectionSessionRecord | null {
  if (!correction.session) {
    return null
  }

  return {
    ...correction.session,
    sourceText: correction.sourceText,
    currentText: correction.originalText,
    correctedText: correction.correctedText,
    warnings: correction.warnings,
    suggestions: correction.suggestions,
    usage: correction.usage,
    updatedAt: Date.now(),
  }
}

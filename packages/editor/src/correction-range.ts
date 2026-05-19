import type { Editor } from "@tiptap/core"
import type { CorrectionSuggestion } from "@continuum/correction"
import { isEditableTextBlockType } from "./editor-queries"

function getStringAttribute(attrs: Record<string, unknown>, key: string) {
  const value = attrs[key]

  return typeof value === "string" ? value : ""
}

function getCorrectionLeafText(node: {
  attrs: Record<string, unknown>
  type: { name: string }
}) {
  if (node.type.name === "inlineMath") {
    const tex = getStringAttribute(node.attrs, "tex").trim()

    return tex ? `$${tex}$` : ""
  }

  if (node.type.name === "manualIndent") {
    return "    "
  }

  if (node.type.name === "hardBreak") {
    return "\n"
  }

  return ""
}

function isCorrectionTextBlockType(typeName: string) {
  return isEditableTextBlockType(typeName) || typeName === "referenceInsert"
}

export type SelectionPlainTextSegment = {
  docFrom: number
  docTo: number
  plainFrom: number
  plainTo: number
}

export type SelectionPlainTextMap = {
  selectionFrom: number
  selectionTo: number
  plainText: string
  segments: SelectionPlainTextSegment[]
}

export type SelectionPlainTextExtraction =
  | {
      ok: true
      map: SelectionPlainTextMap
    }
  | {
      ok: false
      reason: string
    }

export type ApplyCorrectionSuggestionResult =
  | { status: "applied" }
  | { status: "stale" }
  | { status: "unsafe"; reason: string }

export function extractSelectionPlainTextMap(editor: Editor | null): SelectionPlainTextExtraction {
  if (!editor || editor.state.selection.empty) {
    return { ok: false, reason: "No hay texto seleccionado." }
  }

  const { from, to } = editor.state.selection

  const plainText = editor.state.doc.textBetween(from, to, "\n", getCorrectionLeafText)

  const segments: SelectionPlainTextSegment[] = []
  let plainCursor = 0
  let hasSeenEditableTextBlock = false

  editor.state.doc.nodesBetween(from, to, (node, position) => {
    if (node.isBlock && isCorrectionTextBlockType(node.type.name)) {
      if (hasSeenEditableTextBlock && plainCursor < plainText.length) {
        plainCursor += 1
      }
      hasSeenEditableTextBlock = true
      return
    }

    if (!node.isText && node.isLeaf) {
      plainCursor += getCorrectionLeafText(node).length
      return false
    }

    if (!node.isText) {
      return
    }

    const nodeFrom = Math.max(from, position)
    const nodeTo = Math.min(to, position + node.nodeSize)

    if (nodeFrom >= nodeTo) {
      return
    }

    const localFrom = nodeFrom - position
    const localTo = nodeTo - position
    const slice = node.text?.slice(localFrom, localTo) ?? ""

    if (!slice) {
      return
    }

    const plainFrom = plainCursor
    plainCursor += slice.length
    segments.push({
      docFrom: nodeFrom,
      docTo: nodeTo,
      plainFrom,
      plainTo: plainCursor,
    })
  })

  if (segments.length === 0) {
    return { ok: false, reason: "No hay texto editable en la selección." }
  }

  if (plainCursor !== plainText.length) {
    return {
      ok: false,
      reason: "No se pudo mapear la selección de forma segura.",
    }
  }

  return {
    ok: true,
    map: {
      selectionFrom: from,
      selectionTo: to,
      plainText,
      segments,
    },
  }
}

function mapPlainOffsetToDocPosition(
  segments: SelectionPlainTextSegment[],
  plainOffset: number,
): number | null {
  for (const segment of segments) {
    if (plainOffset < segment.plainFrom || plainOffset > segment.plainTo) {
      continue
    }

    const relative = plainOffset - segment.plainFrom
    return segment.docFrom + relative
  }

  const last = segments[segments.length - 1]

  if (plainOffset === last.plainTo) {
    return last.docTo
  }

  return null
}

function collectSegmentsForPlainRange(
  segments: SelectionPlainTextSegment[],
  plainFrom: number,
  plainTo: number,
) {
  return segments.filter(
    (segment) => segment.plainTo > plainFrom && segment.plainFrom < plainTo,
  )
}

function plainRangeIsFullyMapped(
  segments: SelectionPlainTextSegment[],
  plainFrom: number,
  plainTo: number,
) {
  if (plainFrom === plainTo) {
    return segments.some(
      (segment) => plainFrom >= segment.plainFrom && plainFrom <= segment.plainTo,
    )
  }

  const overlapping = collectSegmentsForPlainRange(segments, plainFrom, plainTo).sort(
    (left, right) => left.plainFrom - right.plainFrom,
  )

  if (overlapping.length === 0) {
    return false
  }

  let cursor = plainFrom

  for (const segment of overlapping) {
    const segmentStart = Math.max(segment.plainFrom, plainFrom)

    if (segmentStart > cursor) {
      return false
    }

    cursor = Math.max(cursor, Math.min(segment.plainTo, plainTo))
  }

  return cursor >= plainTo
}

export function verifyPlainTextMatchesMap(map: SelectionPlainTextMap, expected: string) {
  return map.plainText === expected
}

export function canSafelyApplySuggestion(
  map: SelectionPlainTextMap,
  suggestion: CorrectionSuggestion,
): boolean {
  if (suggestion.status !== "pending") {
    return false
  }

  const plainFrom = suggestion.originalOffset
  const plainTo = suggestion.originalOffset + suggestion.originalLength
  const current = map.plainText.slice(plainFrom, plainTo)

  if (current !== suggestion.original) {
    return false
  }

  if (!plainRangeIsFullyMapped(map.segments, plainFrom, plainTo)) {
    return false
  }

  const docFrom = mapPlainOffsetToDocPosition(map.segments, plainFrom)
  const docTo = mapPlainOffsetToDocPosition(map.segments, plainTo)

  return docFrom !== null && docTo !== null && docFrom <= docTo
}

function getTextMarksForRange(
  editor: Editor,
  from: number,
  to: number,
) {
  let marks = null as readonly ReturnType<typeof editor.state.schema.mark>[] | null

  editor.state.doc.nodesBetween(from, to, (node, position) => {
    if (!node.isText) {
      return
    }

    if (from < position || to > position + node.nodeSize) {
      return
    }

    marks = node.marks
    return false
  })

  return marks
}

function getTextMarksBeforePosition(editor: Editor, position: number) {
  let marks = null as readonly ReturnType<typeof editor.state.schema.mark>[] | null

  editor.state.doc.nodesBetween(0, position, (node, nodePosition) => {
    if (!node.isText) {
      return
    }

    const nodeFrom = nodePosition
    const nodeTo = nodePosition + node.nodeSize

    if (nodeTo > position && nodeFrom < position) {
      marks = node.marks
      return false
    }

    if (nodeTo === position) {
      marks = node.marks
    }
  })

  return marks
}

export function applyCorrectionSuggestionToEditor(
  editor: Editor | null,
  map: SelectionPlainTextMap,
  suggestion: CorrectionSuggestion,
): ApplyCorrectionSuggestionResult {
  if (!editor) {
    return { status: "unsafe", reason: "No hay editor activo." }
  }

  if (!canSafelyApplySuggestion(map, suggestion)) {
    return {
      status: "unsafe",
      reason: "No se puede aplicar esta corrección de forma segura.",
    }
  }

  const plainFrom = suggestion.originalOffset
  const plainTo = suggestion.originalOffset + suggestion.originalLength
  const docFrom = mapPlainOffsetToDocPosition(map.segments, plainFrom)
  const docTo = mapPlainOffsetToDocPosition(map.segments, plainTo)

  if (docFrom === null || docTo === null || docFrom > docTo) {
    return {
      status: "unsafe",
      reason: "No se puede aplicar esta corrección de forma segura.",
    }
  }

  if (suggestion.replacement.includes("\n")) {
    return {
      status: "unsafe",
      reason: "No se puede aplicar una corrección multilinea desde esta vista.",
    }
  }

  const isPureInsertion = suggestion.originalLength === 0

  if (!isPureInsertion) {
    const currentFragment = editor.state.doc.textBetween(docFrom, docTo, "", getCorrectionLeafText)

    if (currentFragment !== suggestion.original) {
      return { status: "stale" }
    }
  }

  const marks =
    docFrom === docTo
      ? getTextMarksBeforePosition(editor, docFrom)
      : getTextMarksForRange(editor, docFrom, docTo)

  if (!marks) {
    return {
      status: "unsafe",
      reason: "No se puede aplicar esta corrección de forma segura.",
    }
  }

  const transaction = editor.state.tr
  const lengthDelta = suggestion.replacement.length - suggestion.originalLength

  if (isPureInsertion) {
    if (suggestion.replacement.length === 0) {
      return {
        status: "unsafe",
        reason: "No se puede aplicar esta corrección de forma segura.",
      }
    }

    transaction.insert(docFrom, editor.state.schema.text(suggestion.replacement, marks))
  } else if (suggestion.replacement.length > 0) {
    transaction.replaceWith(
      docFrom,
      docTo,
      editor.state.schema.text(suggestion.replacement, marks),
    )
  } else {
    transaction.delete(docFrom, docTo)
  }

  try {
    editor.view.dispatch(transaction)
    const maxPosition = editor.state.doc.content.size
    const selectionFrom = Math.min(map.selectionFrom, maxPosition)
    const selectionTo = Math.min(
      Math.max(selectionFrom, map.selectionTo + lengthDelta),
      maxPosition,
    )
    editor.commands.setTextSelection({ from: selectionFrom, to: selectionTo })
    editor.commands.focus()
  } catch {
    return {
      status: "unsafe",
      reason: "No se puede aplicar esta corrección de forma segura.",
    }
  }

  return { status: "applied" }
}

export function canSafelyApplyAllSuggestions(
  map: SelectionPlainTextMap,
  suggestions: CorrectionSuggestion[],
) {
  const pending = suggestions.filter((item) => item.status === "pending")

  if (pending.length === 0) {
    return false
  }

  return pending.every((suggestion) => canSafelyApplySuggestion(map, suggestion))
}

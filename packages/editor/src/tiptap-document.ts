import type {
  StructuredNoteDraft,
  StructuredNoteDraftAphorism,
  StructuredNoteDraftBlock,
  StructuredNoteDraftCitation,
  StructuredNoteDraftParagraphBlock,
  StructuredNoteDraftReferenceInsertBlock,
  StructuredNoteDraftSegment,
  StructuredNoteDraftWarning,
} from "@continuum/core"
import { assertNever } from "@continuum/core"

import type {
  TipTapJsonMark,
  TipTapJsonNode,
} from "./tiptap-types"

export type {
  TipTapJsonMark,
  TipTapJsonNode,
} from "./tiptap-types"

export type TipTapPrototypeDocument = {
  debug: {
    sourceFormat: "structured-note-draft"
    sourceNoteId: string
  }
  tiptap: TipTapJsonNode
}

type TipTapToStructuredDraftInput = {
  sourceDraft: StructuredNoteDraft
  tiptap: TipTapJsonNode
}

const SOFT_BREAK_TEXT = "\n"

export function createTipTapPrototypeDocumentFromStructuredDraft(
  draft: StructuredNoteDraft,
): TipTapPrototypeDocument {
  const citationNumbers = getDraftCitationNumbers(draft)

  return {
    debug: {
      sourceFormat: "structured-note-draft",
      sourceNoteId: draft.id,
    },
    tiptap: {
      content: draft.blocks.map((block) =>
        convertBlockToTipTapNode(block, draft, citationNumbers),
      ),
      type: "doc",
    },
  }
}

export function createStructuredDraftFromTipTapPrototypeDocument({
  sourceDraft,
  tiptap,
}: TipTapToStructuredDraftInput): StructuredNoteDraft {
  const citationsById = new Map<string, StructuredNoteDraftCitation>()
  const usedSegmentIds = new Set<string>()
  const blocks = trimTrailingEmptyParagraphBlocks(
    dropEmptyAphorismBlocks(
      (tiptap.content ?? []).map((node, index) =>
        convertTipTapNodeToStructuredBlock({
          citationsById,
          node,
          noteId: sourceDraft.id,
          position: index,
          usedSegmentIds,
        }),
      ),
    ),
  )
  const aphorisms = getAphorismsFromStructuredBlocks(sourceDraft, blocks)
  const citations = Array.from(citationsById.values())
  const warnings = getTipTapDraftWarnings({
    blocks,
    citations,
    references: sourceDraft.references,
  })

  return {
    ...sourceDraft,
    aphorisms,
    blocks,
    citations,
    persistence: {
      safeForCurrentNoteModel: warnings.length === 0,
      unsupportedFeatures: warnings.map((warning) => warning.code),
    },
    warnings,
  }
}

function convertBlockToTipTapNode(
  block: StructuredNoteDraftBlock,
  draft: StructuredNoteDraft,
  citationNumbers: Map<string, number>,
): TipTapJsonNode {
  if (block.type === "referenceInsert") {
    return {
      attrs: {
        blockId: block.id,
        referenceId: block.referenceId,
        referenceInsertId: block.referenceInsertId,
        referenceLabel: getReferenceLabel(draft, block.referenceId),
        ...(block.sourceFragmentFingerprint
          ? { sourceFragmentFingerprint: block.sourceFragmentFingerprint }
          : {}),
        ...(block.sourceVersionId ? { sourceVersionId: block.sourceVersionId } : {}),
      },
      content: createTextContent(block.text),
      type: "referenceInsert",
    }
  }

  return convertParagraphBlockToTipTapNode(block, draft, citationNumbers)
}

function convertParagraphBlockToTipTapNode(
  block: StructuredNoteDraftParagraphBlock,
  draft: StructuredNoteDraft,
  citationNumbers: Map<string, number>,
): TipTapJsonNode {
  const type = block.aphorismId ? "aphorism" : "structuredParagraph"

  return {
    attrs: {
      ...(block.aphorismId
        ? {
            aphorismId: block.aphorismId,
            markerCountsInSequence:
              block.aphorismMarker?.countsInSequence ?? true,
            markerValue: block.aphorismMarker?.value ?? null,
            visibleLabel: getAphorismVisibleLabel(
              draft,
              block.aphorismId,
              block.id,
            ),
          }
        : {}),
      blockId: block.id,
      ...(block.literaryBreakBefore ? { literaryBreakBefore: true } : {}),
    },
    content: block.segments.flatMap((segment) =>
      convertSegmentToTipTapContent(segment, draft, citationNumbers),
    ),
    type,
  }
}

function convertSegmentToTipTapContent(
  segment: StructuredNoteDraftSegment,
  draft: StructuredNoteDraft,
  citationNumbers: Map<string, number>,
): TipTapJsonNode[] {
  if (segment.type === "manualIndent") {
    return [
      {
        attrs: {
          indentId: segment.id,
        },
        type: "manualIndent",
      },
    ]
  }

  if (segment.type === "inlineMath") {
    return [
      {
        attrs: {
          mathId: segment.id,
          tex: segment.tex,
        },
        type: "inlineMath",
      },
    ]
  }

  if (!segment.text) {
    return []
  }

  const marks: TipTapJsonMark[] = [
    {
      attrs: {
        segmentId: segment.id,
      },
      type: "segment",
    },
  ]
  const citation = segment.citationId
    ? draft.citations.find((item) => item.id === segment.citationId)
    : undefined

  if (citation) {
    marks.push({
      attrs: {
        ...(citation.anchor.offset !== undefined
          ? { anchorOffset: citation.anchor.offset }
          : {}),
        citationId: citation.id,
        referenceId: citation.referenceId ?? null,
        visibleNumber: String(citationNumbers.get(citation.id) ?? ""),
      },
      type: "citation",
    })
  }

  return createMarkedTextContent(segment.text, marks)
}

function convertTipTapNodeToStructuredBlock({
  citationsById,
  node,
  noteId,
  position,
  usedSegmentIds,
}: {
  citationsById: Map<string, StructuredNoteDraftCitation>
  node: TipTapJsonNode
  noteId: string
  position: number
  usedSegmentIds: Set<string>
}): StructuredNoteDraftBlock {
  if (node.type === "referenceInsert") {
    return convertTipTapReferenceInsertNode(node, position)
  }

  return convertTipTapParagraphNode({
    citationsById,
    node,
    noteId,
    position,
    usedSegmentIds,
  })
}

function convertTipTapReferenceInsertNode(
  node: TipTapJsonNode,
  position: number,
): StructuredNoteDraftReferenceInsertBlock {
  const blockId = getStringAttr(node, "blockId", `tiptap-reference-${position + 1}`)

  return {
    id: blockId,
    referenceId: getStringAttr(node, "referenceId", ""),
    referenceInsertId: getStringAttr(node, "referenceInsertId", blockId),
    ...(getOptionalStringAttr(node, "sourceFragmentFingerprint")
      ? {
          sourceFragmentFingerprint: getOptionalStringAttr(
            node,
            "sourceFragmentFingerprint",
          ),
        }
      : {}),
    ...(getOptionalStringAttr(node, "sourceVersionId")
      ? { sourceVersionId: getOptionalStringAttr(node, "sourceVersionId") }
      : {}),
    text: getTipTapNodeText(node),
    type: "referenceInsert",
  }
}

function convertTipTapParagraphNode({
  citationsById,
  node,
  noteId,
  position,
  usedSegmentIds,
}: {
  citationsById: Map<string, StructuredNoteDraftCitation>
  node: TipTapJsonNode
  noteId: string
  position: number
  usedSegmentIds: Set<string>
}): StructuredNoteDraftParagraphBlock {
  const blockId = getStringAttr(node, "blockId", `tiptap-block-${position + 1}`)
  const aphorismId =
    node.type === "aphorism"
      ? getStringAttr(node, "aphorismId", `tiptap-aphorism-${position + 1}`)
      : undefined
  const segments: StructuredNoteDraftSegment[] = []
  let previousCitationId: string | undefined

  for (const [childIndex, child] of (node.content ?? []).entries()) {
    segments.push(
      ...convertTipTapInlineNodeToSegments({
        aphorismId,
        blockId,
        child,
        citationsById,
        noteId,
        position: childIndex,
        previousCitationId,
        usedSegmentIds,
      }),
    )
    previousCitationId = getTextNodeCitationId(child)
  }
  const block: StructuredNoteDraftParagraphBlock = {
    id: blockId,
    ...(getBooleanAttr(node, "literaryBreakBefore", false)
      ? { literaryBreakBefore: true }
      : {}),
    segments,
    type: "paragraph",
    ...(aphorismId ? { aphorismId } : {}),
  }
  const markerValue = getOptionalStringAttr(node, "markerValue")

  if (aphorismId && markerValue) {
    block.aphorismMarker = {
      countsInSequence: getBooleanAttr(node, "markerCountsInSequence", true),
      value: markerValue,
    }
  }

  return block
}

function convertTipTapInlineNodeToSegments({
  aphorismId,
  blockId,
  child,
  citationsById,
  noteId,
  position,
  previousCitationId,
  usedSegmentIds,
}: {
  aphorismId?: string
  blockId: string
  child: TipTapJsonNode
  citationsById: Map<string, StructuredNoteDraftCitation>
  noteId: string
  position: number
  previousCitationId?: string
  usedSegmentIds: Set<string>
}): StructuredNoteDraftSegment[] {
  if (child.type === "inlineMath") {
    const markedMathId = getStringAttr(child, "mathId", `${blockId}-math-${position + 1}`)
    return [
      {
        id: getUniqueSegmentId({
          fallback: `${blockId}-math-${position + 1}`,
          position,
          usedSegmentIds,
          value: markedMathId,
        }),
        tex: getStringAttr(child, "tex", ""),
        type: "inlineMath",
      },
    ]
  }

  if (child.type === "hardBreak") {
    return [
      {
        id: getUniqueSegmentId({
          fallback: `${blockId}-soft-break-${position + 1}`,
          position,
          usedSegmentIds,
          value: `${blockId}-soft-break-${position + 1}`,
        }),
        text: SOFT_BREAK_TEXT,
        type: "text",
      },
    ]
  }

  if (child.type === "manualIndent") {
    const markedIndentId = getStringAttr(
      child,
      "indentId",
      `${blockId}-manual-indent-${position + 1}`,
    )

    return [
      {
        id: getUniqueSegmentId({
          fallback: `${blockId}-manual-indent-${position + 1}`,
          position,
          usedSegmentIds,
          value: markedIndentId,
        }),
        type: "manualIndent",
      },
    ]
  }

  if (child.type !== "text" || !child.text) {
    return []
  }

  const segmentMark = getMark(child, "segment")
  const citationMark = getMark(child, "citation")
  const markedSegmentId = getStringMarkAttr(
    segmentMark,
    "segmentId",
    `${blockId}-segment-${position + 1}`,
  )
  const segmentId = getUniqueSegmentId({
    fallback: `${blockId}-segment-${position + 1}`,
    position,
    usedSegmentIds,
    value: markedSegmentId,
  })
  const markedCitationId = getOptionalStringMarkAttr(citationMark, "citationId")
  const anchorOffset = getOptionalIntegerMarkAttr(citationMark, "anchorOffset")
  const contiguousExistingCitation =
    markedCitationId && markedCitationId === previousCitationId
      ? citationsById.get(markedCitationId)
      : undefined
  const citationId =
    markedCitationId && !contiguousExistingCitation
      ? getUniqueCitationId({
          citationsById,
          position,
          value: markedCitationId,
        })
      : undefined

  if (contiguousExistingCitation) {
    contiguousExistingCitation.anchor.selectedText += child.text
  }

  if (citationId) {
    citationsById.set(citationId, {
      anchor: {
        ...(aphorismId ? { aphorismId } : {}),
        blockId,
        ...(anchorOffset !== undefined ? { offset: anchorOffset } : {}),
        segmentId,
        selectedText: child.text,
      },
      id: citationId,
      noteId,
      ...(getOptionalStringMarkAttr(citationMark, "referenceId")
        ? { referenceId: getOptionalStringMarkAttr(citationMark, "referenceId") }
        : {}),
    })
  }

  return [
    {
      id: segmentId,
      text: child.text,
      type: "text",
      ...(citationId || contiguousExistingCitation
        ? { citationId: citationId ?? markedCitationId }
        : {}),
    },
  ]
}

function getTextNodeCitationId(node: TipTapJsonNode) {
  if (node.type !== "text" || !node.text) {
    return undefined
  }

  return getOptionalStringMarkAttr(getMark(node, "citation"), "citationId")
}

function createTextContent(text: string): TipTapJsonNode[] {
  if (!text) {
    return []
  }

  return createMarkedTextContent(text, [
    {
      attrs: {
        segmentId: "reference-insert-text",
      },
      type: "segment",
    },
  ])
}

function createMarkedTextContent(
  text: string,
  marks: TipTapJsonMark[],
): TipTapJsonNode[] {
  const nodes: TipTapJsonNode[] = []

  text.split(SOFT_BREAK_TEXT).forEach((line, index) => {
    if (index > 0) {
      nodes.push({ type: "hardBreak" })
    }

    if (line) {
      nodes.push({
        marks,
        text: line,
        type: "text",
      })
    }
  })

  return nodes
}

function getAphorismVisibleLabel(
  draft: StructuredNoteDraft,
  aphorismId: string,
  blockId: string,
) {
  const index = draft.aphorisms.findIndex((aphorism) => aphorism.id === aphorismId)
  const aphorism = draft.aphorisms[index]

  if (aphorism?.blockIds[0] !== blockId) {
    return ""
  }

  return aphorism?.marker?.value ?? String(index + 1)
}

function getDraftCitationNumbers(draft: StructuredNoteDraft) {
  const numbers = new Map<string, number>()
  const numbersByReference = new Map<string, number>()
  let nextNumber = 1

  for (const citation of draft.citations) {
    const numberKey = citation.referenceId
      ? `reference:${citation.referenceId}`
      : `citation:${citation.id}`
    const existingNumber = numbersByReference.get(numberKey)

    if (existingNumber) {
      numbers.set(citation.id, existingNumber)
      continue
    }

    numbersByReference.set(numberKey, nextNumber)
    numbers.set(citation.id, nextNumber)
    nextNumber += 1
  }

  return numbers
}

function getReferenceLabel(draft: StructuredNoteDraft, referenceId: string) {
  const reference = draft.references.find((item) => item.id === referenceId)

  if (!reference) {
    return ""
  }

  const source = [reference.author, reference.work]
    .filter(Boolean)
    .join(", ")

  return source || reference.body || reference.id
}

function getAphorismsFromStructuredBlocks(
  sourceDraft: StructuredNoteDraft,
  blocks: readonly StructuredNoteDraftBlock[],
) {
  const aphorisms = new Map<string, StructuredNoteDraftAphorism>()
  const sourceAphorismsById = new Map(
    sourceDraft.aphorisms.map((aphorism) => [aphorism.id, aphorism]),
  )

  for (const block of blocks) {
    if (block.type !== "paragraph" || !block.aphorismId) {
      continue
    }

    const existing = aphorisms.get(block.aphorismId)

    if (existing) {
      existing.blockIds.push(block.id)
      if (!existing.marker && block.aphorismMarker) {
        existing.marker = block.aphorismMarker
      }
      continue
    }

    const sourceAphorism = sourceAphorismsById.get(block.aphorismId)

    aphorisms.set(block.aphorismId, {
      blockIds: [block.id],
      id: block.aphorismId,
      ...(block.aphorismMarker
        ? { marker: block.aphorismMarker }
        : sourceAphorism?.marker
          ? { marker: sourceAphorism.marker }
          : {}),
      noteId: sourceDraft.id,
      ...(sourceAphorism?.slug ? { slug: sourceAphorism.slug } : {}),
    })
  }

  return Array.from(aphorisms.values())
}

function trimTrailingEmptyParagraphBlocks(
  blocks: StructuredNoteDraftBlock[],
) {
  let endIndex = blocks.length

  while (endIndex > 0) {
    const block = blocks[endIndex - 1]

    if (!isEmptyTrailingParagraphBlock(block)) {
      break
    }

    endIndex -= 1
  }

  if (endIndex === 0 && blocks.length > 0) {
    return blocks.slice(0, 1)
  }

  return blocks.slice(0, endIndex)
}

function dropEmptyAphorismBlocks(blocks: StructuredNoteDraftBlock[]) {
  const nextBlocks = blocks.filter(
    (block) =>
      !(block.type === "paragraph" && block.aphorismId && isEmptyParagraphBlock(block)),
  )

  if (nextBlocks.length > 0) {
    return nextBlocks
  }

  const firstBlock = blocks[0]

  if (!firstBlock || firstBlock.type !== "paragraph") {
    return blocks
  }

  const { aphorismId: _aphorismId, aphorismMarker: _aphorismMarker, ...rest } =
    firstBlock

  return [rest]
}

function isEmptyTrailingParagraphBlock(block: StructuredNoteDraftBlock) {
  if (block.type !== "paragraph" || block.aphorismId) {
    return false
  }

  return isEmptyParagraphBlock(block)
}

function isEmptyParagraphBlock(block: StructuredNoteDraftParagraphBlock) {
  return block.segments.every((segment) => {
    switch (segment.type) {
      case "inlineMath":
        return !segment.tex.trim()
      case "manualIndent":
        return true
      case "text":
        return !segment.text.trim()
      default:
        return assertNever(segment)
    }
  })
}

function getTipTapDraftWarnings({
  blocks,
  citations,
  references,
}: {
  blocks: readonly StructuredNoteDraftBlock[]
  citations: readonly StructuredNoteDraftCitation[]
  references: StructuredNoteDraft["references"]
}) {
  const warnings: StructuredNoteDraftWarning[] = []
  const referenceIds = new Set(references.map((reference) => reference.id))
  const seenAphorismIds = new Set<string>()
  const closedAphorismIds = new Set<string>()
  const seenBlockIds = new Set<string>()
  let previousAphorismId: string | undefined

  for (const block of blocks) {
    if (seenBlockIds.has(block.id)) {
      warnings.push({
        code: "duplicate-block-id",
        detail: "Hay un blockId duplicado en el documento TipTap.",
        id: block.id,
      })
    }

    seenBlockIds.add(block.id)

    const aphorismId =
      block.type === "paragraph" ? block.aphorismId : undefined

    if (previousAphorismId && previousAphorismId !== aphorismId) {
      closedAphorismIds.add(previousAphorismId)
    }

    if (aphorismId) {
      if (seenAphorismIds.has(aphorismId) && closedAphorismIds.has(aphorismId)) {
        warnings.push({
          code: "discontinuous-aphorism",
          detail: "El aforismo tiene parrafos separados por contenido que no pertenece al mismo aforismo.",
          id: aphorismId,
        })
      }

      seenAphorismIds.add(aphorismId)
    }

    previousAphorismId = aphorismId
  }

  for (const citation of citations) {
    if (!citation.referenceId) {
      warnings.push({
        code: "unresolved-citation",
        detail: "La cita todavia no tiene referencia asociada.",
        id: citation.id,
      })
      continue
    }

    if (!referenceIds.has(citation.referenceId)) {
      warnings.push({
        code: "unresolved-citation",
        detail: "La cita apunta a una referencia inexistente.",
        id: citation.id,
      })
    }
  }

  for (const block of blocks) {
    if (block.type !== "referenceInsert") {
      continue
    }

    if (!block.referenceId) {
      warnings.push({
        code: "missing-reference-insert-reference",
        detail: "La cita insertada todavia no tiene referencia asociada.",
        id: block.id,
      })
      continue
    }

    if (!referenceIds.has(block.referenceId)) {
      warnings.push({
        code: "missing-reference-insert-reference",
        detail: "La cita insertada apunta a una referencia inexistente.",
        id: block.id,
      })
    }
  }

  return warnings
}

function getTipTapNodeText(node: TipTapJsonNode): string {
  if (node.type === "hardBreak") {
    return SOFT_BREAK_TEXT
  }

  if (node.type === "manualIndent") {
    return ""
  }

  if (node.text) {
    return node.text
  }

  return (node.content ?? []).map(getTipTapNodeText).join("")
}

function getMark(node: TipTapJsonNode, type: string) {
  return node.marks?.find((mark) => mark.type === type)
}

function getOptionalStringAttr(node: TipTapJsonNode, key: string) {
  const value = node.attrs?.[key]

  return typeof value === "string" && value.trim() ? value : undefined
}

function getStringAttr(node: TipTapJsonNode, key: string, fallback: string) {
  return getOptionalStringAttr(node, key) ?? fallback
}

function getBooleanAttr(node: TipTapJsonNode, key: string, fallback: boolean) {
  const value = node.attrs?.[key]

  return typeof value === "boolean" ? value : fallback
}

function getOptionalStringMarkAttr(mark: TipTapJsonMark | undefined, key: string) {
  const value = mark?.attrs?.[key]

  return typeof value === "string" && value.trim() ? value : undefined
}

function getOptionalIntegerMarkAttr(mark: TipTapJsonMark | undefined, key: string) {
  const value = mark?.attrs?.[key]

  return typeof value === "number" && Number.isInteger(value) ? value : undefined
}

function getStringMarkAttr(
  mark: TipTapJsonMark | undefined,
  key: string,
  fallback: string,
) {
  return getOptionalStringMarkAttr(mark, key) ?? fallback
}

function getUniqueSegmentId({
  fallback,
  position,
  usedSegmentIds,
  value,
}: {
  fallback: string
  position: number
  usedSegmentIds: Set<string>
  value: string
}) {
  const baseId = value.trim() || fallback

  if (!usedSegmentIds.has(baseId)) {
    usedSegmentIds.add(baseId)
    return baseId
  }

  let nextId = `${baseId}-split-${position + 1}`
  let suffix = 2

  while (usedSegmentIds.has(nextId)) {
    nextId = `${baseId}-split-${position + 1}-${suffix}`
    suffix += 1
  }

  usedSegmentIds.add(nextId)
  return nextId
}

function getUniqueCitationId({
  citationsById,
  position,
  value,
}: {
  citationsById: Map<string, StructuredNoteDraftCitation>
  position: number
  value: string
}) {
  const baseId = value.trim()

  if (!citationsById.has(baseId)) {
    return baseId
  }

  let nextId = `${baseId}-split-${position + 1}`
  let suffix = 2

  while (citationsById.has(nextId)) {
    nextId = `${baseId}-split-${position + 1}-${suffix}`
    suffix += 1
  }

  return nextId
}

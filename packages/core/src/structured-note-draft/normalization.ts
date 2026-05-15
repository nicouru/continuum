import type {
  ReferenceTarget,
  TextBlockSegment,
  TextDocument,
} from "../domain-types"
import {
  getNonEmptyString,
  getUniqueInputId,
  isRecord,
} from "./utils"
import type {
  StructuredNoteDraft,
  StructuredNoteDraftAphorism,
  StructuredNoteDraftAphorismMarker,
  StructuredNoteDraftBlock,
  StructuredNoteDraftCitation,
  StructuredNoteDraftCitationCandidate,
  StructuredNoteDraftParagraphBlock,
  StructuredNoteDraftReference,
  StructuredNoteDraftSegment,
} from "./types"
import {
  getStructuredNoteDraftWarnings,
  getUnsupportedCurrentNoteModelFeatures,
} from "./validation"

export function normalizeStructuredNoteDraft(input: unknown): StructuredNoteDraft {
  if (isLegacyEditorLabDocumentShape(input)) {
    return normalizeStructuredNoteDraft({
      blocks: normalizeStructuredDraftBlocks(input.blocks),
      citations: normalizeLegacyCitations(input.citations, getLegacyNoteId(input)),
      id: getLegacyNoteId(input),
      references: normalizeStructuredDraftReferences(input.references),
      ...(typeof input.updatedAt === "string"
        ? { updatedAt: input.updatedAt }
        : {}),
      title: getLegacyNoteTitle(input),
      writtenAt: getLegacyNoteWrittenAt(input),
    })
  }

  if (!isRecord(input)) {
    return createEmptyStructuredNoteDraft()
  }

  const id = getNonEmptyString(input.id, "draft-note-1")
  const references = normalizeStructuredDraftReferences(input.references)
  const blocks = normalizeStructuredDraftBlocks(input.blocks)
  const blockIds = new Set(blocks.map((block) => block.id))
  const textSegmentBlockIds = getTextSegmentBlockIds(blocks)
  const citationCandidates = normalizeStructuredDraftCitationCandidates(
    input.citations,
    id,
  ).flatMap(({ citation, sourceId }): StructuredNoteDraftCitationCandidate[] => {
    if (!blockIds.has(citation.anchor.blockId)) {
      return []
    }

    const segmentBlockIds = textSegmentBlockIds.get(citation.anchor.segmentId)

    if (!segmentBlockIds?.length) {
      return []
    }

    if (segmentBlockIds.includes(citation.anchor.blockId)) {
      return [{ citation, sourceId }]
    }

    if (segmentBlockIds.length !== 1) {
      return []
    }

    return [
      {
        citation: {
          ...citation,
          anchor: {
            ...citation.anchor,
            blockId: segmentBlockIds[0],
          },
        },
        sourceId,
      },
    ]
  })
  const citations = citationCandidates.map(({ citation }) => citation)
  const citationIdsBySourceAnchor = new Map<string, string>()

  for (const { citation, sourceId } of citationCandidates) {
    citationIdsBySourceAnchor.set(
      getCitationSegmentKey(
        citation.anchor.blockId,
        citation.anchor.segmentId,
        sourceId,
      ),
      citation.id,
    )
  }

  const citationIds = new Set(citations.map((citation) => citation.id))
  const normalizedBlocks = blocks.map((block): StructuredNoteDraftBlock => {
    if (block.type !== "paragraph") {
      return block
    }

    return {
      ...block,
      segments: block.segments.map((segment) => {
        if (segment.type !== "text" || !segment.citationId) {
          return segment
        }

        const remappedCitationId = citationIdsBySourceAnchor.get(
          getCitationSegmentKey(block.id, segment.id, segment.citationId),
        )

        if (remappedCitationId) {
          return {
            ...segment,
            citationId: remappedCitationId,
          }
        }

        if (citationIds.has(segment.citationId)) {
          return segment
        }

        const { citationId: _citationId, ...rest } = segment
        return rest
      }),
    }
  })
  const aphorismMetadata = normalizeStructuredDraftAphorismMetadata(
    input.aphorisms,
    id,
  )
  const aphorisms = getStructuredNoteDraftAphorisms(
    id,
    normalizedBlocks,
    aphorismMetadata,
  )
  const warnings = getStructuredNoteDraftWarnings({
    blocks: normalizedBlocks,
    citations,
    references,
  })
  const unsupportedFeatures = getUnsupportedCurrentNoteModelFeatures({
    blocks: normalizedBlocks,
    citations,
    references,
  })

  return {
    aphorisms,
    blocks: normalizedBlocks,
    citations,
    id,
    persistence: {
      safeForCurrentNoteModel: unsupportedFeatures.length === 0,
      unsupportedFeatures,
    },
    references,
    source: {
      kind: "structuredNoteDraft",
      version: 1,
    },
    title: typeof input.title === "string" ? input.title : "",
    ...(typeof input.updatedAt === "string"
      ? { updatedAt: input.updatedAt }
      : {}),
    warnings,
    writtenAt:
      typeof input.writtenAt === "string" ? input.writtenAt : "",
  }
}

export function createEmptyStructuredNoteDraft(
  updatedAt?: string,
): StructuredNoteDraft {
  return normalizeStructuredNoteDraft({
    blocks: [
      {
        id: "draft-block-1",
        segments: [
          {
            id: "draft-segment-1",
            text: "",
            type: "text",
          },
        ],
        type: "paragraph",
      },
    ],
    citations: [],
    id: "draft-note-1",
    references: [],
    title: "",
    ...(updatedAt ? { updatedAt } : {}),
    writtenAt: "",
  })
}

function isLegacyEditorLabDocumentShape(
  input: unknown,
): input is Record<string, unknown> & { version: 1 } {
  return isRecord(input) && input.version === 1 && isRecord(input.note)
}

function getLegacyNoteId(input: Record<string, unknown>) {
  return isRecord(input.note)
    ? getNonEmptyString(input.note.id, "draft-note-1")
    : "draft-note-1"
}

function getLegacyNoteTitle(input: Record<string, unknown>) {
  return isRecord(input.note) && typeof input.note.title === "string"
    ? input.note.title
    : ""
}

function getLegacyNoteWrittenAt(input: Record<string, unknown>) {
  return isRecord(input.note) && typeof input.note.writtenAt === "string"
    ? input.note.writtenAt
    : ""
}

function normalizeStructuredDraftBlocks(input: unknown): StructuredNoteDraftBlock[] {
  if (!Array.isArray(input)) {
    return createDefaultStructuredDraftBlocks()
  }

  const usedBlockIds = new Set<string>()
  const blocks = input.flatMap((item, index): StructuredNoteDraftBlock[] => {
    if (!isRecord(item)) {
      return []
    }

    const id = getUniqueInputId({
      fallback: `draft-block-${index + 1}`,
      usedIds: usedBlockIds,
      value: item.id,
    })

    if (item.type === "referenceInsert") {
      return [
        {
          id,
          referenceId: getNonEmptyString(item.referenceId, ""),
          referenceInsertId: getNonEmptyString(item.referenceInsertId, id),
          ...(typeof item.sourceFragmentFingerprint === "string" &&
          item.sourceFragmentFingerprint.trim()
            ? { sourceFragmentFingerprint: item.sourceFragmentFingerprint.trim() }
            : {}),
          ...(typeof item.sourceVersionId === "string" &&
          item.sourceVersionId.trim()
            ? { sourceVersionId: item.sourceVersionId.trim() }
            : {}),
          text: typeof item.text === "string" ? item.text : "",
          type: "referenceInsert",
        },
      ]
    }

    const aphorismMarker = normalizeAphorismMarker(item.aphorismMarker)
    const block: StructuredNoteDraftParagraphBlock = {
      id,
      ...(item.literaryBreakBefore === true ? { literaryBreakBefore: true } : {}),
      segments: normalizeStructuredDraftSegments(item.segments, id),
      type: "paragraph",
      ...(typeof item.aphorismId === "string" && item.aphorismId.trim()
        ? { aphorismId: item.aphorismId.trim() }
        : {}),
      ...(aphorismMarker ? { aphorismMarker } : {}),
    }

    return [block]
  })

  return blocks.length ? blocks : createDefaultStructuredDraftBlocks()
}

function normalizeStructuredDraftSegments(
  input: unknown,
  blockId: string,
): StructuredNoteDraftSegment[] {
  if (!Array.isArray(input)) {
    return [
      {
        id: `${blockId}-segment-1`,
        text: "",
        type: "text",
      },
    ]
  }

  const usedSegmentIds = new Set<string>()
  const segments = input.flatMap((item, index): StructuredNoteDraftSegment[] => {
    if (!isRecord(item)) {
      return []
    }

    const id = getUniqueInputId({
      fallback: `${blockId}-segment-${index + 1}`,
      usedIds: usedSegmentIds,
      value: item.id,
    })

    if (item.type === "inlineMath") {
      return [
        {
          id,
          tex: typeof item.tex === "string" ? item.tex : "",
          type: "inlineMath",
        },
      ]
    }

    if (item.type === "manualIndent") {
      return [
        {
          id,
          type: "manualIndent",
        },
      ]
    }

    return [
      {
        id,
        text: typeof item.text === "string" ? item.text : "",
        type: "text",
        ...(typeof item.citationId === "string" && item.citationId.trim()
          ? { citationId: item.citationId.trim() }
          : {}),
      },
    ]
  })

  return segments.length
    ? segments
    : [
        {
          id: `${blockId}-segment-1`,
          text: "",
          type: "text",
        },
      ]
}

function getTextSegmentBlockIds(blocks: StructuredNoteDraftBlock[]) {
  const blockIdsBySegmentId = new Map<string, string[]>()

  for (const block of blocks) {
    if (block.type !== "paragraph") {
      continue
    }

    for (const segment of block.segments) {
      if (segment.type !== "text") {
        continue
      }

      const blockIds = blockIdsBySegmentId.get(segment.id) ?? []
      blockIds.push(block.id)
      blockIdsBySegmentId.set(segment.id, blockIds)
    }
  }

  return blockIdsBySegmentId
}

function getCitationSegmentKey(
  blockId: string,
  segmentId: string,
  citationId: string,
) {
  return `${blockId}\u0000${segmentId}\u0000${citationId}`
}

function normalizeLegacyCitations(
  input: unknown,
  noteId: string,
): StructuredNoteDraftCitation[] {
  return normalizeStructuredDraftCitations(input, noteId)
}

function normalizeStructuredDraftCitations(
  input: unknown,
  noteId: string,
): StructuredNoteDraftCitation[] {
  return normalizeStructuredDraftCitationCandidates(input, noteId).map(
    ({ citation }) => citation,
  )
}

function normalizeStructuredDraftCitationCandidates(
  input: unknown,
  noteId: string,
): StructuredNoteDraftCitationCandidate[] {
  if (!Array.isArray(input)) {
    return []
  }

  const usedCitationIds = new Set<string>()

  return input.flatMap((item, index): StructuredNoteDraftCitationCandidate[] => {
    if (!isRecord(item) || !isRecord(item.anchor)) {
      return []
    }

    const sourceId = getNonEmptyString(
      item.id,
      `${noteId}-citation-${index + 1}`,
    )
    const id = getUniqueInputId({
      fallback: `${noteId}-citation-${index + 1}`,
      usedIds: usedCitationIds,
      value: item.id,
    })
    const blockId = getNonEmptyString(item.anchor.blockId, "")
    const segmentId = getNonEmptyString(item.anchor.segmentId, "")

    if (!blockId || !segmentId) {
      return []
    }

    return [
      {
        citation: {
          anchor: {
            ...(typeof item.anchor.aphorismId === "string" &&
            item.anchor.aphorismId.trim()
              ? { aphorismId: item.anchor.aphorismId.trim() }
              : {}),
            blockId,
            ...(typeof item.anchor.offset === "number" &&
            Number.isFinite(item.anchor.offset)
              ? { offset: Math.max(0, Math.floor(item.anchor.offset)) }
              : {}),
            ...(typeof item.anchor.selectedText === "string"
              ? { selectedText: item.anchor.selectedText }
              : {}),
            segmentId,
          },
          id,
          noteId,
          ...(typeof item.referenceId === "string" && item.referenceId.trim()
            ? { referenceId: item.referenceId.trim() }
            : {}),
        },
        sourceId,
      },
    ]
  })
}

export function normalizeStructuredDraftReferences(
  input: unknown,
): StructuredNoteDraftReference[] {
  if (!Array.isArray(input)) {
    return []
  }

  const usedReferenceIds = new Set<string>()

  return input.flatMap((item, index): StructuredNoteDraftReference[] => {
    if (!isRecord(item)) {
      return []
    }

    const id = getUniqueInputId({
      fallback: `reference-${index + 1}`,
      usedIds: usedReferenceIds,
      value: item.id,
    })

    const sourceText = normalizeTextDocument(item.sourceText)
    const comment = normalizeTextDocument(item.comment)
    const target = normalizeReferenceTarget(item.target)

    return [
      {
        body:
          typeof item.body === "string" ? item.body : getTextDocumentText(sourceText),
        id,
        ...(typeof item.author === "string" && item.author.trim()
          ? { author: item.author.trim() }
          : {}),
        ...(typeof item.authorBirthYear === "number" &&
        Number.isInteger(item.authorBirthYear)
          ? { authorBirthYear: item.authorBirthYear }
          : {}),
        ...(typeof item.authorDeathYear === "number" &&
        Number.isInteger(item.authorDeathYear)
          ? { authorDeathYear: item.authorDeathYear }
          : {}),
        ...(comment ? { comment } : {}),
        ...(typeof item.createdAt === "string" && item.createdAt.trim()
          ? { createdAt: item.createdAt.trim() }
          : {}),
        ...(typeof item.edition === "string" && item.edition.trim()
          ? { edition: item.edition.trim() }
          : {}),
        ...(sourceText ? { sourceText } : {}),
        ...(target ? { target } : {}),
        ...(typeof item.translator === "string" && item.translator.trim()
          ? { translator: item.translator.trim() }
          : {}),
        ...(typeof item.work === "string" && item.work.trim()
          ? { work: item.work.trim() }
          : {}),
        ...(typeof item.workDate === "string" && item.workDate.trim()
          ? { workDate: item.workDate.trim() }
          : {}),
        ...(typeof item.updatedAt === "string" && item.updatedAt.trim()
          ? { updatedAt: item.updatedAt.trim() }
          : {}),
      },
    ]
  })
}

function normalizeStructuredDraftAphorismMetadata(
  input: unknown,
  noteId: string,
) {
  const aphorismsById = new Map<
    string,
    Pick<StructuredNoteDraftAphorism, "marker" | "slug">
  >()

  if (!Array.isArray(input)) {
    return aphorismsById
  }

  for (let index = 0; index < input.length; index += 1) {
    const item = input[index]
    if (!isRecord(item)) {
      continue
    }

    const id = getNonEmptyString(item.id, `${noteId}-aphorism-${index + 1}`)
    const marker = normalizeAphorismMarker(item.marker)

    aphorismsById.set(id, {
      ...(marker ? { marker } : {}),
      ...(typeof item.slug === "string" && item.slug.trim()
        ? { slug: item.slug.trim() }
        : {}),
    })
  }

  return aphorismsById
}

function normalizeTextDocument(input: unknown): TextDocument | undefined {
  if (!isRecord(input) || !Array.isArray(input.blocks)) {
    return undefined
  }

  const blocks = input.blocks.flatMap((block, index): TextDocument["blocks"] => {
    if (!isRecord(block)) {
      return []
    }
    const id = getNonEmptyString(block.id, `text-document-block-${index + 1}`)
    const segments = Array.isArray(block.segments)
      ? normalizeTextDocumentSegments(block.segments, id)
      : undefined

    return [
      {
        id,
        ...(block.literaryBreakBefore === true
          ? { literaryBreakBefore: true }
          : {}),
        ...(segments?.length ? { segments } : {}),
        text: typeof block.text === "string" ? block.text : "",
        type: "paragraph",
      },
    ]
  })

  return blocks.length ? { blocks } : undefined
}

function normalizeTextDocumentSegments(
  input: unknown[],
  blockId: string,
): TextBlockSegment[] | undefined {
  const usedSegmentIds = new Set<string>()
  const segments = input.flatMap((item, index): TextBlockSegment[] => {
    if (!isRecord(item)) {
      return []
    }

    const id = getUniqueInputId({
      fallback: `${blockId}-segment-${index + 1}`,
      usedIds: usedSegmentIds,
      value: item.id,
    })

    if (item.type === "inlineMath") {
      return [
        {
          id,
          tex: typeof item.tex === "string" ? item.tex : "",
          type: "inlineMath",
        },
      ]
    }

    if (item.type === "manualIndent") {
      return [
        {
          id,
          type: "manualIndent",
        },
      ]
    }

    return [
      {
        id,
        text: typeof item.text === "string" ? item.text : "",
        type: "text",
        ...(typeof item.citationId === "string" && item.citationId.trim()
          ? { citationId: item.citationId.trim() }
          : {}),
      },
    ]
  })

  return segments.length ? segments : undefined
}

function normalizeReferenceTarget(input: unknown): ReferenceTarget | undefined {
  if (!isRecord(input)) {
    return undefined
  }

  switch (input.kind) {
    case "external":
      return { kind: "external" }
    case "aphorism": {
      const aphorismId = getNonEmptyString(input.aphorismId, "")

      return aphorismId ? { kind: "aphorism", aphorismId } : undefined
    }
    case "note": {
      const noteId = getNonEmptyString(input.noteId, "")

      return noteId ? { kind: "note", noteId } : undefined
    }
    default:
      return undefined
  }
}

function normalizeAphorismMarker(
  input: unknown,
): StructuredNoteDraftAphorismMarker | undefined {
  if (!isRecord(input) || typeof input.value !== "string") {
    return undefined
  }

  return {
    countsInSequence:
      typeof input.countsInSequence === "boolean"
        ? input.countsInSequence
        : true,
    value: input.value,
  }
}

function createDefaultStructuredDraftBlocks(): StructuredNoteDraftBlock[] {
  return [
    {
      id: "draft-block-1",
      segments: [
        {
          id: "draft-segment-1",
          text: "",
          type: "text",
        },
      ],
      type: "paragraph",
    },
  ]
}

function getStructuredNoteDraftAphorisms(
  noteId: string,
  blocks: readonly StructuredNoteDraftBlock[],
  metadataById = new Map<
    string,
    Pick<StructuredNoteDraftAphorism, "marker" | "slug">
  >(),
) {
  const aphorismsById = new Map<string, StructuredNoteDraftAphorism>()

  for (const block of blocks) {
    if (block.type !== "paragraph" || !block.aphorismId) {
      continue
    }

    const existing = aphorismsById.get(block.aphorismId)

    if (existing) {
      existing.blockIds.push(block.id)
      if (!existing.marker && block.aphorismMarker) {
        existing.marker = block.aphorismMarker
      }
      continue
    }

    const metadata = metadataById.get(block.aphorismId)

    aphorismsById.set(block.aphorismId, {
      blockIds: [block.id],
      id: block.aphorismId,
      ...(block.aphorismMarker
        ? { marker: block.aphorismMarker }
        : metadata?.marker
          ? { marker: metadata.marker }
          : {}),
      noteId,
      ...(metadata?.slug ? { slug: metadata.slug } : {}),
    })
  }

  return Array.from(aphorismsById.values())
}

function getTextDocumentText(draft: TextDocument | undefined) {
  return draft?.blocks.map((block) => block.text).join("\n\n") ?? ""
}

import type {
  Citation,
  Note,
  NoteBlock,
  NoteStatus,
  Reference,
  TextBlockSegment,
  TextDocument,
} from "../domain-types"
import {
  assertNever,
  createTextDocument,
  toStructuredDraftDateInput,
  toStructuredDraftTimestampId,
} from "./utils"
import type {
  StructuredNoteDraft,
  StructuredNoteDraftBlock,
  StructuredNoteDraftCitation,
  StructuredNoteDraftReference,
  StructuredNoteDraftSegment,
} from "./types"
import {
  createEmptyStructuredNoteDraft,
  normalizeStructuredNoteDraft,
} from "./normalization"

export function createNewStructuredNoteDraft(
  now = new Date(),
  references: readonly Reference[] = [],
): StructuredNoteDraft {
  const timestamp = toStructuredDraftTimestampId(now)

  return normalizeStructuredNoteDraft({
    ...createEmptyStructuredNoteDraft(now.toISOString()),
    id: `draft-note-${timestamp}`,
    references: references.map(convertReferenceToStructuredNoteDraftReference),
    writtenAt: toStructuredDraftDateInput(now),
  })
}

export function convertNoteToStructuredDraft({
  note,
  references = [],
  updatedAt,
}: {
  note: Note
  references?: readonly Reference[]
  updatedAt?: string
}): StructuredNoteDraft {
  const blocks = note.blocks.map(convertNoteBlockToStructuredDraftBlock)
  const citations = getStructuredDraftCitationsFromNote(note, blocks)

  return normalizeStructuredNoteDraft({
    blocks,
    citations,
    aphorisms: note.aphorisms?.map((aphorism) => ({
      blockIds: [...aphorism.blockIds],
      id: aphorism.id,
      ...(aphorism.marker ? { marker: aphorism.marker } : {}),
      noteId: aphorism.noteId,
      ...(aphorism.slug ? { slug: aphorism.slug } : {}),
    })),
    id: note.id,
    references: references.map(convertReferenceToStructuredNoteDraftReference),
    title: note.title ?? "",
    ...(updatedAt ? { updatedAt } : {}),
    writtenAt: note.writtenAt,
  })
}

export function convertStructuredNoteDraftToNote(
  draft: StructuredNoteDraft,
  options: {
    slug: string
    status?: NoteStatus
  },
): Note {
  const blocks = draft.blocks.map(convertStructuredBlockToNoteBlock)

  return {
    aphorisms: draft.aphorisms.map((aphorism) => ({
      blockIds: [...aphorism.blockIds],
      id: aphorism.id,
      ...(aphorism.marker ? { marker: aphorism.marker } : {}),
      noteId: draft.id,
      ...(aphorism.slug ? { slug: aphorism.slug } : {}),
    })),
    blocks,
    citations: getStructuredDraftNoteCitations(draft, blocks),
    id: draft.id,
    slug: options.slug,
    status: options.status ?? "draft",
    ...(draft.title.trim() ? { title: draft.title } : {}),
    writtenAt: draft.writtenAt,
  }
}

export function convertStructuredNoteDraftReferences(
  draft: StructuredNoteDraft,
): Reference[] {
  const results: Reference[] = []

  for (const reference of draft.references) {
    const sourceText = reference.sourceText
      ? structuredClone(reference.sourceText)
      : reference.body
        ? createTextDocument(`${reference.id}-source`, reference.body)
        : undefined

    results.push({
      id: reference.id,
      ...(reference.author ? { author: reference.author } : {}),
      ...(reference.authorBirthYear !== undefined
        ? { authorBirthYear: reference.authorBirthYear }
        : {}),
      ...(reference.authorDeathYear !== undefined
        ? { authorDeathYear: reference.authorDeathYear }
        : {}),
      ...(reference.comment
        ? { comment: structuredClone(reference.comment) }
        : {}),
      ...(reference.createdAt ? { createdAt: reference.createdAt } : {}),
      ...(reference.edition ? { edition: reference.edition } : {}),
      ...(sourceText ? { sourceText } : {}),
      ...(reference.target ? { target: structuredClone(reference.target) } : {}),
      ...(reference.translator ? { translator: reference.translator } : {}),
      ...(reference.work ? { work: reference.work } : {}),
      ...(reference.workDate ? { workDate: reference.workDate } : {}),
      ...(reference.updatedAt ? { updatedAt: reference.updatedAt } : {}),
    })
  }

  return results
}

function convertNoteBlockToStructuredDraftBlock(
  block: NoteBlock,
): StructuredNoteDraftBlock {
  if (block.type === "referenceInsert") {
    return {
      id: block.id,
      referenceId: block.referenceId,
      referenceInsertId: block.referenceInsertId,
      ...(block.sourceFragmentFingerprint
        ? { sourceFragmentFingerprint: block.sourceFragmentFingerprint }
        : {}),
      ...(block.sourceVersionId ? { sourceVersionId: block.sourceVersionId } : {}),
      text: getTextDocumentText(block.usedText),
      type: "referenceInsert",
    }
  }

  return {
    id: block.id,
    ...(block.literaryBreakBefore ? { literaryBreakBefore: true } : {}),
    segments: getStructuredDraftSegmentsFromNoteBlock(block),
    type: "paragraph",
    ...(block.type === "aphorism" ? { aphorismId: block.aphorismId } : {}),
    ...(block.type === "aphorism" && block.aphorismMarker
      ? { aphorismMarker: block.aphorismMarker }
      : {}),
  }
}

function getStructuredDraftSegmentsFromNoteBlock(
  block: Extract<NoteBlock, { type: "aphorism" | "paragraph" }>,
): StructuredNoteDraftSegment[] {
  if (block.segments?.length) {
    return block.segments.map((segment) => {
      if (segment.type === "manualIndent") {
        return {
          id: segment.id,
          type: "manualIndent",
        }
      }

      if (segment.type === "inlineMath") {
        return {
          id: segment.id,
          tex: segment.tex,
          type: "inlineMath",
        }
      }

      return {
        id: segment.id,
        text: segment.text,
        type: "text",
        ...(segment.citationId ? { citationId: segment.citationId } : {}),
      }
    })
  }

  return [
    {
      id: `${block.id}-segment-1`,
      text: block.text,
      type: "text",
    }
  ]
}

function getStructuredDraftCitationsFromNote(
  note: Note,
  blocks: readonly StructuredNoteDraftBlock[],
): StructuredNoteDraftCitation[] {
  const paragraphBlocks = blocks.filter(
    (block): block is Extract<StructuredNoteDraftBlock, { type: "paragraph" }> =>
      block.type === "paragraph",
  )

  return (note.citations ?? []).flatMap((citation): StructuredNoteDraftCitation[] => {
    const block = paragraphBlocks.find(
      (item) => item.id === citation.anchor.blockId,
    )
    const segmentId = getStructuredDraftCitationSegmentId(citation, block)

    if (!block || !segmentId) {
      return []
    }

    ensureStructuredDraftSegmentHasCitationId(block, segmentId, citation.id)

    return [
      {
        anchor: {
          ...(citation.anchor.aphorismId
            ? { aphorismId: citation.anchor.aphorismId }
            : block.aphorismId
              ? { aphorismId: block.aphorismId }
              : {}),
          blockId: citation.anchor.blockId,
          offset: citation.anchor.offset,
          ...(citation.anchor.selectedText
            ? { selectedText: citation.anchor.selectedText }
            : {}),
          segmentId,
        },
        id: citation.id,
        noteId: note.id,
        referenceId: citation.referenceId,
      },
    ]
  })
}

function getStructuredDraftCitationSegmentId(
  citation: Citation,
  block: Extract<StructuredNoteDraftBlock, { type: "paragraph" }> | undefined,
) {
  if (!block) {
    return ""
  }

  const explicitSegment = block.segments.find(
    (segment) =>
      segment.type === "text" && segment.id === citation.anchor.segmentId,
  )

  if (explicitSegment) {
    return explicitSegment.id
  }

  const citedSegment = block.segments.find(
    (segment) => segment.type === "text" && segment.citationId === citation.id,
  )

  if (citedSegment) {
    return citedSegment.id
  }

  const offsetSegment = getTextSegmentIdForOffset(block, citation.anchor.offset)

  if (offsetSegment) {
    return offsetSegment
  }

  return block.segments.find((segment) => segment.type === "text")?.id ?? ""
}

function getTextSegmentIdForOffset(
  block: Extract<StructuredNoteDraftBlock, { type: "paragraph" }>,
  offset: number,
) {
  let currentOffset = 0
  let lastTextSegmentId = ""

  for (const segment of block.segments) {
    const segmentText = getStructuredSegmentText(segment)
    const nextOffset = currentOffset + segmentText.length

    if (segment.type === "text") {
      lastTextSegmentId = segment.id

      if (offset >= currentOffset && offset <= nextOffset) {
        return segment.id
      }
    }

    currentOffset = nextOffset
  }

  return offset > currentOffset ? lastTextSegmentId : ""
}

function ensureStructuredDraftSegmentHasCitationId(
  block: Extract<StructuredNoteDraftBlock, { type: "paragraph" }>,
  segmentId: string,
  citationId: string,
) {
  block.segments = block.segments.map((segment) => {
    if (segment.type !== "text" || segment.id !== segmentId) {
      return segment
    }

    return {
      ...segment,
      citationId: segment.citationId ?? citationId,
    }
  })
}

export function convertReferenceToStructuredNoteDraftReference(
  reference: Reference,
): StructuredNoteDraftReference {
  return {
    body: getTextDocumentText(reference.sourceText),
    id: reference.id,
    ...(reference.author ? { author: reference.author } : {}),
    ...(reference.authorBirthYear !== undefined
      ? { authorBirthYear: reference.authorBirthYear }
      : {}),
    ...(reference.authorDeathYear !== undefined
      ? { authorDeathYear: reference.authorDeathYear }
      : {}),
    ...(reference.comment ? { comment: structuredClone(reference.comment) } : {}),
    ...(reference.createdAt ? { createdAt: reference.createdAt } : {}),
    ...(reference.edition ? { edition: reference.edition } : {}),
    ...(reference.sourceText
      ? { sourceText: structuredClone(reference.sourceText) }
      : {}),
    ...(reference.target ? { target: structuredClone(reference.target) } : {}),
    ...(reference.translator ? { translator: reference.translator } : {}),
    ...(reference.work ? { work: reference.work } : {}),
    ...(reference.workDate ? { workDate: reference.workDate } : {}),
    ...(reference.updatedAt ? { updatedAt: reference.updatedAt } : {}),
  }
}

function convertStructuredBlockToNoteBlock(
  block: StructuredNoteDraftBlock,
): NoteBlock {
  if (block.type === "referenceInsert") {
      return {
        id: block.id,
        referenceId: block.referenceId,
        referenceInsertId: block.referenceInsertId,
        ...(block.sourceFragmentFingerprint
          ? { sourceFragmentFingerprint: block.sourceFragmentFingerprint }
          : {}),
        ...(block.sourceVersionId
          ? { sourceVersionId: block.sourceVersionId }
          : {}),
        type: "referenceInsert",
        usedText: createTextDocument(`${block.id}-text`, block.text),
      }
  }

  const segments = block.segments.map(convertStructuredSegmentToNoteSegment)
  const text = block.segments.map(getStructuredSegmentText).join("")

  if (block.aphorismId) {
    return {
      aphorismId: block.aphorismId,
      ...(block.aphorismMarker ? { aphorismMarker: block.aphorismMarker } : {}),
      id: block.id,
      ...(block.literaryBreakBefore ? { literaryBreakBefore: true } : {}),
      segments,
      text,
      type: "aphorism",
    }
  }

  return {
    id: block.id,
    ...(block.literaryBreakBefore ? { literaryBreakBefore: true } : {}),
    segments,
    text,
    type: "paragraph",
  }
}

function convertStructuredSegmentToNoteSegment(
  segment: StructuredNoteDraftSegment,
): TextBlockSegment {
  if (segment.type === "manualIndent") {
    return {
      id: segment.id,
      type: "manualIndent",
    }
  }

  if (segment.type === "inlineMath") {
    return {
      id: segment.id,
      tex: segment.tex,
      type: "inlineMath",
    }
  }

  return {
    id: segment.id,
    ...(segment.citationId ? { citationId: segment.citationId } : {}),
    text: segment.text,
    type: "text",
  }
}

function getStructuredDraftNoteCitations(
  draft: StructuredNoteDraft,
  blocks: readonly NoteBlock[],
): Citation[] {
  const noteBlocksById = new Map(blocks.map((block) => [block.id, block]))

  return draft.citations.flatMap((citation): Citation[] => {
    if (!citation.referenceId) {
      return []
    }

    const block = noteBlocksById.get(citation.anchor.blockId)
    const offset =
      citation.anchor.offset ?? getCitationOffset(block, citation.anchor.segmentId)

    return [
      {
        anchor: {
          ...(citation.anchor.aphorismId
            ? { aphorismId: citation.anchor.aphorismId }
            : {}),
          blockId: citation.anchor.blockId,
          offset,
          segmentId: citation.anchor.segmentId,
          ...(citation.anchor.selectedText
            ? { selectedText: citation.anchor.selectedText }
            : {}),
        },
        id: citation.id,
        noteId: draft.id,
        referenceId: citation.referenceId,
      },
    ]
  })
}

function getCitationOffset(block: NoteBlock | undefined, segmentId: string) {
  if (
    !block ||
    (block.type !== "paragraph" && block.type !== "aphorism") ||
    !block.segments?.length
  ) {
    return 0
  }

  let offset = 0

  for (const segment of block.segments) {
    const segmentText = getStructuredSegmentText(segment)

    if (segment.id === segmentId) {
      return offset + segmentText.length
    }

    offset += segmentText.length
  }

  return 0
}

function getStructuredSegmentText(segment: StructuredNoteDraftSegment) {
  switch (segment.type) {
    case "inlineMath":
      return segment.tex
    case "manualIndent":
      return ""
    case "text":
      return segment.text
    default:
      return assertNever(segment)
  }
}

function getTextDocumentText(draft: TextDocument | undefined) {
  return draft?.blocks.map((block) => block.text).join("\n\n") ?? ""
}

import type {
  ReferenceTarget,
  TextDocument,
} from "../domain-types"

export type StructuredNoteDraftAphorismMarker = {
  countsInSequence: boolean
  value: string
}

export type StructuredNoteDraftSegment =
  | {
      citationId?: string
      id: string
      text: string
      type: "text"
    }
  | {
      id: string
      tex: string
      type: "inlineMath"
    }
  | {
      id: string
      type: "manualIndent"
    }

export type StructuredNoteDraftParagraphBlock = {
  aphorismId?: string
  aphorismMarker?: StructuredNoteDraftAphorismMarker
  id: string
  literaryBreakBefore?: boolean
  segments: StructuredNoteDraftSegment[]
  type: "paragraph"
}

export type StructuredNoteDraftReferenceInsertBlock = {
  id: string
  referenceId: string
  referenceInsertId: string
  sourceFragmentFingerprint?: string
  sourceVersionId?: string
  text: string
  type: "referenceInsert"
}

export type StructuredNoteDraftBlock =
  | StructuredNoteDraftParagraphBlock
  | StructuredNoteDraftReferenceInsertBlock

export type StructuredNoteDraftAphorism = {
  blockIds: string[]
  id: string
  marker?: StructuredNoteDraftAphorismMarker
  noteId: string
  slug?: string
}

export type StructuredNoteDraftCitation = {
  anchor: {
    aphorismId?: string
    blockId: string
    offset?: number
    segmentId: string
    selectedText?: string
  }
  id: string
  noteId: string
  referenceId?: string
}

export type StructuredNoteDraftCitationCandidate = {
  citation: StructuredNoteDraftCitation
  sourceId: string
}

export type StructuredNoteDraftReference = {
  author?: string
  authorBirthYear?: number
  authorDeathYear?: number
  body: string
  comment?: TextDocument
  createdAt?: string
  edition?: string
  id: string
  sourceText?: TextDocument
  target?: ReferenceTarget
  translator?: string
  work?: string
  workDate?: string
  updatedAt?: string
}

export type StructuredNoteDraftWarning = {
  code:
    | "discontinuous-aphorism"
    | "duplicate-block-id"
    | "missing-reference-insert-reference"
    | "unresolved-citation"
  detail: string
  id?: string
}

export type StructuredNoteDraft = {
  aphorisms: StructuredNoteDraftAphorism[]
  blocks: StructuredNoteDraftBlock[]
  citations: StructuredNoteDraftCitation[]
  id: string
  persistence: {
    safeForCurrentNoteModel: boolean
    unsupportedFeatures: string[]
  }
  references: StructuredNoteDraftReference[]
  source: {
    kind: "structuredNoteDraft"
    version: 1
  }
  title: string
  updatedAt?: string
  warnings: StructuredNoteDraftWarning[]
  writtenAt: string
}

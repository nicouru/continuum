export type NoteStatus = "draft" | "published" | "archived" | "trashed"

export type TextSegment = {
  citationId?: string
  id: string
  text: string
  type: "text"
}

export type InlineMathSegment = {
  id: string
  tex: string
  type: "inlineMath"
}

export type ManualIndentSegment = {
  id: string
  type: "manualIndent"
}

export type TextBlockSegment =
  | TextSegment
  | InlineMathSegment
  | ManualIndentSegment

export type AphorismMarker = {
  countsInSequence: boolean
  value: string
}

type TextBlockBase = {
  id: string
  literaryBreakBefore?: boolean
  segments?: TextBlockSegment[]
  text: string
}

export type ParagraphBlock = TextBlockBase & {
  type: "paragraph"
}

export type TextDocument = {
  blocks: ParagraphBlock[]
}

export type AphorismBlock = TextBlockBase & {
  aphorismMarker?: AphorismMarker
  type: "aphorism"
  aphorismId: string
}

export type ReferenceInsertBlock = {
  id: string
  type: "referenceInsert"
  referenceInsertId: string
  referenceId: string
  usedText: TextDocument
  sourceVersionId?: string
  sourceFragmentFingerprint?: string
}

export type NoteBlock = ParagraphBlock | AphorismBlock | ReferenceInsertBlock

export type Aphorism = {
  id: string
  marker?: AphorismMarker
  noteId: string
  blockIds: string[]
  slug?: string
}

export type ShareTarget =
  | { kind: "note"; noteId: string }
  | { kind: "aphorism"; noteId: string; aphorismId: string }

export type Note = {
  id: string
  slug: string
  writtenAt: string
  title?: string
  status: NoteStatus
  blocks: NoteBlock[]
  aphorisms?: Aphorism[]
  citations?: Citation[]
}

export type ReferenceTarget =
  | { kind: "external" }
  | { kind: "aphorism"; aphorismId: string }
  | { kind: "note"; noteId: string }

export type Reference = {
  id: string
  sourceText?: TextDocument
  comment?: TextDocument
  author?: string
  work?: string
  workDate?: string
  authorBirthYear?: number
  authorDeathYear?: number
  translator?: string
  edition?: string
  target?: ReferenceTarget
  createdAt?: string
  updatedAt?: string
}

export type CitationAnchor = {
  aphorismId?: string
  blockId: string
  offset: number
  segmentId?: string
  selectedText?: string
}

export type Citation = {
  id: string
  noteId: string
  referenceId: string
  anchor: CitationAnchor
}

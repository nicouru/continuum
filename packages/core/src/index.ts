export * from "./domain-types"
export * from "./guards"
export * from "./dates"
export * from "./index-text"
export type {
  StructuredNoteDraft,
  StructuredNoteDraftAphorismMarker,
  StructuredNoteDraftSegment,
  StructuredNoteDraftParagraphBlock,
  StructuredNoteDraftReferenceInsertBlock,
  StructuredNoteDraftBlock,
  StructuredNoteDraftAphorism,
  StructuredNoteDraftCitation,
  StructuredNoteDraftCitationCandidate,
  StructuredNoteDraftReference,
  StructuredNoteDraftWarning,
} from "./structured-note-draft/types"
export * from "./structured-note-draft/validation"
export {
  normalizeStructuredNoteDraft,
  createEmptyStructuredNoteDraft,
  normalizeStructuredDraftReferences,
} from "./structured-note-draft/normalization"
export {
  createNewStructuredNoteDraft,
  convertNoteToStructuredDraft,
  convertStructuredNoteDraftToNote,
  convertStructuredNoteDraftReferences,
  convertReferenceToStructuredNoteDraftReference,
} from "./structured-note-draft/conversion"
export {
  assertNever,
  createTextDocument,
  getNonEmptyString,
  getUniqueInputId,
  isRecord,
  toStructuredDraftDateInput,
  toStructuredDraftTimestampId,
} from "./structured-note-draft/utils"

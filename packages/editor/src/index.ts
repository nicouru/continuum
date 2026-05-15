export { adminTipTapExtensions } from "./extensions"
export {
  normalizeEditorIdentity,
  syncReferenceInsertLabels,
  makeId,
  makeDeterministicSplitId,
  getStringAttribute,
} from "./editor-identity"
export {
  formatReferenceLabel,
  filterReferences,
  getReferenceLabelById,
} from "./editor-references"
export type {
  EditableTextBlock,
  ActiveCitationDetails,
  ActiveReferenceInsertDetails,
  ActiveInlineMathDetails,
  ActiveBlockDetails,
} from "./editor-queries"
export {
  getSelectedText,
  getSelectedEditableTextBlocks,
  getCurrentEditableTextBlock,
  getPreviousAphorismId,
  getNextCitationNumber,
} from "./editor-queries"
export {
  createTipTapPrototypeDocumentFromStructuredDraft,
  createStructuredDraftFromTipTapPrototypeDocument,
  type TipTapPrototypeDocument,
} from "./tiptap-document"
export type { TipTapJsonNode, TipTapJsonMark } from "./tiptap-types"
export { serializeTipTapClipboardNodesToPlainText } from "./tiptap-clipboard"
export {
  addCitationToSelection,
  removeCitationFromSelection,
  associateReferenceWithActiveCitation,
  clearReferenceFromActiveCitation,
  associateReferenceWithActiveReferenceInsert,
  clearReferenceFromActiveReferenceInsert,
  convertSelectionToReferenceInsert,
} from "./reference-actions"
export { convertMarkdownInlineMath } from "./math-actions"
export {
  markCurrentBlockAsAphorism,
  joinCurrentBlockToPreviousAphorism,
  markAllParagraphsAsAphorisms,
} from "./aphorism-actions"
export {
  ContinuumEditor,
  continuumBootstrapPrototype,
  type ContinuumEditorPayload,
  type ContinuumEditorProps,
} from "./ContinuumEditor"

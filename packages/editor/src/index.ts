export { adminTipTapExtensions } from "./extensions"
export {
  normalizeEditorIdentity,
  syncReferenceInsertLabels,
  makeId,
  makeDeterministicSplitId,
  getStringAttribute,
} from "./editor-identity"
export {
  CONTINUUM_TRAILING_NODE_NOT_AFTER,
  createContinuumStarterKit,
} from "./editor-starter-kit"
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
  getFirstInlineMathInSelection,
  getActiveCitationDetails,
  getActiveReferenceInsertDetails,
  getActiveInlineMathDetails,
  getActiveBlockDetails,
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
  separateAphorismFromCurrentBlock,
  unmarkCurrentBlockAsAphorism,
} from "./aphorism-actions"
export {
  ContinuumEditor,
  continuumBootstrapPrototype,
  type ContinuumCitationClickDetails,
  type ContinuumEditorPayload,
  type ContinuumEditorProps,
} from "./ContinuumEditor"

import type { Editor } from "@tiptap/core"

import type {
  StructuredNoteDraft,
  StructuredNoteDraftReference,
} from "@continuum/core"
import { getStringAttribute } from "./editor-identity"

export type EditableTextBlock = {
  attrs: Record<string, unknown>
  position: number
  typeName: string
}

export type ActiveCitationDetails = {
  aphorismId?: string
  blockId?: string
  citationId: string
  reference?: StructuredNoteDraftReference
  referenceId?: string
  segmentId?: string
  selectedText?: string
  visibleNumber: string
}

export type ActiveReferenceInsertDetails = {
  blockId: string
  reference?: StructuredNoteDraftReference
  referenceId?: string
  referenceInsertId: string
  text: string
}

export type ActiveInlineMathDetails = {
  from: number
  mathId: string
  tex: string
  to: number
}

export type ActiveBlockDetails = {
  aphorismBlockCount: number
  aphorismId?: string
  blockId: string
  typeName: string
}

export function getSelectedText(editor: Editor | null) {
  if (!editor || editor.state.selection.empty) {
    return ""
  }

  const { from, to } = editor.state.selection

  return editor.state.doc.textBetween(from, to, "\n")
}

export function getSelectedEditableTextBlocks(
  editor: Editor,
): EditableTextBlock[] {
  if (editor.state.selection.empty) {
    return []
  }

  const blocks: EditableTextBlock[] = []
  const { from, to } = editor.state.selection

  editor.state.doc.nodesBetween(from, to, (node, position) => {
    if (!isEditableTextBlockType(node.type.name)) {
      return
    }

    if (!node.textContent.trim()) {
      return false
    }

    blocks.push({
      attrs: node.attrs,
      position,
      typeName: node.type.name,
    })

    return false
  })

  return blocks
}

export function getCurrentEditableTextBlock(
  editor: Editor,
): EditableTextBlock | null {
  const cursorPosition = editor.state.selection.from
  let currentBlock: EditableTextBlock | null = null

  editor.state.doc.descendants((node, position) => {
    if (!isEditableTextBlockType(node.type.name)) {
      return
    }

    const endPosition = position + node.nodeSize

    if (cursorPosition < position || cursorPosition > endPosition) {
      return false
    }

    currentBlock = {
      attrs: node.attrs,
      position,
      typeName: node.type.name,
    }

    return false
  })

  return currentBlock
}

export function getPreviousAphorismId(
  editor: Editor,
  currentPosition: number,
): string | undefined {
  let previousAphorismId: string | undefined

  editor.state.doc.descendants((node, position) => {
    if (position >= currentPosition) {
      return false
    }

    if (!isEditableTextBlockType(node.type.name)) {
      return
    }

    const aphorismId = getStringAttribute(node.attrs, "aphorismId")

    if (aphorismId) {
      previousAphorismId = aphorismId
    }

    return false
  })

  return previousAphorismId
}

export function isEditableTextBlockType(typeName: string) {
  return (
    typeName === "aphorism" ||
    typeName === "paragraph" ||
    typeName === "structuredParagraph"
  )
}

export function getNextCitationNumber(editor: Editor) {
  const citationIds = new Set<string>()

  editor.state.doc.descendants((node) => {
    if (!node.isText) {
      return
    }

    for (const mark of node.marks) {
      if (mark.type.name !== "citation") {
        continue
      }

      const citationId = getStringAttribute(mark.attrs, "citationId")

      if (citationId) {
        citationIds.add(citationId)
      }
    }
  })

  return citationIds.size + 1
}

export function getInlineMathAroundCursor(editor: Editor) {
  const cursor = editor.state.selection.$from
  const before = cursor.nodeBefore
  const after = cursor.nodeAfter

  if (before?.type.name === "inlineMath") {
    return {
      attrs: before.attrs,
      from: cursor.pos - before.nodeSize,
      to: cursor.pos,
    }
  }

  if (after?.type.name === "inlineMath") {
    return {
      attrs: after.attrs,
      from: cursor.pos,
      to: cursor.pos + after.nodeSize,
    }
  }

  return null
}

export function getFirstInlineMathInSelection(editor: Editor) {
  const { from, to } = editor.state.selection
  let activeNode: {
    attrs: Record<string, unknown>
    from: number
    to: number
  } | null = null

  editor.state.doc.nodesBetween(from, to, (node, position) => {
    if (activeNode || node.type.name !== "inlineMath") {
      return
    }

    activeNode = {
      attrs: node.attrs,
      from: position,
      to: position + node.nodeSize,
    }

    return false
  })

  return activeNode
}

export function getActiveCitationDetails(
  editor: Editor | null,
  draft: StructuredNoteDraft,
): ActiveCitationDetails | null {
  if (!editor) {
    return null
  }

  const attrs = editor.getAttributes("citation")
  const citationId = getStringAttribute(attrs, "citationId")

  if (!citationId) {
    return null
  }

  const citation = draft.citations.find((item) => item.id === citationId)
  const referenceId =
    citation?.referenceId ?? getStringAttribute(attrs, "referenceId")
  const reference = referenceId
    ? draft.references.find((item) => item.id === referenceId)
    : undefined

  return {
    aphorismId: citation?.anchor.aphorismId,
    blockId: citation?.anchor.blockId,
    citationId,
    reference,
    referenceId,
    segmentId: citation?.anchor.segmentId,
    selectedText: citation?.anchor.selectedText,
    visibleNumber: getStringAttribute(attrs, "visibleNumber") ?? "",
  }
}

export function getActiveReferenceInsertDetails(
  editor: Editor | null,
  draft: StructuredNoteDraft,
): ActiveReferenceInsertDetails | null {
  if (!editor || !editor.isActive("referenceInsert")) {
    return null
  }

  const attrs = editor.getAttributes("referenceInsert")
  const blockId = getStringAttribute(attrs, "blockId")
  const referenceInsertId = getStringAttribute(attrs, "referenceInsertId")

  if (!blockId || !referenceInsertId) {
    return null
  }

  const block = draft.blocks.find(
    (item) => item.type === "referenceInsert" && item.id === blockId,
  )
  const referenceId =
    block?.type === "referenceInsert" && block.referenceId
      ? block.referenceId
      : getStringAttribute(attrs, "referenceId")
  const reference = referenceId
    ? draft.references.find((item) => item.id === referenceId)
    : undefined

  return {
    blockId,
    reference,
    referenceId,
    referenceInsertId,
    text: block?.type === "referenceInsert" ? block.text : "",
  }
}

export function getActiveInlineMathDetails(
  editor: Editor | null,
): ActiveInlineMathDetails | null {
  if (!editor) {
    return null
  }

  const { selection } = editor.state
  const activeNode =
    selection.empty
      ? getInlineMathAroundCursor(editor)
      : getFirstInlineMathInSelection(editor)

  if (!activeNode) {
    return null
  }

  return {
    from: activeNode.from,
    mathId: getStringAttribute(activeNode.attrs, "mathId") ?? "",
    tex: getStringAttribute(activeNode.attrs, "tex") ?? "",
    to: activeNode.to,
  }
}

export function getActiveBlockDetails(
  editor: Editor | null,
  draft: StructuredNoteDraft,
): ActiveBlockDetails | null {
  if (!editor) {
    return null
  }

  const currentBlock = getCurrentEditableTextBlock(editor)

  if (!currentBlock) {
    return null
  }

  const blockId = getStringAttribute(currentBlock.attrs, "blockId")

  if (!blockId) {
    return null
  }

  const draftBlock = draft.blocks.find((block) => block.id === blockId)
  const aphorismId =
    draftBlock?.type === "paragraph"
      ? draftBlock.aphorismId
      : getStringAttribute(currentBlock.attrs, "aphorismId")
  const aphorism = aphorismId
    ? draft.aphorisms.find((item) => item.id === aphorismId)
    : undefined

  return {
    aphorismBlockCount: aphorism?.blockIds.length ?? 0,
    aphorismId,
    blockId,
    typeName: currentBlock.typeName,
  }
}

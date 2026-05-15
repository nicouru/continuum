
import type { Editor } from "@tiptap/core"

import { getAphorismSeparationPositions } from "./tiptap-aphorism-boundaries"
import {
  getStringAttribute,
  makeId,
  normalizeEditorIdentity,
} from "./editor-identity"
import {
  getCurrentEditableTextBlock,
  getPreviousAphorismId,
  getSelectedEditableTextBlocks,
  isEditableTextBlockType,
  type EditableTextBlock,
} from "./editor-queries"

export function markCurrentBlockAsAphorism(editor: Editor | null) {
  if (!editor) {
    return
  }

  const selectedBlocks = getSelectedEditableTextBlocks(editor)

  if (selectedBlocks.length > 0) {
    markEditableBlocksAsSeparateAphorisms(editor, selectedBlocks)
    return
  }

  const currentBlock = getCurrentEditableTextBlock(editor)

  if (!currentBlock) {
    return
  }

  markEditableBlocksAsSeparateAphorisms(editor, [currentBlock])
}

export function joinCurrentBlockToPreviousAphorism(editor: Editor | null) {
  if (!editor) {
    return
  }

  const currentBlock = getCurrentEditableTextBlock(editor)

  if (!currentBlock) {
    return
  }

  const previousAphorismId = getPreviousAphorismId(editor, currentBlock.position)

  if (!previousAphorismId) {
    return
  }

  markEditableBlocksAsAphorism(editor, [currentBlock], previousAphorismId)
}

function markEditableBlocksAsAphorism(
  editor: Editor,
  blocks: readonly EditableTextBlock[],
  aphorismId = getFirstAphorismId(blocks) ?? makeId("tiptap-aphorism"),
) {
  const aphorismType = editor.schema.nodes.aphorism

  if (!aphorismType || blocks.length === 0) {
    return
  }

  let transaction = editor.state.tr

  for (const block of blocks) {
    transaction = transaction.setNodeMarkup(block.position, aphorismType, {
      aphorismId,
      blockId: getStringAttribute(block.attrs, "blockId") ?? makeId("tiptap-block"),
      markerCountsInSequence: true,
      markerValue: null,
      visibleLabel: "",
    })
  }

  editor.view.dispatch(transaction)
  normalizeEditorIdentity(editor)
}

function markEditableBlocksAsSeparateAphorisms(
  editor: Editor,
  blocks: readonly EditableTextBlock[],
) {
  const aphorismType = editor.schema.nodes.aphorism

  if (!aphorismType || blocks.length === 0) {
    return
  }

  let transaction = editor.state.tr
  const preserveExistingAphorismId = blocks.length === 1

  for (const block of blocks) {
    transaction = transaction.setNodeMarkup(block.position, aphorismType, {
      aphorismId:
        (preserveExistingAphorismId
          ? getStringAttribute(block.attrs, "aphorismId")
          : undefined) ?? makeId("tiptap-aphorism"),
      blockId: getStringAttribute(block.attrs, "blockId") ?? makeId("tiptap-block"),
      markerCountsInSequence: true,
      markerValue: null,
      visibleLabel: "",
    })
  }

  editor.view.dispatch(transaction)
  normalizeEditorIdentity(editor)
}

function getFirstAphorismId(blocks: readonly EditableTextBlock[]) {
  for (const block of blocks) {
    const aphorismId = getStringAttribute(block.attrs, "aphorismId")

    if (aphorismId) {
      return aphorismId
    }
  }

  return undefined
}

export function markAllParagraphsAsAphorisms(editor: Editor | null) {
  if (!editor) {
    return
  }

  let transaction = editor.state.tr
  let changed = false

  editor.state.doc.descendants((node, position) => {
    if (node.type.name === "aphorism") {
      return
    }

    if (
      node.type.name !== "paragraph" &&
      node.type.name !== "structuredParagraph"
    ) {
      return
    }

    if (!node.textContent.trim()) {
      return
    }

    transaction = transaction.setNodeMarkup(position, editor.schema.nodes.aphorism, {
      aphorismId: makeId("tiptap-aphorism"),
      blockId:
        getStringAttribute(node.attrs, "blockId") ?? makeId("tiptap-block"),
      markerCountsInSequence: true,
      markerValue: null,
      visibleLabel: "",
    })
    changed = true
  })

  if (!changed) {
    return
  }

  editor.view.dispatch(transaction)
  normalizeEditorIdentity(editor)
}

export function unmarkCurrentBlockAsAphorism(
  editor: Editor | null,
  setPersistenceStatus?: (status: string) => void,
) {
  if (!editor) {
    return
  }

  const selectedBlocks = getSelectedEditableTextBlocks(editor)

  if (selectedBlocks.length > 0) {
    unmarkEditableTextBlocks(editor, selectedBlocks, setPersistenceStatus)
    return
  }

  const currentBlock = getCurrentEditableTextBlock(editor)

  if (!currentBlock) {
    return
  }

  unmarkEditableTextBlocks(editor, [currentBlock], setPersistenceStatus)
}

export function separateAphorismFromCurrentBlock(
  editor: Editor | null,
  setPersistenceStatus?: (status: string) => void,
) {
  if (!editor) {
    return
  }

  const currentBlock = getCurrentEditableTextBlock(editor)
  const aphorismId = currentBlock
    ? getStringAttribute(currentBlock.attrs, "aphorismId")
    : undefined

  if (!currentBlock || !aphorismId) {
    return
  }

  const editableBlocks: EditableTextBlock[] = []

  editor.state.doc.descendants((node, position) => {
    if (!isEditableTextBlockType(node.type.name)) {
      return
    }

    editableBlocks.push({
      attrs: node.attrs,
      position,
      typeName: node.type.name,
    })

    return false
  })

  const positionsToUnmark = new Set(
    getAphorismSeparationPositions(
      editableBlocks.map((block) => ({
        aphorismId: getStringAttribute(block.attrs, "aphorismId"),
        position: block.position,
      })),
      currentBlock.position,
    ),
  )
  const blocksToUnmark = editableBlocks.filter((block) =>
    positionsToUnmark.has(block.position),
  )

  unmarkEditableTextBlocks(editor, blocksToUnmark)

  if (blocksToUnmark.length > 0) {
    setPersistenceStatus?.("Aforismo separado desde este parrafo.")
  }
}

function unmarkEditableTextBlocks(
  editor: Editor,
  blocks: readonly EditableTextBlock[],
  setPersistenceStatus?: (status: string) => void,
) {
  const paragraphType = editor.schema.nodes.structuredParagraph

  if (!paragraphType || blocks.length === 0) {
    return
  }

  if (wouldCreateDiscontinuousAphorism(editor, blocks)) {
    setPersistenceStatus?.(
      "No se puede quitar solo ese parrafo: dejaria un aforismo partido. Usa Separar desde aqui.",
    )
    return
  }

  let transaction = editor.state.tr

  for (const block of blocks) {
    transaction = transaction.setNodeMarkup(block.position, paragraphType, {
      blockId: getStringAttribute(block.attrs, "blockId") ?? makeId("tiptap-block"),
    })
  }

  editor.view.dispatch(transaction)
  normalizeEditorIdentity(editor)
  setPersistenceStatus?.("Marca de aforismo quitada.")
}

function wouldCreateDiscontinuousAphorism(
  editor: Editor,
  blocksToUnmark: readonly EditableTextBlock[],
) {
  const positionsToUnmark = new Set(blocksToUnmark.map((block) => block.position))
  const aphorismIdsToCheck = new Set(
    blocksToUnmark
      .map((block) => getStringAttribute(block.attrs, "aphorismId"))
      .filter((id): id is string => Boolean(id)),
  )

  if (aphorismIdsToCheck.size === 0) {
    return false
  }

  for (const aphorismId of aphorismIdsToCheck) {
    let seen = false
    let gapAfterSeen = false
    let discontinuous = false

    editor.state.doc.descendants((node, position) => {
      if (!isEditableTextBlockType(node.type.name)) {
        return
      }

      const nextAphorismId = positionsToUnmark.has(position)
        ? undefined
        : getStringAttribute(node.attrs, "aphorismId")

      if (nextAphorismId === aphorismId) {
        if (gapAfterSeen) {
          discontinuous = true
          return false
        }

        seen = true
        return false
      }

      if (seen) {
        gapAfterSeen = true
      }

      return false
    })

    if (discontinuous) {
      return true
    }
  }

  return false
}
